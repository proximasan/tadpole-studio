import asyncio
import json
import threading
import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from loguru import logger

from tadpole_studio.models.generation import (
    GenerateRequest,
    GenerateResponse,
    JobStatusResponse,
    FormatRequest,
    FormatResponse,
    SampleRequest,
    SampleResponse,
    GenerateTitleRequest,
    GenerateTitleResponse,
)
from tadpole_studio.db.connection import get_db
from tadpole_studio.services.generation import generation_service
from tadpole_studio.ws.manager import generation_ws_manager
from tadpole_studio.services.gpu_lock import gpu_lock

class GenerationCancelled(Exception):
    """Raised inside progress_callback when a job has been cancelled."""
    pass


class _LMProgressInterpolator:
    """Wraps a progress callback to provide smooth interpolation during blocking LM phases.

    ACE-Step's LLM handler only emits two sparse progress updates: 0.1 (Phase 1 start)
    and 0.5 (Phase 2 start). Between these, generation blocks for seconds to minutes
    with zero feedback. This wrapper intercepts those values, remaps them to compressed
    ranges, and runs timer threads that smoothly fill the gaps:

      ACE-Step 0.1 → emit 0.05, timer fills 0.05→0.09 (Phase 1: CoT metadata)
      ACE-Step 0.5 → emit 0.1,  timer fills 0.1→0.49  (Phase 2: audio codes)
      Next value >0.5 → emit 0.5 "LM complete", pass through (DiT phase)

    The timer uses a logarithmic curve that asymptotically approaches the target,
    so the progress bar always keeps moving regardless of generation duration.
    """

    # ACE-Step LM milestones to intercept
    _PHASE1_VALUE = 0.1
    _PHASE2_VALUE = 0.5

    def __init__(self, real_callback):
        self._real_callback = real_callback
        self._stop_event = None
        self._thread = None
        self._last_lm_value = 0.0
        self._lm_complete = False

    def __call__(self, value, desc=""):
        # Once LM is done, pass everything through unchanged
        if self._lm_complete:
            self._real_callback(value, desc)
            return

        # Intercept Phase 1 start (0.1 from ACE-Step)
        if abs(value - self._PHASE1_VALUE) < 0.01 and self._last_lm_value < self._PHASE1_VALUE:
            self._stop_timer()
            self._last_lm_value = value
            self._real_callback(0.05, desc)
            self._start_timer(0.05, 0.09, desc, half_life=10.0)
            return

        # Intercept Phase 2 start (0.5 from ACE-Step)
        if abs(value - self._PHASE2_VALUE) < 0.01 and self._last_lm_value < self._PHASE2_VALUE:
            self._stop_timer()
            self._last_lm_value = value
            self._real_callback(0.1, desc)
            self._start_timer(0.1, 0.49, desc, half_life=45.0)
            return

        # First value after Phase 2 (>0.5) means LM is done, DiT is starting
        if value > self._PHASE2_VALUE and self._last_lm_value >= self._PHASE2_VALUE:
            self._stop_timer()
            self._lm_complete = True
            self._real_callback(0.5, "LM generation complete")
            self._real_callback(value, desc)
            return

        # Pass through any other values (e.g. values before LM starts)
        self._last_lm_value = value
        self._real_callback(value, desc)

    def _start_timer(self, start_val, end_val, desc, half_life):
        self._stop_timer()
        evt = threading.Event()

        def _runner():
            t0 = time.time()
            while not evt.is_set():
                elapsed = time.time() - t0
                frac = 1.0 - 1.0 / (1.0 + elapsed / half_life)
                value = start_val + (end_val - start_val) * frac
                try:
                    self._real_callback(value, desc)
                except Exception:
                    break
                evt.wait(1.0)

        thread = threading.Thread(target=_runner, name="lm-progress", daemon=True)
        thread.start()
        self._stop_event = evt
        self._thread = thread

    def _stop_timer(self):
        if self._stop_event is not None:
            self._stop_event.set()
            self._thread.join(timeout=1.0)
            self._stop_event = None
            self._thread = None

    def cleanup(self):
        """Stop any running timer thread."""
        self._stop_timer()


router = APIRouter(prefix="/generate", tags=["generation"])


@router.get("/gpu-status")
async def get_gpu_status() -> dict:
    return {"locked": gpu_lock.is_locked, "holder": gpu_lock.holder}


@router.post("", response_model=GenerateResponse)
async def submit_generation(request: GenerateRequest) -> GenerateResponse:
    svc = generation_service

    # Check readiness of the selected backend
    from tadpole_studio.backends.base import BackendType
    try:
        selected_backend_type = BackendType(request.backend)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Unknown backend: {request.backend}")

    backend = svc.get_backend(selected_backend_type)
    if backend is None:
        raise HTTPException(status_code=503, detail=f"Backend '{request.backend}' not registered")
    if not backend.is_ready:
        if selected_backend_type == BackendType.ACE_STEP:
            raise HTTPException(status_code=503, detail="DiT model not loaded")
        raise HTTPException(status_code=503, detail=f"Backend '{request.backend}' not initialized")

    job_id = svc.create_job()

    asyncio.create_task(_run_generation(job_id, request))

    return GenerateResponse(job_id=job_id, status="queued")


async def _run_generation(job_id: str, request: GenerateRequest) -> None:
    svc = generation_service

    # Check cancellation before waiting for GPU
    if svc.is_cancelled(job_id):
        logger.info(f"Job {job_id} cancelled before GPU acquire")
        await generation_ws_manager.broadcast({
            "type": "failed", "job_id": job_id, "error": "Cancelled by user",
        })
        return

    current_holder = gpu_lock.holder
    if gpu_lock.is_locked:
        await generation_ws_manager.broadcast({
            "type": "progress",
            "job_id": job_id,
            "progress": 0.0,
            "stage": f"Waiting for GPU (in use by {current_holder})...",
        })

    await gpu_lock.await_acquire("generation")

    # Check cancellation after acquiring GPU
    if svc.is_cancelled(job_id):
        logger.info(f"Job {job_id} cancelled after GPU acquire")
        await gpu_lock.release("generation")
        await generation_ws_manager.broadcast({
            "type": "failed", "job_id": job_id, "error": "Cancelled by user",
        })
        return

    started_at = datetime.now(timezone.utc)
    history_id = str(uuid.uuid4())
    params_dict = request.model_dump()

    # Inject LoRA state so it's captured in generation history
    from tadpole_studio.services.lora_service import lora_service
    lora_snapshot = lora_service.get_lora_snapshot()
    if lora_snapshot:
        params_dict["lora"] = lora_snapshot

    # Inject active model names so history records which models were used
    if request.backend == "heartmula":
        if svc.active_heartmula_model:
            params_dict["heartmula_model"] = svc.active_heartmula_model
    else:
        if svc.active_dit_model:
            params_dict["dit_model"] = svc.active_dit_model
        if svc.active_lm_model:
            params_dict["lm_model"] = svc.active_lm_model

    # Insert initial history record
    try:
        db = await get_db()
        await db.execute(
            """INSERT INTO generation_history (id, task_type, status, params_json, started_at, created_at, backend)
               VALUES (?, ?, 'running', ?, ?, ?, ?)""",
            (history_id, request.task_type, json.dumps(params_dict),
             started_at.isoformat(), started_at.isoformat(), request.backend),
        )
        await db.commit()
    except Exception as e:
        logger.warning(f"Failed to insert generation history: {e}")

    svc.update_job(job_id, status="running", stage="preparing")
    progress_msg: dict = {
        "type": "progress",
        "job_id": job_id,
        "progress": 0.0,
        "stage": "preparing",
    }
    if request.backend == "ace-step":
        progress_msg["step"] = 0
        progress_msg["total_steps"] = request.inference_steps
    await generation_ws_manager.broadcast(progress_msg)

    # Check cancellation before title generation
    if svc.is_cancelled(job_id):
        logger.info(f"Job {job_id} cancelled before title generation")
        await gpu_lock.release("generation")
        await generation_ws_manager.broadcast({
            "type": "failed", "job_id": job_id, "error": "Cancelled by user",
        })
        return

    # Generate title before music generation (while GPU lock is held)
    # This avoids the MLX chat model having to reload after DiT runs
    title_source = request.caption or request.heartmula_tags
    if request.auto_title and title_source:
        try:
            from tadpole_studio.services.title_generator import generate_song_title
            title = await generate_song_title(
                title_source, "", "", "Untitled",
            )
            # Persist to history
            try:
                db = await get_db()
                await db.execute(
                    "UPDATE generation_history SET title = ? WHERE id = ?",
                    (title, history_id),
                )
                await db.commit()
            except Exception as e:
                logger.warning(f"Failed to save title to history: {e}")

            # Broadcast title to frontend
            await generation_ws_manager.broadcast({
                "type": "title",
                "job_id": job_id,
                "history_id": history_id,
                "title": title,
            })
        except Exception as e:
            logger.warning(f"Pre-generation title generation failed: {e}")

        # Flush Qwen chat model tensors before DiT loads
        import gc
        gc.collect()

    # Update progress after title generation completes (or was skipped)
    svc.update_job(job_id, progress=0.02, stage="Starting generation...")
    await generation_ws_manager.broadcast({
        "type": "progress",
        "job_id": job_id,
        "progress": 0.02,
        "stage": "Starting generation...",
    })

    loop = asyncio.get_running_loop()

    last_broadcast_time = 0.0

    def progress_callback(progress_value: float, desc: str = "") -> None:
        nonlocal last_broadcast_time
        if svc.is_cancelled(job_id):
            logger.info(f"Job {job_id} cancelled during generation (progress_callback)")
            raise GenerationCancelled()
        now = time.time()
        svc.update_job(job_id, progress=progress_value, stage=desc)
        # Throttle WebSocket broadcasts to max 1 per 1.5s (except near completion)
        if progress_value < 0.99 and (now - last_broadcast_time) < 1.5:
            return
        last_broadcast_time = now
        loop.call_soon_threadsafe(
            asyncio.ensure_future,
            generation_ws_manager.broadcast({
                "type": "progress",
                "job_id": job_id,
                "progress": progress_value,
                "stage": desc,
            }),
        )

    # Wrap callback with LM progress interpolator for smooth updates during blocking LM phases
    lm_interpolator = _LMProgressInterpolator(progress_callback)

    try:
        try:
            result = await svc.generate(params_dict, progress_callback=lm_interpolator)

            if result.get("success"):
                audios = result.get("audios", [])
                results = []
                for audio in audios:
                    audio_info = {
                        "path": audio.get("path", ""),
                        "key": audio.get("key", ""),
                        "sample_rate": audio.get("sample_rate", 48000),
                        "params": {
                            k: v for k, v in (audio.get("params") or {}).items()
                            if k != "tensor" and not k.startswith("_")
                        },
                    }
                    results.append(audio_info)

                svc.update_job(job_id, status="completed", progress=1.0, results=results)

                # Log completion to history
                completed_at = datetime.now(timezone.utc)
                duration_ms = int((completed_at - started_at).total_seconds() * 1000)
                try:
                    db = await get_db()
                    await db.execute(
                        """UPDATE generation_history
                           SET status='completed', result_json=?, audio_count=?,
                               completed_at=?, duration_ms=?
                           WHERE id=?""",
                        (json.dumps(results), len(results),
                         completed_at.isoformat(), duration_ms, history_id),
                    )
                    await db.commit()
                except Exception as e:
                    logger.warning(f"Failed to update generation history: {e}")

                await generation_ws_manager.broadcast({
                    "type": "completed",
                    "job_id": job_id,
                    "history_id": history_id,
                    "results": results,
                })
            else:
                error = result.get("error", "Unknown error")
                svc.update_job(job_id, status="failed", error=error)

                # Log failure to history
                completed_at = datetime.now(timezone.utc)
                duration_ms = int((completed_at - started_at).total_seconds() * 1000)
                try:
                    db = await get_db()
                    await db.execute(
                        """UPDATE generation_history
                           SET status='failed', error_message=?,
                               completed_at=?, duration_ms=?
                           WHERE id=?""",
                        (error, completed_at.isoformat(), duration_ms, history_id),
                    )
                    await db.commit()
                except Exception as e:
                    logger.warning(f"Failed to update generation history: {e}")

                await generation_ws_manager.broadcast({
                    "type": "failed",
                    "job_id": job_id,
                    "error": error,
                })

        except GenerationCancelled:
            logger.info(f"Generation job {job_id} cancelled by user")
            svc.update_job(job_id, status="failed", error="Cancelled by user")

            completed_at = datetime.now(timezone.utc)
            duration_ms = int((completed_at - started_at).total_seconds() * 1000)
            try:
                db = await get_db()
                await db.execute(
                    """UPDATE generation_history
                       SET status='cancelled', error_message=?,
                           completed_at=?, duration_ms=?
                       WHERE id=?""",
                    ("Cancelled by user", completed_at.isoformat(), duration_ms, history_id),
                )
                await db.commit()
            except Exception as he:
                logger.warning(f"Failed to update generation history: {he}")

            await generation_ws_manager.broadcast({
                "type": "failed",
                "job_id": job_id,
                "error": "Cancelled by user",
            })

        except Exception as e:
            logger.exception(f"Generation job {job_id} failed")
            svc.update_job(job_id, status="failed", error=str(e))

            # Log exception to history
            completed_at = datetime.now(timezone.utc)
            duration_ms = int((completed_at - started_at).total_seconds() * 1000)
            try:
                db = await get_db()
                await db.execute(
                    """UPDATE generation_history
                       SET status='failed', error_message=?,
                           completed_at=?, duration_ms=?
                       WHERE id=?""",
                    (str(e), completed_at.isoformat(), duration_ms, history_id),
                )
                await db.commit()
            except Exception as he:
                logger.warning(f"Failed to update generation history: {he}")

            await generation_ws_manager.broadcast({
                "type": "failed",
                "job_id": job_id,
                "error": str(e),
            })
    finally:
        lm_interpolator.cleanup()
        await gpu_lock.release("generation")


@router.post("/{job_id}/cancel")
async def cancel_job(job_id: str) -> dict[str, str]:
    cancelled = generation_service.cancel_job(job_id)
    if not cancelled:
        raise HTTPException(status_code=404, detail="Job not found")
    logger.info(f"Job {job_id} marked for cancellation")
    return {"message": "Cancellation requested"}


@router.get("/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str) -> JobStatusResponse:
    job = generation_service.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobStatusResponse(
        job_id=job_id,
        status=job["status"],
        progress=job["progress"],
        stage=job.get("stage", ""),
        results=job.get("results", []),
        error=job.get("error"),
    )


format_router = APIRouter(tags=["generation"])


@format_router.post("/format", response_model=FormatResponse)
async def format_caption(request: FormatRequest) -> FormatResponse:
    svc = generation_service
    if not svc.lm_initialized:
        raise HTTPException(status_code=503, detail="LM model not loaded")

    await gpu_lock.await_acquire("format")

    try:
        user_metadata = {}
        if request.bpm is not None:
            user_metadata["bpm"] = request.bpm
        if request.keyscale:
            user_metadata["keyscale"] = request.keyscale
        if request.timesignature:
            user_metadata["timesignature"] = request.timesignature
        if request.duration is not None:
            user_metadata["duration"] = request.duration
        if request.vocal_language:
            user_metadata["language"] = request.vocal_language

        result = await svc.format_sample(
            caption=request.caption,
            lyrics=request.lyrics,
            user_metadata=user_metadata or None,
        )

        return FormatResponse(**result)
    finally:
        await gpu_lock.release("format")


@format_router.post("/generate-title", response_model=GenerateTitleResponse)
async def generate_title(request: GenerateTitleRequest) -> GenerateTitleResponse:
    from tadpole_studio.services.title_generator import generate_song_title

    # Acquire GPU lock to prevent MLX chat model from conflicting with DiT on Metal
    acquired = await gpu_lock.acquire("title-generation")
    if not acquired:
        fallback = request.caption[:60] if request.caption else request.fallback
        return GenerateTitleResponse(title=fallback)

    try:
        title = await generate_song_title(
            request.caption, request.genre, request.mood, request.fallback,
        )
        return GenerateTitleResponse(title=title)
    except Exception as e:
        logger.warning(f"Title generation failed: {e}")
        fallback = request.caption[:60] if request.caption else request.fallback
        return GenerateTitleResponse(title=fallback, success=False, error=str(e))
    finally:
        await gpu_lock.release("title-generation")


@format_router.post("/sample", response_model=SampleResponse)
async def create_sample(request: SampleRequest) -> SampleResponse:
    svc = generation_service
    if not svc.lm_initialized:
        raise HTTPException(status_code=503, detail="LM model not loaded")

    await gpu_lock.await_acquire("sample")

    try:
        result = await svc.create_sample(
            query=request.query,
            instrumental=request.instrumental,
            vocal_language=request.vocal_language,
            temperature=request.temperature,
        )

        return SampleResponse(**result)
    finally:
        await gpu_lock.release("sample")


ws_router = APIRouter(tags=["websocket"])


@ws_router.websocket("/ws/generate")
async def websocket_generation(websocket: WebSocket) -> None:
    await generation_ws_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except (WebSocketDisconnect, Exception):
        await generation_ws_manager.disconnect(websocket)

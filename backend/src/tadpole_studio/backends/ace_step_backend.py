import asyncio
import os
import shutil
import threading
from typing import Any, Callable, Optional

from loguru import logger

from tadpole_studio.backends.base import BackendCapabilities, BackendType, MusicBackend
from tadpole_studio.config import settings


class _DownloadProgressTracker:
    """Intercepts huggingface_hub's tqdm to track actual bytes downloaded."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.total_bytes: int = 0
        self.downloaded_bytes: int = 0

    @property
    def progress(self) -> float:
        with self._lock:
            if self.total_bytes <= 0:
                return 0.0
            return min(self.downloaded_bytes / self.total_bytes, 0.99)

    def make_tqdm_class(self):
        tracker = self
        from tqdm import tqdm as _base

        class _TrackedTqdm(_base):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, **kwargs)
                if self.total and self.total > 1_000_000:
                    with tracker._lock:
                        tracker.total_bytes += self.total

            def update(self, n=1):
                if self.total and self.total > 1_000_000:
                    with tracker._lock:
                        tracker.downloaded_bytes += n
                return super().update(n)

        return _TrackedTqdm


_ACE_STEP_CAPABILITIES = BackendCapabilities(
    supported_task_types=(
        "text2music", "music2music", "repainting", "cover",
        "repaint", "extract", "lego", "complete",
    ),
    supports_batch=True,
    supports_progress_callback=True,
    supported_audio_formats=("flac", "mp3", "wav", "wav32", "opus", "aac"),
    max_duration_seconds=600.0,
    supports_bpm_control=True,
    supports_keyscale_control=True,
    supports_timesignature_control=True,
    supports_instrumental_toggle=True,
    supports_thinking=True,
    supports_seed=True,
)

_FS_EXPECTED_BYTES: int = 15_000_000_000


class AceStepBackend(MusicBackend):
    """ACE-Step music generation backend."""

    def __init__(self) -> None:
        self.dit_handler = None
        self.llm_handler = None
        self.dit_initialized = False
        self.lm_initialized = False
        self.active_dit_model = ""
        self.active_lm_model = ""
        self._device = ""
        self._init_stage: str = "idle"
        self._init_error: str = ""
        self._download_progress: float = 0.0
        self._download_tracker: Optional[_DownloadProgressTracker] = None

    def backend_type(self) -> BackendType:
        return BackendType.ACE_STEP

    def capabilities(self) -> BackendCapabilities:
        return _ACE_STEP_CAPABILITIES

    @property
    def is_ready(self) -> bool:
        return self.dit_initialized

    @property
    def device(self) -> str:
        return self._device

    @property
    def init_stage(self) -> str:
        return self._init_stage

    @property
    def init_error(self) -> str:
        return self._init_error

    @property
    def download_progress(self) -> float:
        return self._download_progress

    @staticmethod
    def _scan_dir_bytes(path: str) -> int:
        total = 0
        try:
            for root, _dirs, files in os.walk(path):
                for f in files:
                    try:
                        total += os.path.getsize(os.path.join(root, f))
                    except OSError:
                        pass
        except OSError:
            pass
        return total

    async def _monitor_download_progress(self) -> None:
        checkpoint_dir = os.path.join(settings.ACESTEP_PROJECT_ROOT, "checkpoints")
        baseline = self._scan_dir_bytes(checkpoint_dir)

        while self._init_stage == "downloading":
            tracker = self._download_tracker
            if tracker and tracker.total_bytes > 0:
                self._download_progress = tracker.progress
            else:
                delta = self._scan_dir_bytes(checkpoint_dir) - baseline
                self._download_progress = min(delta / _FS_EXPECTED_BYTES, 0.99)
            await asyncio.sleep(2)
        self._download_progress = 0.0

    async def unload(self) -> None:
        def _sync_unload():
            import gc
            import torch
            self.dit_handler = None
            self.llm_handler = None
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                if hasattr(torch.mps, "empty_cache"):
                    torch.mps.empty_cache()

        await asyncio.to_thread(_sync_unload)
        self.dit_initialized = False
        self.lm_initialized = False
        self.active_dit_model = ""
        self.active_lm_model = ""
        self._device = ""
        self._init_stage = "idle"
        self._init_error = ""
        logger.info("ACE-Step backend unloaded")

    async def initialize(self, **kwargs: Any) -> tuple[str, bool]:
        """Initialize both DiT and LM models."""
        config_path = kwargs.get("config_path", settings.DEFAULT_DIT_MODEL)
        device = kwargs.get("device", settings.DEFAULT_DEVICE)

        status, ok = await self.initialize_dit(config_path=config_path, device=device)
        if not ok:
            return status, False

        lm_model = kwargs.get("lm_model_path", settings.DEFAULT_LM_MODEL)
        lm_backend = kwargs.get("lm_backend", settings.DEFAULT_LM_BACKEND)
        return await self.initialize_lm(
            lm_model_path=lm_model, backend=lm_backend, device=device,
        )

    async def initialize_dit(
        self,
        config_path: str = "acestep-v15-turbo",
        device: str = "auto",
    ) -> tuple[str, bool]:
        try:
            project_root = settings.ACESTEP_PROJECT_ROOT
            checkpoint_dir = os.path.join(project_root, "checkpoints")

            try:
                from pathlib import Path
                from acestep.model_downloader import check_main_model_exists
                if not check_main_model_exists(Path(checkpoint_dir)):
                    os.makedirs(checkpoint_dir, exist_ok=True)
                    disk = shutil.disk_usage(checkpoint_dir)
                    required_bytes = 10_000_000_000
                    if disk.free < required_bytes:
                        free_gb = disk.free / (1024 ** 3)
                        self._init_stage = "error"
                        self._init_error = f"Not enough disk space ({free_gb:.1f} GB free, need ~10 GB)"
                        return self._init_error, False
                    self._init_stage = "downloading"
                else:
                    self._init_stage = "loading_dit"
            except Exception:
                self._init_stage = "loading_dit"

            if self._init_stage == "downloading":
                self._download_tracker = _DownloadProgressTracker()
                asyncio.create_task(self._monitor_download_progress())

            tracker = self._download_tracker

            # Detect GPU tier for quantization / offload defaults
            from acestep.gpu_config import get_gpu_config, is_mps_platform

            gpu_config = get_gpu_config()

            quantization = None
            offload_dit_to_cpu = False
            offload_to_cpu = False
            compile_model = False

            if not is_mps_platform():
                if gpu_config.quantization_default:
                    quantization = "int8_weight_only"
                    compile_model = True
                offload_dit_to_cpu = gpu_config.offload_dit_to_cpu_default
                offload_to_cpu = gpu_config.offload_to_cpu_default

            logger.info(
                f"GPU config: {gpu_config.tier} ({gpu_config.gpu_memory_gb:.1f} GB), "
                f"quantization={'int8' if quantization else 'off'}, "
                f"offload_dit={'yes' if offload_dit_to_cpu else 'no'}, "
                f"offload_to_cpu={'yes' if offload_to_cpu else 'no'}"
            )

            def _sync_init():
                from tadpole_studio.ace_handler import TadpoleHandler

                _orig_tqdm = None
                if tracker is not None:
                    try:
                        import huggingface_hub.file_download as _hf_dl
                        _orig_tqdm = _hf_dl.tqdm
                        _hf_dl.tqdm = tracker.make_tqdm_class()
                    except (ImportError, AttributeError):
                        pass

                try:
                    if self.dit_handler is None:
                        self.dit_handler = TadpoleHandler(project_root=project_root)
                    return self.dit_handler.initialize_service(
                        project_root=project_root,
                        config_path=config_path,
                        device=device,
                        quantization=quantization,
                        offload_dit_to_cpu=offload_dit_to_cpu,
                        offload_to_cpu=offload_to_cpu,
                        compile_model=compile_model,
                    )
                finally:
                    if _orig_tqdm is not None:
                        _hf_dl.tqdm = _orig_tqdm

            status, success = await asyncio.to_thread(_sync_init)

            if success:
                self.dit_initialized = True
                self.active_dit_model = config_path
                self._device = self.dit_handler.device
                self._init_stage = "loading_lm"
                logger.info(f"DiT initialized: {config_path} on {self._device}")
            else:
                self._init_stage = "error"
                self._init_error = status
                logger.error(f"DiT init failed: {status}")

            return status, success

        except Exception as e:
            self._init_stage = "error"
            self._init_error = str(e)
            logger.exception("Failed to initialize DiT")
            return f"Error: {e}", False

    async def initialize_lm(
        self,
        lm_model_path: str = "acestep-5Hz-lm-1.7B",
        backend: str = "mlx",
        device: str = "auto",
    ) -> tuple[str, bool]:
        try:
            checkpoint_dir = os.path.join(settings.ACESTEP_PROJECT_ROOT, "checkpoints")

            def _sync_init():
                from acestep.llm_inference import LLMHandler
                if self.llm_handler is None:
                    self.llm_handler = LLMHandler()
                return self.llm_handler.initialize(
                    checkpoint_dir=checkpoint_dir,
                    lm_model_path=lm_model_path,
                    backend=backend,
                    device=device,
                )

            status, success = await asyncio.to_thread(_sync_init)

            if success:
                self.lm_initialized = True
                self.active_lm_model = lm_model_path
                self._init_stage = "ready"
                logger.info(f"LM initialized: {lm_model_path}")
            else:
                self._init_stage = "error"
                self._init_error = status
                logger.error(f"LM init failed: {status}")

            return status, success

        except Exception as e:
            self._init_stage = "error"
            self._init_error = str(e)
            logger.exception("Failed to initialize LM")
            return f"Error: {e}", False

    async def generate(
        self,
        params_dict: dict[str, Any],
        progress_callback: Optional[Callable] = None,
    ) -> dict[str, Any]:
        from acestep.inference import GenerationParams, GenerationConfig, generate_music

        TASK_TYPE_MAP = {"music2music": "cover", "repainting": "repaint"}
        params_dict["task_type"] = TASK_TYPE_MAP.get(
            params_dict.get("task_type", "text2music"),
            params_dict["task_type"],
        )

        if params_dict["task_type"] == "extract" and params_dict.get("track_name"):
            params_dict["instruction"] = f"Extract the {params_dict['track_name']} track from the audio:"
        elif params_dict["task_type"] == "lego" and params_dict.get("track_name"):
            params_dict["instruction"] = f"Generate the {params_dict['track_name']} track based on the audio context:"
        elif params_dict["task_type"] == "complete" and params_dict.get("complete_track_classes"):
            classes = ", ".join(params_dict["complete_track_classes"])
            params_dict["instruction"] = f"Complete the input track with {classes}:"

        if params_dict.get("src_audio_path"):
            params_dict["src_audio"] = params_dict.pop("src_audio_path")

        params = GenerationParams(**{
            k: v for k, v in params_dict.items()
            if k in GenerationParams.__dataclass_fields__
        })

        batch_size = params_dict.get("batch_size", settings.DEFAULT_BATCH_SIZE)
        audio_format = params_dict.get("audio_format", settings.DEFAULT_AUDIO_FORMAT)

        config = GenerationConfig(
            batch_size=batch_size,
            audio_format=audio_format,
            use_random_seed=params.seed == -1,
            seeds=[params.seed] if params.seed != -1 else None,
        )

        settings.ensure_dirs()
        save_dir = str(settings.AUDIO_DIR)

        thinking = params_dict.get("thinking", False)
        self._log_lm_info(
            "generate_music",
            task_type=params.task_type,
            thinking=thinking,
            temp=getattr(params, "lm_temperature", None),
        )
        logger.info(
            "DiT params [generate_music]: steps={} cfg={} shift={} method={} seed={} batch={} fmt={}",
            getattr(params, "inference_steps", "?"),
            getattr(params, "guidance_scale", "?"),
            getattr(params, "shift", "?"),
            getattr(params, "infer_method", "ode"),
            getattr(params, "seed", "?"),
            batch_size,
            audio_format,
        )

        def _run_with_low_priority():
            try:
                os.nice(10)
            except Exception:
                pass
            import gc
            gc.collect()
            return generate_music(
                self.dit_handler,
                self.llm_handler,
                params,
                config,
                save_dir=save_dir,
                progress=progress_callback,
            )

        result = await asyncio.to_thread(_run_with_low_priority)
        return result.to_dict()

    def _log_lm_info(self, task: str, **extra: Any) -> None:
        """Log which 5Hz LM backend/model is being used for a task."""
        h = self.llm_handler
        backend = getattr(h, "llm_backend", "unknown") if h else "unknown"
        model = self.active_lm_model or "unknown"
        parts = " ".join(f"{k}={v}" for k, v in extra.items() if v is not None)
        logger.info(f"5Hz LM [{task}]: backend={backend} model={model} {parts}".rstrip())

    async def create_sample(
        self, query: str, instrumental: bool = False, vocal_language: Optional[str] = None,
        temperature: float = 0.85,
    ) -> dict[str, Any]:
        from acestep.inference import create_sample

        self._log_lm_info("create_sample", temp=temperature, instrumental=instrumental, language=vocal_language)
        result = await asyncio.to_thread(
            create_sample, self.llm_handler,
            query=query, instrumental=instrumental, vocal_language=vocal_language,
            temperature=temperature,
        )
        return result.to_dict()

    async def format_sample(
        self, caption: str, lyrics: str, user_metadata: Optional[dict] = None,
    ) -> dict[str, Any]:
        from acestep.inference import format_sample

        self._log_lm_info("format_sample")
        result = await asyncio.to_thread(
            format_sample, self.llm_handler,
            caption=caption, lyrics=lyrics, user_metadata=user_metadata,
        )
        return result.to_dict()

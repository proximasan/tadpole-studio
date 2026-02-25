from pydantic import BaseModel, Field
from typing import Optional


class GenerateRequest(BaseModel):
    """Request body for music generation."""

    # Backend selection
    backend: str = Field(default="ace-step", pattern=r"^(ace-step|heartmula)$")

    # Task
    task_type: str = Field(default="text2music", pattern=r"^(text2music|music2music|repainting|cover|repaint|extract|lego|complete)$")
    instruction: str = Field(default="Fill the audio semantic mask based on the given conditions:")

    # Text inputs
    caption: str = Field(default="", max_length=4000)
    lyrics: str = Field(default="", max_length=16000)
    instrumental: bool = Field(default=False)

    # Metadata
    vocal_language: str = Field(default="unknown")
    bpm: Optional[int] = Field(default=None, ge=20, le=300)
    keyscale: str = Field(default="")
    timesignature: str = Field(default="")
    duration: float = Field(default=-1.0, ge=-1.0, le=600.0)

    # Audio post-processing
    enable_normalization: bool = Field(default=True)
    normalization_db: float = Field(default=-1.0)
    latent_shift: float = Field(default=0.0)
    latent_rescale: float = Field(default=1.0)

    # Generation params
    inference_steps: int = Field(default=8, ge=1, le=50)
    seed: int = Field(default=-1)
    guidance_scale: float = Field(default=7.0, ge=0.0, le=30.0)
    batch_size: int = Field(default=2, ge=1, le=8)
    audio_format: str = Field(default="flac", pattern=r"^(flac|mp3|wav|wav32|opus|aac)$")

    # Advanced DiT
    use_adg: bool = Field(default=False)
    cfg_interval_start: float = Field(default=0.0)
    cfg_interval_end: float = Field(default=1.0)
    shift: float = Field(default=3.0, ge=1.0, le=5.0)
    infer_method: str = Field(default="ode", pattern=r"^(ode|sde)$")

    # Task-specific
    repainting_start: float = Field(default=0.0)
    repainting_end: float = Field(default=-1)
    audio_cover_strength: float = Field(default=1.0)

    # New modes (Extract/Lego/Complete)
    src_audio_path: Optional[str] = Field(default=None)
    track_name: Optional[str] = Field(default=None)
    complete_track_classes: list[str] = Field(default_factory=list)

    # Title generation
    auto_title: bool = Field(default=False)

    # 5Hz LM
    thinking: bool = Field(default=True)
    lm_temperature: float = Field(default=0.85)
    lm_cfg_scale: float = Field(default=2.0)
    lm_top_k: int = Field(default=0)
    lm_top_p: float = Field(default=0.9)
    use_cot_metas: bool = Field(default=True)
    use_cot_caption: bool = Field(default=False)
    use_cot_language: bool = Field(default=True)

    # HeartMuLa-specific
    heartmula_tags: str = Field(default="", max_length=2000)
    heartmula_temperature: float = Field(default=1.0, ge=0.1, le=2.0)
    heartmula_topk: int = Field(default=50, ge=1, le=200)
    heartmula_cfg_scale: float = Field(default=1.5, ge=0.1, le=5.0)


class GenerateResponse(BaseModel):
    job_id: str
    status: str = "queued"


class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    progress: float = 0.0
    stage: str = ""
    results: list[dict] = Field(default_factory=list)
    error: Optional[str] = None


class FormatRequest(BaseModel):
    caption: str = ""
    lyrics: str = ""
    bpm: Optional[int] = None
    keyscale: str = ""
    timesignature: str = ""
    duration: Optional[float] = None
    vocal_language: str = ""


class FormatResponse(BaseModel):
    caption: str = ""
    lyrics: str = ""
    bpm: Optional[int] = None
    duration: Optional[float] = None
    keyscale: str = ""
    language: str = ""
    timesignature: str = ""
    success: bool = True
    error: Optional[str] = None


class SampleRequest(BaseModel):
    query: str
    instrumental: bool = False
    vocal_language: Optional[str] = None
    temperature: float = 0.85


class SampleResponse(BaseModel):
    caption: str = ""
    lyrics: str = ""
    bpm: Optional[int] = None
    duration: Optional[float] = None
    keyscale: str = ""
    language: str = ""
    timesignature: str = ""
    instrumental: bool = False
    heartmula_tags: str = ""
    success: bool = True
    error: Optional[str] = None


class GenerationHistoryResponse(BaseModel):
    id: str
    task_type: str = "text2music"
    status: str = "pending"
    title: Optional[str] = None
    params: dict = Field(default_factory=dict)
    results: list[dict] = Field(default_factory=list)
    audio_count: int = 0
    error_message: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    duration_ms: Optional[int] = None
    created_at: str = ""
    saved_song_count: int = 0


class GenerationHistoryListResponse(BaseModel):
    items: list[GenerationHistoryResponse]
    total: int


class GenerateTitleRequest(BaseModel):
    caption: str = Field(default="", max_length=4000)
    genre: str = Field(default="", max_length=200)
    mood: str = Field(default="", max_length=200)
    fallback: str = Field(default="Untitled", max_length=200)


class GenerateTitleResponse(BaseModel):
    title: str
    success: bool = True
    error: str | None = None

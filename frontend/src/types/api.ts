export type BackendType = "ace-step" | "heartmula";

export interface HealthResponse {
  status: string;
  dit_model_loaded: boolean;
  lm_model_loaded: boolean;
  dit_model: string;
  lm_model: string;
  device: string;
  version: string;
  init_stage: string;
  init_error: string;
  download_progress: number;
  active_backend: BackendType;
}

export interface SongResponse {
  id: string;
  title: string;
  file_path: string;
  file_format: string;
  duration_seconds: number | null;
  sample_rate: number;
  file_size_bytes: number | null;
  caption: string;
  lyrics: string;
  bpm: number | null;
  keyscale: string;
  timesignature: string;
  vocal_language: string;
  instrumental: boolean;
  is_favorite: boolean;
  rating: number;
  tags: string;
  notes: string;
  parent_song_id: string | null;
  generation_history_id: string | null;
  variation_index: number;
  created_at: string;
  updated_at: string;
}

export interface SongListResponse {
  items: SongResponse[];
  total: number;
}

export interface BulkDeleteRequest {
  song_ids: string[];
}

export interface BulkUpdateRequest {
  song_ids: string[];
  updates: Partial<
    Pick<
      SongResponse,
      | "title"
      | "caption"
      | "lyrics"
      | "bpm"
      | "keyscale"
      | "timesignature"
      | "vocal_language"
      | "is_favorite"
      | "rating"
      | "tags"
      | "notes"
    >
  >;
}

export interface GenerateRequest {
  backend?: BackendType;
  task_type?: string;
  caption?: string;
  lyrics?: string;
  instrumental?: boolean;
  vocal_language?: string;
  bpm?: number | null;
  keyscale?: string;
  timesignature?: string;
  duration?: number;
  inference_steps?: number;
  seed?: number;
  guidance_scale?: number;
  shift?: number;
  infer_method?: string;
  batch_size?: number;
  audio_format?: string;
  thinking?: boolean;
  lm_temperature?: number;
  lm_cfg_scale?: number;
  use_cot_metas?: boolean;
  use_cot_caption?: boolean;
  use_cot_language?: boolean;
  repainting_start?: number;
  repainting_end?: number;
  audio_cover_strength?: number;
  auto_title?: boolean;
  src_audio_path?: string;
  track_name?: string;
  complete_track_classes?: string[];
  heartmula_tags?: string;
  heartmula_temperature?: number;
  heartmula_topk?: number;
  heartmula_cfg_scale?: number;
}

export interface GenerateResponse {
  job_id: string;
  status: string;
}

export interface JobStatusResponse {
  job_id: string;
  status: string;
  progress: number;
  stage: string;
  results: AudioResult[];
  error: string | null;
}

export interface AudioResult {
  path: string;
  key: string;
  sample_rate: number;
  params: Record<string, unknown>;
}

export interface WsProgressMessage {
  type: "progress" | "completed" | "failed" | "title";
  job_id: string;
  progress?: number;
  stage?: string;
  step?: number;
  total_steps?: number;
  results?: AudioResult[];
  error?: string;
  history_id?: string;
  title?: string;
}

export interface FormatRequest {
  caption?: string;
  lyrics?: string;
  bpm?: number | null;
  keyscale?: string;
  timesignature?: string;
  duration?: number | null;
  vocal_language?: string;
}

export interface FormatResponse {
  caption: string;
  lyrics: string;
  bpm: number | null;
  duration: number | null;
  keyscale: string;
  language: string;
  timesignature: string;
  success: boolean;
  error: string | null;
}

export interface SampleRequest {
  query: string;
  instrumental?: boolean;
  vocal_language?: string | null;
  temperature?: number;
}

export interface SampleResponse {
  caption: string;
  lyrics: string;
  bpm: number | null;
  duration: number | null;
  keyscale: string;
  language: string;
  timesignature: string;
  instrumental: boolean;
  heartmula_tags?: string;
  success: boolean;
  error: string | null;
}

export interface SettingsResponse {
  settings: Record<string, string>;
}

export interface ModelInfo {
  name: string;
  model_type: string;
  is_active: boolean;
}

export interface ModelsResponse {
  dit_models: ModelInfo[];
  lm_models: ModelInfo[];
  chat_llm_models: ModelInfo[];
  heartmula_models: ModelInfo[];
}

export interface AvailableModel {
  name: string;
  model_type: string;
  repo_id: string;
  installed: boolean;
  description: string;
  downloading: boolean;
  download_progress: number;
  size_mb: number;
}

export interface AvailableModelsResponse {
  models: AvailableModel[];
}

export interface UploadResponse {
  file_path: string;
}

export interface GenerationHistoryEntry {
  id: string;
  task_type: string;
  status: "pending" | "running" | "completed" | "failed";
  title: string | null;
  params: Record<string, unknown>;
  results: AudioResult[];
  audio_count: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  created_at: string;
  saved_song_count: number;
}

export interface GenerationHistoryListResponse {
  items: GenerationHistoryEntry[];
  total: number;
}

export interface PlaylistResponse {
  id: string;
  name: string;
  description: string;
  icon: string;
  cover_song_id: string | null;
  song_count: number;
  created_at: string;
  updated_at: string;
}

export interface PlaylistSongEntry {
  id: string;
  song_id: string;
  position: number;
  added_at: string;
  song: SongResponse;
}

export interface PlaylistDetailResponse extends PlaylistResponse {
  songs: PlaylistSongEntry[];
}

export interface SongVariationsResponse {
  song: SongResponse;
  ancestors: SongResponse[];
  children: SongResponse[];
}

// LoRA types
export interface LoraInfo {
  name: string;
  path: string;
  adapter_type: string;
  size_mb: number;
}

export interface KnownAdapter {
  name: string;
  path: string;
  adapter_type: string;
  loaded: boolean;
}

export interface LoraStatusResponse {
  loaded: boolean;
  active: boolean;
  scale: number;
  active_adapter: string | null;
  adapter_type: string | null;
  adapters: string[];
  scales: Record<string, number>;
  known_adapters: KnownAdapter[];
}

// Training types
export interface DatasetInfo {
  name: string;
  path: string;
  sample_count: number;
  size_mb: number;
  has_config: boolean;
}

export interface TrainingPreset {
  name: string;
  description: string;
  config: Record<string, unknown>;
}

export interface TrainingStartRequest {
  dataset_dir: string;
  output_name: string;
  preset?: string | null;
  adapter_type?: string;
  rank?: number;
  alpha?: number;
  dropout?: number;
  learning_rate?: number;
  batch_size?: number;
  gradient_accumulation?: number;
  epochs?: number;
  warmup_steps?: number;
  optimizer_type?: string;
  scheduler_type?: string;
  gradient_checkpointing?: boolean;
  save_every?: number;
  variant?: string;
}

export interface TrainingUpdateMessage {
  type:
    | "step"
    | "epoch"
    | "info"
    | "checkpoint"
    | "complete"
    | "fail"
    | "warn";
  step: number;
  loss: number;
  msg: string;
  epoch: number;
  max_epochs: number;
  lr: number;
  epoch_time: number;
  samples_per_sec: number;
  steps_per_epoch: number;
  checkpoint_path: string;
}

export interface TrainingStatusResponse {
  is_training: boolean;
  status:
    | "idle"
    | "preprocessing"
    | "loading_model"
    | "training"
    | "stopping";
  current_step: number;
  current_epoch: number;
  max_epochs: number;
  latest_loss: number;
  output_name: string;
}

export interface GpuStats {
  device: string;
  vram_used_mb: number | null;
  vram_total_mb: number | null;
  vram_percent: number | null;
}

export interface SwitchModelRequest {
  model_name: string;
  backend?: string;
}

export interface PreprocessRequest {
  audio_dir: string;
  output_name: string;
  variant?: string;
  max_duration?: number;
  dataset_json?: string | null;
}

// Dataset editor types
export interface AudioFileInfo {
  filename: string;
  audio_path: string;
  duration: number | null;
}

export interface DatasetSample {
  filename: string;
  audio_path: string;
  caption: string;
  genre: string;
  lyrics: string;
  bpm: number | null;
  keyscale: string;
  timesignature: string;
  duration: number | null;
  is_instrumental: boolean;
  custom_tag: string;
  prompt_override: string | null;
}

export interface DatasetLevelMetadata {
  custom_tag: string;
  tag_position: "prepend" | "append" | "replace";
  genre_ratio: number;
}

export interface DatasetConfig {
  name: string;
  audio_dir: string;
  metadata: DatasetLevelMetadata;
  samples: DatasetSample[];
}

export interface DatasetConfigSummary {
  name: string;
  audio_dir: string;
  sample_count: number;
  audio_dir_missing: boolean;
}

// Radio types
export interface StationResponse {
  id: string;
  name: string;
  description: string;
  is_preset: boolean;
  caption_template: string;
  genre: string;
  mood: string;
  instrumental: boolean;
  vocal_language: string;
  bpm_min: number | null;
  bpm_max: number | null;
  keyscale: string;
  timesignature: string;
  duration_min: number;
  duration_max: number;
  advanced_params_json: string;
  total_plays: number;
  last_played_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StationDetailResponse extends StationResponse {
  recent_songs: SongResponse[];
}

export interface RadioStatusResponse {
  active_station_id: string | null;
  is_generating: boolean;
  songs_generated: number;
}

export interface CreateStationRequest {
  name: string;
  description?: string;
  caption_template?: string;
  genre?: string;
  mood?: string;
  instrumental?: boolean;
  vocal_language?: string;
  bpm_min?: number | null;
  bpm_max?: number | null;
  keyscale?: string;
  timesignature?: string;
  duration_min?: number;
  duration_max?: number;
  advanced_params_json?: string;
}

export interface UpdateStationRequest {
  name?: string;
  description?: string;
  caption_template?: string;
  genre?: string;
  mood?: string;
  instrumental?: boolean;
  vocal_language?: string;
  bpm_min?: number | null;
  bpm_max?: number | null;
  keyscale?: string;
  timesignature?: string;
  duration_min?: number;
  duration_max?: number;
  advanced_params_json?: string;
}

// Radio LLM settings types
export interface RadioSettingsResponse {
  providers: DJProviderInfo[];
  active_provider: string;
  active_model: string;
  system_prompt: string;
  default_system_prompt: string;
}

export interface RadioSettingsUpdate {
  provider?: string;
  model?: string;
  system_prompt?: string;
}

// Title generation types
export interface GenerateTitleRequest {
  caption?: string;
  genre?: string;
  mood?: string;
  fallback?: string;
}

export interface GenerateTitleResponse {
  title: string;
  success: boolean;
  error: string | null;
}

// DJ types
export interface DJConversationResponse {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface DJMessageResponse {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  generation_params_json: string | null;
  generation_job_id: string | null;
  created_at: string;
}

export interface DJConversationDetailResponse extends DJConversationResponse {
  messages: DJMessageResponse[];
}

export interface DJProviderInfo {
  name: string;
  available: boolean;
  requires_api_key: boolean;
  models: string[];
  has_stored_api_key?: boolean;
  package_installed?: boolean;
  unavailable_reason?: string;
}

export interface DJProvidersResponse {
  providers: DJProviderInfo[];
  active_provider: string;
  active_model: string;
  system_prompt: string;
  default_system_prompt: string;
}

// Backend capabilities
export interface BackendCapabilities {
  supported_task_types: string[];
  supports_batch: boolean;
  supports_progress_callback: boolean;
  supported_audio_formats: string[];
  max_duration_seconds: number;
  supports_bpm_control: boolean;
  supports_keyscale_control: boolean;
  supports_timesignature_control: boolean;
  supports_instrumental_toggle: boolean;
  supports_thinking: boolean;
  supports_seed: boolean;
}

export interface BackendInfo {
  backend_type: BackendType;
  ready: boolean;
  init_stage: string;
  init_error: string;
  device: string;
  download_progress: number;
  capabilities: BackendCapabilities;
}

export interface BackendsResponse {
  active_backend: BackendType;
  backends: BackendInfo[];
}

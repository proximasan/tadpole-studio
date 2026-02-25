import { create } from "zustand";
import type { AudioResult, SongResponse } from "@/types/api";

export type GenerationMode = "Simple" | "Custom" | "Remix" | "Repaint" | "Extract" | "Lego" | "Complete";

export interface SimpleForm {
  prompt: string;
  instrumental: boolean;
  language: string;
}

export interface CustomForm {
  caption: string;
  lyrics: string;
  instrumental: boolean;
  language: string;
  bpm: number | null;
  keyscale: string;
  timesignature: string;
  duration: number | null;
}

export interface RemixForm {
  audioFilePath: string;
  audioFileName: string;
  caption: string;
  lyrics: string;
  coverStrength: number;
  language: string;
  sourceSongId: string;
}

export interface RepaintForm {
  audioFilePath: string;
  audioFileName: string;
  caption: string;
  lyrics: string;
  repaintingStart: number;
  repaintingEnd: number;
  language: string;
  sourceSongId: string;
  audioPreviewUrl: string;
}

export interface ExtractForm {
  audioFilePath: string;
  audioFileName: string;
  trackName: string;
  repaintingStart: number;
  repaintingEnd: number;
  caption: string;
  sourceSongId: string;
  audioPreviewUrl: string;
}

export interface LegoForm {
  audioFilePath: string;
  audioFileName: string;
  trackName: string;
  repaintingStart: number;
  repaintingEnd: number;
  caption: string;
  lyrics: string;
  language: string;
  sourceSongId: string;
  audioPreviewUrl: string;
}

export interface CompleteForm {
  audioFilePath: string;
  audioFileName: string;
  completeTrackClasses: string[];
  caption: string;
  lyrics: string;
  language: string;
  sourceSongId: string;
  audioPreviewUrl: string;
}

export interface AdvancedSettings {
  inferenceSteps: number;
  guidanceScale: number;
  shift: number;
  inferMethod: string;
  seed: number;
  thinking: boolean;
  lmTemperature: number;
  batchSize: number;
  audioFormat: string;
  useCotCaption: boolean;
  useCotMetas: boolean;
  useCotLanguage: boolean;
}

export interface HeartMuLaAdvancedSettings {
  temperature: number;
  topk: number;
  cfgScale: number;
}

export interface GenerationJob {
  jobId: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelling";
  progress: number;
  stage: string;
  results: AudioResult[];
  error: string | null;
  historyId: string | null;
  savedVariants: number[];
  generatedTitle: string | null;
  hiddenFromQueue?: boolean;
}

interface GenerationState {
  activeMode: GenerationMode;
  simpleForm: SimpleForm;
  customForm: CustomForm;
  remixForm: RemixForm;
  repaintForm: RepaintForm;
  extractForm: ExtractForm;
  legoForm: LegoForm;
  completeForm: CompleteForm;
  advancedSettings: AdvancedSettings;
  heartmulaSettings: HeartMuLaAdvancedSettings;
  activeJobs: GenerationJob[];
  isGenerating: boolean;
  isFormatting: boolean;

  // AutoGen
  autoGenEnabled: boolean;
  autoSaveEnabled: boolean;
  autoGenCount: number;
  autoGenMaxRuns: number; // 0 = unlimited

  // Model-type auto-switch tracking
  lastAutoSwitchedModelType: string;

  // Auto-Title
  autoTitleEnabled: boolean;
  customTitle: string;

  setActiveMode: (mode: GenerationMode) => void;
  updateSimpleForm: (partial: Partial<SimpleForm>) => void;
  updateCustomForm: (partial: Partial<CustomForm>) => void;
  updateRemixForm: (partial: Partial<RemixForm>) => void;
  updateRepaintForm: (partial: Partial<RepaintForm>) => void;
  updateExtractForm: (partial: Partial<ExtractForm>) => void;
  updateLegoForm: (partial: Partial<LegoForm>) => void;
  updateCompleteForm: (partial: Partial<CompleteForm>) => void;
  updateAdvancedSettings: (partial: Partial<AdvancedSettings>) => void;
  updateHeartmulaSettings: (partial: Partial<HeartMuLaAdvancedSettings>) => void;
  addJob: (job: GenerationJob) => void;
  updateJob: (jobId: string, partial: Partial<GenerationJob>) => void;
  markVariantSaved: (jobId: string, index: number) => void;
  setIsGenerating: (v: boolean) => void;
  setIsFormatting: (v: boolean) => void;
  setAutoGenEnabled: (v: boolean) => void;
  setAutoSaveEnabled: (v: boolean) => void;
  incrementAutoGenCount: () => void;
  resetAutoGenCount: () => void;
  setAutoGenMaxRuns: (v: number) => void;
  setLastAutoSwitchedModelType: (v: string) => void;
  setAutoTitleEnabled: (v: boolean) => void;
  setCustomTitle: (v: string) => void;
  swapJobId: (oldId: string, newId: string) => void;
  removeJob: (jobId: string) => void;
  hideJob: (jobId: string) => void;
  clearJobs: () => void;
  setJobTitle: (jobId: string, title: string) => void;
  loadFromHistoryParams: (params: Record<string, unknown>) => void;
  loadSongForRemix: (song: SongResponse, filePath: string) => void;
  loadSongForRepaint: (song: SongResponse, filePath: string, previewUrl: string) => void;
}

export const useGenerationStore = create<GenerationState>()((set) => ({
  activeMode: "Custom",

  simpleForm: {
    prompt: "",
    instrumental: false,
    language: "en",
  },

  customForm: {
    caption: "",
    lyrics: "",
    instrumental: false,
    language: "unknown",
    bpm: null,
    keyscale: "",
    timesignature: "",
    duration: null,
  },

  remixForm: {
    audioFilePath: "",
    audioFileName: "",
    caption: "",
    lyrics: "",
    coverStrength: 1.0,
    language: "unknown",
    sourceSongId: "",
  },

  repaintForm: {
    audioFilePath: "",
    audioFileName: "",
    caption: "",
    lyrics: "",
    repaintingStart: 0,
    repaintingEnd: -1,
    language: "unknown",
    sourceSongId: "",
    audioPreviewUrl: "",
  },

  extractForm: {
    audioFilePath: "",
    audioFileName: "",
    trackName: "",
    repaintingStart: 0,
    repaintingEnd: -1,
    caption: "",
    sourceSongId: "",
    audioPreviewUrl: "",
  },

  legoForm: {
    audioFilePath: "",
    audioFileName: "",
    trackName: "",
    repaintingStart: 0,
    repaintingEnd: -1,
    caption: "",
    lyrics: "",
    language: "unknown",
    sourceSongId: "",
    audioPreviewUrl: "",
  },

  completeForm: {
    audioFilePath: "",
    audioFileName: "",
    completeTrackClasses: [],
    caption: "",
    lyrics: "",
    language: "unknown",
    sourceSongId: "",
    audioPreviewUrl: "",
  },

  advancedSettings: {
    inferenceSteps: 8,
    guidanceScale: 7,
    shift: 3,
    inferMethod: "ode",
    seed: -1,
    thinking: true,
    lmTemperature: 0.85,
    batchSize: 2,
    audioFormat: "flac",
    useCotCaption: false,
    useCotMetas: true,
    useCotLanguage: true,
  },

  heartmulaSettings: {
    temperature: 1.0,
    topk: 50,
    cfgScale: 1.5,
  },

  activeJobs: [],
  isGenerating: false,
  isFormatting: false,

  autoGenEnabled: false,
  autoSaveEnabled: false,
  autoGenCount: 0,
  autoGenMaxRuns: 0,

  lastAutoSwitchedModelType: "",

  autoTitleEnabled: true,
  customTitle: "",

  setActiveMode: (mode) => set({ activeMode: mode }),

  updateSimpleForm: (partial) =>
    set((s) => ({ simpleForm: { ...s.simpleForm, ...partial } })),

  updateCustomForm: (partial) =>
    set((s) => ({ customForm: { ...s.customForm, ...partial } })),

  updateRemixForm: (partial) =>
    set((s) => ({ remixForm: { ...s.remixForm, ...partial } })),

  updateRepaintForm: (partial) =>
    set((s) => ({ repaintForm: { ...s.repaintForm, ...partial } })),

  updateExtractForm: (partial) =>
    set((s) => ({ extractForm: { ...s.extractForm, ...partial } })),

  updateLegoForm: (partial) =>
    set((s) => ({ legoForm: { ...s.legoForm, ...partial } })),

  updateCompleteForm: (partial) =>
    set((s) => ({ completeForm: { ...s.completeForm, ...partial } })),

  updateAdvancedSettings: (partial) =>
    set((s) => ({ advancedSettings: { ...s.advancedSettings, ...partial } })),

  updateHeartmulaSettings: (partial) =>
    set((s) => ({ heartmulaSettings: { ...s.heartmulaSettings, ...partial } })),

  addJob: (job) =>
    set((s) => ({ activeJobs: [job, ...s.activeJobs] })),

  updateJob: (jobId, partial) =>
    set((s) => ({
      activeJobs: s.activeJobs.map((j) =>
        j.jobId === jobId ? { ...j, ...partial } : j,
      ),
    })),

  markVariantSaved: (jobId, index) =>
    set((s) => ({
      activeJobs: s.activeJobs.map((j) =>
        j.jobId === jobId && !j.savedVariants.includes(index)
          ? { ...j, savedVariants: [...j.savedVariants, index] }
          : j,
      ),
    })),

  setIsGenerating: (v) => set({ isGenerating: v }),
  setIsFormatting: (v) => set({ isFormatting: v }),
  setAutoGenEnabled: (v) => set({ autoGenEnabled: v }),
  setAutoSaveEnabled: (v) => set({ autoSaveEnabled: v }),
  incrementAutoGenCount: () => set((s) => ({ autoGenCount: s.autoGenCount + 1 })),
  resetAutoGenCount: () => set({ autoGenCount: 0 }),
  setAutoGenMaxRuns: (v) => set({ autoGenMaxRuns: v }),
  setLastAutoSwitchedModelType: (v) => set({ lastAutoSwitchedModelType: v }),
  setAutoTitleEnabled: (v) => set({ autoTitleEnabled: v }),
  setCustomTitle: (v) => set({ customTitle: v }),
  swapJobId: (oldId, newId) =>
    set((s) => ({
      activeJobs: s.activeJobs.map((j) =>
        j.jobId === oldId ? { ...j, jobId: newId } : j,
      ),
    })),

  removeJob: (jobId) =>
    set((s) => ({
      activeJobs: s.activeJobs.filter((j) => j.jobId !== jobId),
    })),

  hideJob: (jobId) =>
    set((s) => ({
      activeJobs: s.activeJobs.map((j) =>
        j.jobId === jobId ? { ...j, hiddenFromQueue: true } : j,
      ),
    })),

  clearJobs: () =>
    set((s) => ({
      activeJobs: s.activeJobs.map((j) =>
        j.status === "queued" || j.status === "running" || j.status === "cancelling"
          ? j
          : { ...j, hiddenFromQueue: true },
      ),
    })),

  setJobTitle: (jobId, title) =>
    set((s) => ({
      activeJobs: s.activeJobs.map((j) =>
        j.jobId === jobId ? { ...j, generatedTitle: title } : j,
      ),
    })),

  loadFromHistoryParams: (params) => {
    const taskType = (params.task_type as string) ?? "text2music";

    const advancedSettings: AdvancedSettings = {
      inferenceSteps: (params.inference_steps as number) ?? 8,
      guidanceScale: (params.guidance_scale as number) ?? 7,
      shift: (params.shift as number) ?? 3,
      inferMethod: (params.infer_method as string) ?? "ode",
      seed: (params.seed as number) ?? -1,
      thinking: (params.thinking as boolean) ?? true,
      lmTemperature: (params.lm_temperature as number) ?? 0.85,
      batchSize: (params.batch_size as number) ?? 2,
      audioFormat: (params.audio_format as string) ?? "flac",
      useCotCaption: (params.use_cot_caption as boolean) ?? false,
      useCotMetas: (params.use_cot_metas as boolean) ?? true,
      useCotLanguage: (params.use_cot_language as boolean) ?? true,
    };

    if (taskType === "music2music") {
      set({
        activeMode: "Remix",
        remixForm: {
          audioFilePath: "",
          audioFileName: "",
          caption: (params.caption as string) ?? "",
          lyrics: (params.lyrics as string) ?? "",
          coverStrength: (params.audio_cover_strength as number) ?? 1.0,
          language: (params.vocal_language as string) ?? "unknown",
          sourceSongId: "",
        },
        advancedSettings,
      });
    } else if (taskType === "repainting") {
      set({
        activeMode: "Repaint",
        repaintForm: {
          audioFilePath: "",
          audioFileName: "",
          caption: (params.caption as string) ?? "",
          lyrics: (params.lyrics as string) ?? "",
          repaintingStart: (params.repainting_start as number) ?? 0,
          repaintingEnd: (params.repainting_end as number) ?? -1,
          language: (params.vocal_language as string) ?? "unknown",
          sourceSongId: "",
          audioPreviewUrl: "",
        },
        advancedSettings,
      });
    } else if (taskType === "extract") {
      set({
        activeMode: "Extract",
        extractForm: {
          audioFilePath: "",
          audioFileName: "",
          trackName: (params.track_name as string) ?? "",
          repaintingStart: (params.repainting_start as number) ?? 0,
          repaintingEnd: (params.repainting_end as number) ?? -1,
          caption: (params.caption as string) ?? "",
          sourceSongId: "",
          audioPreviewUrl: "",
        },
        advancedSettings,
      });
    } else if (taskType === "lego") {
      set({
        activeMode: "Lego",
        legoForm: {
          audioFilePath: "",
          audioFileName: "",
          trackName: (params.track_name as string) ?? "",
          repaintingStart: (params.repainting_start as number) ?? 0,
          repaintingEnd: (params.repainting_end as number) ?? -1,
          caption: (params.caption as string) ?? "",
          lyrics: (params.lyrics as string) ?? "",
          language: (params.vocal_language as string) ?? "unknown",
          sourceSongId: "",
          audioPreviewUrl: "",
        },
        advancedSettings,
      });
    } else if (taskType === "complete") {
      set({
        activeMode: "Complete",
        completeForm: {
          audioFilePath: "",
          audioFileName: "",
          completeTrackClasses: (params.complete_track_classes as string[]) ?? [],
          caption: (params.caption as string) ?? "",
          lyrics: (params.lyrics as string) ?? "",
          language: (params.vocal_language as string) ?? "unknown",
          sourceSongId: "",
          audioPreviewUrl: "",
        },
        advancedSettings,
      });
    } else {
      set({
        activeMode: "Custom",
        customForm: {
          caption: (params.caption as string) ?? "",
          lyrics: (params.lyrics as string) ?? "",
          instrumental: (params.instrumental as boolean) ?? false,
          language: (params.vocal_language as string) ?? "unknown",
          bpm: (params.bpm as number) ?? null,
          keyscale: (params.keyscale as string) ?? "",
          timesignature: (params.timesignature as string) ?? "",
          duration: (params.duration != null && (params.duration as number) > 0)
            ? (params.duration as number)
            : null,
        },
        advancedSettings,
      });
    }
  },

  loadSongForRemix: (song, filePath) =>
    set({
      activeMode: "Remix",
      remixForm: {
        audioFilePath: filePath,
        audioFileName: song.title,
        caption: song.caption,
        lyrics: song.lyrics,
        coverStrength: 1.0,
        language: song.vocal_language || "unknown",
        sourceSongId: song.id,
      },
    }),

  loadSongForRepaint: (song, filePath, previewUrl) =>
    set({
      activeMode: "Repaint",
      repaintForm: {
        audioFilePath: filePath,
        audioFileName: song.title,
        caption: song.caption,
        lyrics: song.lyrics,
        repaintingStart: 0,
        repaintingEnd: song.duration_seconds ?? -1,
        language: song.vocal_language || "unknown",
        sourceSongId: song.id,
        audioPreviewUrl: previewUrl,
      },
    }),
}));

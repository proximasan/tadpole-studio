"use client";

import { useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  submitGeneration,
  cancelJob,
  fetchJobStatus,
  formatCaption as formatCaptionApi,
  createSample as createSampleApi,
} from "@/lib/api/client";
import { useGenerationStore } from "@/stores/generation-store";
import { useGpuStore } from "@/stores/gpu-store";
import { useActiveBackend } from "@/hooks/use-active-backend";
import { MODE_TO_TASK_TYPE } from "@/lib/constants";
import { registerAutoGenSubmit, unregisterAutoGenSubmit } from "./use-generation-ws";
import type { GenerateRequest, BackendType } from "@/types/api";

export function useGeneration() {
  const {
    activeMode,
    simpleForm,
    customForm,
    remixForm,
    repaintForm,
    extractForm,
    legoForm,
    completeForm,
    advancedSettings,
    heartmulaSettings,
    isGenerating,
    isFormatting,
    addJob,
    swapJobId,
    setIsGenerating,
    setIsFormatting,
    updateCustomForm,
    autoTitleEnabled,
    customTitle,
  } = useGenerationStore();

  const { activeBackend } = useActiveBackend();

  const buildRequest = useCallback((): GenerateRequest => {
    const taskType = MODE_TO_TASK_TYPE[activeMode] ?? "text2music";
    const adv = advancedSettings;
    const isHeartMuLa = activeBackend === "heartmula";

    const base: GenerateRequest = {
      backend: activeBackend,
      task_type: taskType,
      inference_steps: adv.inferenceSteps,
      guidance_scale: adv.guidanceScale,
      shift: adv.shift,
      infer_method: adv.inferMethod,
      seed: adv.seed,
      thinking: adv.thinking,
      lm_temperature: adv.lmTemperature,
      batch_size: isHeartMuLa ? 1 : adv.batchSize,
      audio_format: isHeartMuLa ? "mp3" : adv.audioFormat,
      auto_title: autoTitleEnabled && !customTitle,
      use_cot_caption: adv.thinking && adv.useCotCaption,
      use_cot_metas: adv.thinking && adv.useCotMetas,
      use_cot_language: adv.thinking && adv.useCotLanguage,
    };

    // Add HeartMuLa-specific params
    if (isHeartMuLa) {
      base.heartmula_tags = customForm.caption;
      base.heartmula_temperature = heartmulaSettings.temperature;
      base.heartmula_topk = heartmulaSettings.topk;
      base.heartmula_cfg_scale = heartmulaSettings.cfgScale;
    }

    if (activeMode === "Custom") {
      return {
        ...base,
        caption: isHeartMuLa ? "" : customForm.caption,
        lyrics: customForm.instrumental ? "" : customForm.lyrics,
        instrumental: customForm.instrumental,
        vocal_language: customForm.language,
        bpm: customForm.bpm ?? undefined,
        keyscale: customForm.keyscale,
        timesignature: customForm.timesignature,
        duration: customForm.duration ?? -1,
        heartmula_tags: isHeartMuLa ? customForm.caption : undefined,
      };
    }

    if (activeMode === "Remix") {
      return {
        ...base,
        task_type: "music2music",
        caption: remixForm.caption,
        lyrics: remixForm.lyrics,
        vocal_language: remixForm.language,
        audio_cover_strength: remixForm.coverStrength,
      };
    }

    if (activeMode === "Repaint") {
      return {
        ...base,
        task_type: "repainting",
        caption: repaintForm.caption,
        lyrics: repaintForm.lyrics,
        vocal_language: repaintForm.language,
        repainting_start: repaintForm.repaintingStart,
        repainting_end: repaintForm.repaintingEnd,
      };
    }

    if (activeMode === "Extract") {
      return {
        ...base,
        task_type: "extract",
        src_audio_path: extractForm.audioFilePath,
        track_name: extractForm.trackName,
        caption: extractForm.caption,
        repainting_start: extractForm.repaintingStart,
        repainting_end: extractForm.repaintingEnd,
      };
    }

    if (activeMode === "Lego") {
      return {
        ...base,
        task_type: "lego",
        src_audio_path: legoForm.audioFilePath,
        track_name: legoForm.trackName,
        caption: legoForm.caption,
        lyrics: legoForm.lyrics,
        vocal_language: legoForm.language,
        repainting_start: legoForm.repaintingStart,
        repainting_end: legoForm.repaintingEnd,
      };
    }

    if (activeMode === "Complete") {
      return {
        ...base,
        task_type: "complete",
        src_audio_path: completeForm.audioFilePath,
        complete_track_classes: completeForm.completeTrackClasses,
        caption: completeForm.caption,
        lyrics: completeForm.lyrics,
        vocal_language: completeForm.language,
      };
    }

    // Simple mode — should not reach here (handled by submit)
    return base;
  }, [activeMode, activeBackend, customForm, remixForm, repaintForm, extractForm, legoForm, completeForm, advancedSettings, heartmulaSettings, autoTitleEnabled, customTitle]);

  const submit = useCallback(async () => {
    // Read fresh from store to avoid stale closure (auto-gen keeps isGenerating=true)
    if (useGenerationStore.getState().isGenerating) return;
    setIsGenerating(true);

    // Notify user if GPU is already busy — backend will queue via await_acquire
    const gpuHolder = useGpuStore.getState().holder;
    if (gpuHolder) {
      toast.info(`Queuing — GPU in use by ${gpuHolder}...`);
    }
    useGpuStore.getState().setHolder("generation");

    // Add job to queue immediately so sidebar shows it right away
    // (before any API calls that might block on GPU lock)
    const tempJobId = crypto.randomUUID();
    addJob({
      jobId: tempJobId,
      status: "queued",
      progress: 0,
      stage: gpuHolder ? `Waiting for GPU (${gpuHolder})...` : "",
      results: [],
      error: null,
      historyId: null,
      savedVariants: [],
      generatedTitle: null,
    });

    try {
      let serverJobId: string;

      if (activeMode === "Simple" && activeBackend === "heartmula") {
        // HeartMuLa Simple mode: use LLM to generate tags + lyrics from description
        const sample = await createSampleApi({
          query: simpleForm.prompt,
          instrumental: simpleForm.instrumental,
          vocal_language: simpleForm.language,
          temperature: advancedSettings.lmTemperature,
        });

        // Check if job was cancelled during sample creation
        const jobAfterSample = useGenerationStore.getState().activeJobs.find((j) => j.jobId === tempJobId);
        if (!jobAfterSample || jobAfterSample.status === "cancelling") {
          if (jobAfterSample) {
            setTimeout(() => useGenerationStore.getState().removeJob(tempJobId), 1000);
          }
          setIsGenerating(false);
          useGpuStore.getState().clear();
          return;
        }

        if (!sample.success) {
          toast.error(sample.error ?? "Sample creation failed — configure an LLM provider in Settings");
          useGenerationStore.getState().removeJob(tempJobId);
          setIsGenerating(false);
          useGpuStore.getState().clear();
          return;
        }

        const request: GenerateRequest = {
          backend: activeBackend,
          task_type: "text2music",
          caption: "",
          lyrics: sample.instrumental ? "" : sample.lyrics,
          instrumental: sample.instrumental,
          vocal_language: sample.language || simpleForm.language,
          duration: sample.duration ?? -1,
          batch_size: 1,
          audio_format: "mp3",
          auto_title: autoTitleEnabled && !customTitle,
          heartmula_tags: sample.heartmula_tags || simpleForm.prompt,
          heartmula_temperature: heartmulaSettings.temperature,
          heartmula_topk: heartmulaSettings.topk,
          heartmula_cfg_scale: heartmulaSettings.cfgScale,
        };

        const response = await submitGeneration(request);
        serverJobId = response.job_id;
      } else if (activeMode === "Simple") {
        // ACE-Step Simple mode: two-step create sample then auto-generate
        const sample = await createSampleApi({
          query: simpleForm.prompt,
          instrumental: simpleForm.instrumental,
          vocal_language: simpleForm.language,
          temperature: advancedSettings.lmTemperature,
        });

        // Check if job was cancelled during sample creation
        const jobAfterSample = useGenerationStore.getState().activeJobs.find((j) => j.jobId === tempJobId);
        if (!jobAfterSample || jobAfterSample.status === "cancelling") {
          if (jobAfterSample) {
            setTimeout(() => useGenerationStore.getState().removeJob(tempJobId), 1000);
          }
          setIsGenerating(false);
          useGpuStore.getState().clear();
          return;
        }

        if (!sample.success) {
          toast.error(sample.error ?? "Sample creation failed");
          useGenerationStore.getState().removeJob(tempJobId);
          setIsGenerating(false);
          useGpuStore.getState().clear();
          return;
        }

        const request: GenerateRequest = {
          backend: activeBackend,
          task_type: "text2music",
          caption: sample.caption,
          lyrics: sample.instrumental ? "" : sample.lyrics,
          instrumental: sample.instrumental,
          vocal_language: sample.language || simpleForm.language,
          bpm: sample.bpm ?? undefined,
          keyscale: sample.keyscale,
          timesignature: sample.timesignature,
          duration: sample.duration ?? -1,
          inference_steps: advancedSettings.inferenceSteps,
          guidance_scale: advancedSettings.guidanceScale,
          seed: advancedSettings.seed,
          thinking: advancedSettings.thinking,
          lm_temperature: advancedSettings.lmTemperature,
          batch_size: advancedSettings.batchSize,
          audio_format: advancedSettings.audioFormat,
          auto_title: autoTitleEnabled && !customTitle,
        };

        const response = await submitGeneration(request);
        serverJobId = response.job_id;
      } else {
        const request = buildRequest();
        const response = await submitGeneration(request);
        serverJobId = response.job_id;
      }

      // Cancelled during submitGeneration? Cancel the real backend job.
      const jobAfterSubmit = useGenerationStore.getState().activeJobs.find(
        (j) => j.jobId === tempJobId,
      );
      if (!jobAfterSubmit || jobAfterSubmit.status === "cancelling") {
        cancelJob(serverJobId).catch(() => {});
        if (jobAfterSubmit) {
          setTimeout(() => useGenerationStore.getState().removeJob(tempJobId), 1000);
        }
        setIsGenerating(false);
        useGpuStore.getState().clear();
        return;
      }

      swapJobId(tempJobId, serverJobId);

      // Sync initial state: early WS messages may have arrived before
      // swapJobId mapped the temp placeholder to the real server ID.
      // Poll once after a short delay to catch any missed updates.
      setTimeout(async () => {
        try {
          const status = await fetchJobStatus(serverJobId);
          const current = useGenerationStore.getState().activeJobs.find(
            (j) => j.jobId === serverJobId,
          );
          if (!current || current.status === "completed" || current.status === "failed") return;
          if (status.progress > current.progress) {
            useGenerationStore.getState().updateJob(serverJobId, {
              status: status.status === "running" ? "running" : current.status,
              progress: status.progress,
              stage: status.stage || current.stage,
            });
          }
        } catch { /* Non-critical — WS will deliver updates */ }
      }, 2000);
    } catch (err) {
      useGenerationStore.getState().removeJob(tempJobId);
      const message = err instanceof Error ? err.message : "Generation failed";
      toast.error(message);
      setIsGenerating(false);
      useGpuStore.getState().clear();
    }
  }, [
    activeMode,
    activeBackend,
    simpleForm,
    advancedSettings,
    heartmulaSettings,
    buildRequest,
    addJob,
    swapJobId,
    setIsGenerating,
    autoTitleEnabled,
    customTitle,
  ]);

  // Register submit for auto-gen re-submit from the global WS handler
  useEffect(() => {
    registerAutoGenSubmit(submit);
    return () => unregisterAutoGenSubmit();
  }, [submit]);

  const formatCaptionAction = useCallback(async () => {
    if (isFormatting) return;
    setIsFormatting(true);

    try {
      const result = await formatCaptionApi({
        caption: customForm.caption,
        lyrics: customForm.lyrics,
        bpm: customForm.bpm,
        keyscale: customForm.keyscale,
        timesignature: customForm.timesignature,
        duration: customForm.duration ?? -1,
        vocal_language: customForm.language,
      });

      if (result.success) {
        updateCustomForm({
          caption: result.caption || customForm.caption,
          lyrics: result.lyrics || customForm.lyrics,
          bpm: result.bpm ?? customForm.bpm,
          keyscale: result.keyscale || customForm.keyscale,
          timesignature: result.timesignature || customForm.timesignature,
          duration: result.duration != null
            ? (result.duration > 0 ? result.duration : null)
            : customForm.duration,
          language: result.language || customForm.language,
        });
      } else {
        toast.error(result.error ?? "Formatting failed");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Formatting failed";
      toast.error(message);
    } finally {
      setIsFormatting(false);
    }
  }, [customForm, isFormatting, setIsFormatting, updateCustomForm]);

  const canSubmit =
    !isGenerating &&
    (activeMode === "Simple"
      ? simpleForm.prompt.trim().length > 0
      : activeMode === "Custom"
        ? customForm.caption.trim().length > 0
        : activeMode === "Remix"
          ? remixForm.audioFilePath.length > 0
          : activeMode === "Repaint"
            ? repaintForm.audioFilePath.length > 0
            : activeMode === "Extract"
              ? extractForm.audioFilePath.length > 0 && extractForm.trackName.length > 0
              : activeMode === "Lego"
                ? legoForm.audioFilePath.length > 0 && legoForm.trackName.length > 0
                : activeMode === "Complete"
                  ? completeForm.audioFilePath.length > 0 && completeForm.completeTrackClasses.length > 0
                  : false);

  const canFormat = !isFormatting && customForm.caption.trim().length > 0;

  return {
    submit,
    formatCaption: formatCaptionAction,
    canSubmit,
    canFormat,
    isGenerating,
    isFormatting,
  };
}

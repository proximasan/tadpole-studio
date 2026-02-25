"use client";

import { useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  createGenerationWebSocket,
  saveSongToLibrary,
  updateHistoryEntry,
} from "@/lib/api/client";
import { useQueryClient } from "@tanstack/react-query";
import { useGenerationStore } from "@/stores/generation-store";
import { useGpuStore } from "@/stores/gpu-store";
import type { WsProgressMessage, AudioResult } from "@/types/api";

// Shared submit function reference for auto-gen re-submit.
// Set by useGeneration (Create tab), called by the WS handler on completion.
let _autoGenSubmitFn: (() => Promise<void>) | undefined;

export function registerAutoGenSubmit(fn: () => Promise<void>) {
  _autoGenSubmitFn = fn;
}

export function unregisterAutoGenSubmit() {
  _autoGenSubmitFn = undefined;
}

/**
 * Global WebSocket hook for generation progress.
 * Mount in AppShell so it persists across tab navigation.
 */
export function useGenerationWs() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdogTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);
  const lastProgressRef = useRef(0);
  const queryClient = useQueryClient();

  const handleWsMessage = useCallback(
    (msg: WsProgressMessage) => {
      const { job_id, type } = msg;
      if (!job_id) return;

      const store = useGenerationStore.getState();

      // Auto-swap: WS messages can arrive with the server job_id before the
      // HTTP response triggers swapJobId. If we see an unknown job_id but have
      // a queued placeholder, swap it now so the message is applied correctly.
      if (!store.activeJobs.some((j) => j.jobId === job_id)) {
        const queued = store.activeJobs.find((j) => j.status === "queued");
        if (queued) {
          store.swapJobId(queued.jobId, job_id);
        }
      }

      if (type === "title") {
        const title = msg.title ?? null;
        const historyId = msg.history_id ?? null;
        if (title) {
          store.setJobTitle(job_id, title);
          store.updateJob(job_id, { historyId });
        }
      } else if (type === "progress") {
        // Ignore progress updates for jobs being cancelled
        const progressJob = store.activeJobs.find((j) => j.jobId === job_id);
        if (progressJob?.status === "cancelling") return;
        const now = Date.now();
        if (now - lastProgressRef.current < 1000 && (msg.progress ?? 0) < 0.99) return;
        lastProgressRef.current = now;
        if (useGpuStore.getState().holder !== "generation") {
          useGpuStore.getState().setHolder("generation");
        }
        store.updateJob(job_id, {
          status: "running",
          progress: msg.progress ?? 0,
          stage: msg.stage ?? "",
        });
      } else if (type === "completed") {
        if (!store.activeJobs.some((j) => j.jobId === job_id)) {
          store.setIsGenerating(false);
          useGpuStore.getState().clear();
          return;
        }
        const results = msg.results ?? [];
        const historyId = msg.history_id ?? null;
        store.updateJob(job_id, {
          status: "completed",
          progress: 1,
          results,
          historyId,
        });
        toast.success("Generation complete!");

        // Post-completion: custom titles, auto-save, auto-gen
        (async () => {
          try {
            const {
              customTitle,
              autoSaveEnabled,
              autoGenEnabled,
              autoGenMaxRuns,
            } = useGenerationStore.getState();

            // Custom title override
            if (customTitle) {
              store.setJobTitle(job_id, customTitle);
              if (historyId) {
                try {
                  await updateHistoryEntry(historyId, { title: customTitle });
                } catch { /* Non-critical */ }
              }
            }

            // Read final title
            const job = useGenerationStore.getState().activeJobs.find((j) => j.jobId === job_id);
            const baseTitle = job?.generatedTitle ?? null;

            // Auto-save
            if (autoSaveEnabled && results.length > 0) {
              for (let i = 0; i < results.length; i++) {
                const r = results[i] as AudioResult;
                const caption = (r.params?.caption as string) ?? "";
                const title = baseTitle
                  ? (results.length > 1 ? `${baseTitle} #${i + 1}` : baseTitle)
                  : (caption
                    ? `${caption.slice(0, 60)}${caption.length > 60 ? "..." : ""} (#${i + 1})`
                    : `Generation ${i + 1}`);
                try {
                  await saveSongToLibrary({
                    title,
                    file_path: r.path,
                    file_format: r.path.split(".").pop() ?? "flac",
                    caption,
                    lyrics: (r.params?.lyrics as string) ?? "",
                    bpm: (r.params?.bpm as number) ?? null,
                    keyscale: (r.params?.keyscale as string) ?? "",
                    timesignature: (r.params?.timesignature as string) ?? "",
                    vocal_language: (r.params?.vocal_language as string) ?? "unknown",
                    instrumental: (r.params?.instrumental as boolean) ?? false,
                    generation_history_id: historyId,
                    variation_index: i,
                  });
                  store.markVariantSaved(job_id, i);
                } catch { /* Continue saving others */ }
              }
              queryClient.invalidateQueries({ queryKey: ["songs"] });
            }

            // Auto-gen re-submit
            if (autoGenEnabled) {
              store.incrementAutoGenCount();
              const nextCount = useGenerationStore.getState().autoGenCount;
              if (autoGenMaxRuns === 0 || nextCount < autoGenMaxRuns) {
                setTimeout(() => {
                  _autoGenSubmitFn?.();
                }, 1000);
                return; // Don't clear isGenerating
              }
            }
          } catch (err) {
            console.error("Post-generation processing failed:", err);
          }

          store.setIsGenerating(false);
          useGpuStore.getState().clear();
        })();
      } else if (type === "failed") {
        const matchedJob = store.activeJobs.find((j) => j.jobId === job_id);
        if (!matchedJob) {
          store.setIsGenerating(false);
          useGpuStore.getState().clear();
          return;
        }
        // User-initiated cancellation — silently remove, no error toast
        if (matchedJob.status === "cancelling") {
          store.removeJob(job_id);
          store.setIsGenerating(false);
          useGpuStore.getState().clear();
          return;
        }
        const errorMsg = msg.error ?? "Generation failed";
        try {
          store.updateJob(job_id, { status: "failed", error: errorMsg });
        } catch { /* job may have been cleaned up */ }
        toast.error(errorMsg);
        store.setIsGenerating(false);
        useGpuStore.getState().clear();
      }
    },
    [queryClient],
  );

  const connectWs = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = createGenerationWebSocket(handleWsMessage, () => {
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
        const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 30000);
        reconnectTimer.current = setTimeout(() => {
          reconnectAttempts.current += 1;
          connectWs();
        }, delay);
      });

      ws.onopen = () => {
        reconnectAttempts.current = 0;
        if (watchdogTimer.current) {
          clearTimeout(watchdogTimer.current);
          watchdogTimer.current = null;
        }
      };

      ws.onclose = () => {
        if (useGenerationStore.getState().isGenerating) {
          watchdogTimer.current = setTimeout(() => {
            if (useGenerationStore.getState().isGenerating) {
              useGenerationStore.getState().setIsGenerating(false);
              useGpuStore.getState().clear();
              toast.error("Lost connection to server. Generation may have failed.");
            }
            watchdogTimer.current = null;
          }, 10_000);
        }

        if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
        const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 30000);
        reconnectTimer.current = setTimeout(() => {
          reconnectAttempts.current += 1;
          connectWs();
        }, delay);
      };

      wsRef.current = ws;
    } catch {
      const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 30000);
      reconnectTimer.current = setTimeout(() => {
        reconnectAttempts.current += 1;
        connectWs();
      }, delay);
    }
  }, [handleWsMessage]);

  useEffect(() => {
    connectWs();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (watchdogTimer.current) clearTimeout(watchdogTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
      }
    };
  }, [connectWs]);
}

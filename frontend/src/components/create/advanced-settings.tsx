"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, HelpCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGenerationStore } from "@/stores/generation-store";
import { useActiveModel } from "@/hooks/use-active-model";
import { useActiveBackend } from "@/hooks/use-active-backend";
import {
  fetchLoraStatus,
  loadLora,
  activateLora,
  setLoraScale,
  toggleLora,
} from "@/lib/api/client";
import {
  INFERENCE_STEPS_MIN,
  INFERENCE_STEPS_MAX,
  GUIDANCE_SCALE_MIN,
  GUIDANCE_SCALE_MAX,
  SHIFT_MIN,
  SHIFT_MAX,
  BATCH_SIZE_MIN,
  BATCH_SIZE_MAX,
  LM_TEMPERATURE_MIN,
  LM_TEMPERATURE_MAX,
  AUDIO_FORMATS,
} from "@/lib/constants";

function LoraPickerSection() {
  const queryClient = useQueryClient();
  const [isLoadingAdapter, setIsLoadingAdapter] = useState(false);

  const { data: status } = useQuery({
    queryKey: ["lora-status"],
    queryFn: fetchLoraStatus,
    refetchInterval: isLoadingAdapter ? false : 3000,
  });

  const scaleMutation = useMutation({
    mutationFn: ({ name, scale }: { name: string; scale: number }) =>
      setLoraScale(name, scale),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["lora-status"] }),
  });

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) => toggleLora(enabled),
    onSuccess: (_data, enabled) => {
      queryClient.invalidateQueries({ queryKey: ["lora-status"] });
      if (!enabled) {
        toast.info("LoRA adapter deactivated");
      }
    },
  });

  const knownAdapters = status?.known_adapters ?? [];
  const activeAdapter = status?.active_adapter ?? null;
  const scales = status?.scales ?? {};
  const isEnabled = status?.active ?? false;
  const currentScale = activeAdapter ? (scales[activeAdapter] ?? 1.0) : 1.0;

  const handleSelectAdapter = async (name: string) => {
    if (name === "__none__") {
      toggleMutation.mutate(false);
      return;
    }

    const adapter = knownAdapters.find((a) => a.name === name);
    if (!adapter) return;

    setIsLoadingAdapter(true);
    try {
      if (!adapter.loaded) {
        const typeLabel = adapter.adapter_type === "lokr" ? "LoKr" : "LoRA";
        toast.info(`Loading ${typeLabel} adapter "${adapter.name}"...`);
        await loadLora(adapter.path, adapter.name);
      }
      // LoKr doesn't register in PEFT's adapter registry, so
      // activate is only meaningful for standard LoRA adapters.
      if (adapter.adapter_type !== "lokr") {
        await activateLora(adapter.name);
      }
      if (!isEnabled) await toggleLora(true);
      queryClient.invalidateQueries({ queryKey: ["lora-status"] });
    } catch (err) {
      toast.error(`Failed to load adapter: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoadingAdapter(false);
    }
  };

  if (knownAdapters.length === 0) {
    return (
      <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        No adapters added — add in Models tab
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Label>LoRA Adapter</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>Select an adapter to load and use during generation.</TooltipContent>
          </Tooltip>
        </div>
        <Switch
          checked={isEnabled}
          onCheckedChange={(checked) => toggleMutation.mutate(checked)}
        />
      </div>

      <Select
        value={activeAdapter ?? "__none__"}
        onValueChange={handleSelectAdapter}
        disabled={isLoadingAdapter}
      >
        <SelectTrigger className="h-8">
          {isLoadingAdapter && (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
          <SelectValue placeholder={isLoadingAdapter ? "Loading adapter..." : "None"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">None</SelectItem>
          {knownAdapters.map((a) => (
            <SelectItem key={a.name} value={a.name}>
              {a.name} ({a.adapter_type})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {activeAdapter && isEnabled && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Strength</Label>
            <span className="text-xs text-muted-foreground">
              {currentScale.toFixed(1)}
            </span>
          </div>
          <Slider
            value={[currentScale]}
            min={0}
            max={2}
            step={0.1}
            onValueCommit={([v]) =>
              scaleMutation.mutate({ name: activeAdapter, scale: v })
            }
          />
        </div>
      )}
    </div>
  );
}

function AceStepAdvancedSettings() {
  const settings = useGenerationStore((s) => s.advancedSettings);
  const update = useGenerationStore((s) => s.updateAdvancedSettings);
  const { supportsCfg } = useActiveModel();

  return (
    <div className="space-y-4">
      {/* LoRA Picker */}
      <LoraPickerSection />

      {/* Inference Steps */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Label>Inference Steps</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>Number of denoising steps. Higher = better quality, slower. Default: 8 for turbo, 32+ for base models.</TooltipContent>
            </Tooltip>
          </div>
          <span className="text-xs text-muted-foreground">
            {settings.inferenceSteps}
          </span>
        </div>
        <Slider
          value={[settings.inferenceSteps]}
          min={INFERENCE_STEPS_MIN}
          max={INFERENCE_STEPS_MAX}
          step={1}
          onValueChange={([v]) => update({ inferenceSteps: v })}
        />
      </div>

      {/* Guidance Scale */}
      <div className={`space-y-2 ${!supportsCfg ? "opacity-50" : ""}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Label>Guidance Scale</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>How closely to follow the prompt. Higher = more faithful.</TooltipContent>
            </Tooltip>
          </div>
          <span className="text-xs text-muted-foreground">
            {settings.guidanceScale}
          </span>
        </div>
        <Slider
          value={[settings.guidanceScale]}
          min={GUIDANCE_SCALE_MIN}
          max={GUIDANCE_SCALE_MAX}
          step={0.5}
          onValueChange={([v]) => update({ guidanceScale: v })}
          disabled={!supportsCfg}
        />
        {!supportsCfg && (
          <p className="text-xs text-muted-foreground">Not used by turbo models</p>
        )}
      </div>

      {/* Shift */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Label>Shift</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>Timestep shift factor for the diffusion noise schedule. Default 3.0 for both turbo and base models.</TooltipContent>
            </Tooltip>
          </div>
          <span className="text-xs text-muted-foreground">
            {settings.shift.toFixed(1)}
          </span>
        </div>
        <Slider
          value={[settings.shift]}
          min={SHIFT_MIN}
          max={SHIFT_MAX}
          step={0.1}
          onValueChange={([v]) => update({ shift: v })}
        />
      </div>

      {/* Inference Method */}
      <div className="space-y-2">
        <div className="flex items-center gap-1">
          <Label>Sampler</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>ODE = fast, deterministic. SDE = stochastic, adds noise each step for more variation.</TooltipContent>
          </Tooltip>
        </div>
        <Select
          value={settings.inferMethod}
          onValueChange={(v) => update({ inferMethod: v })}
        >
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ode">ODE (Deterministic)</SelectItem>
            <SelectItem value="sde">SDE (Stochastic)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Seed */}
      <div className="space-y-2">
        <div className="flex items-center gap-1">
          <Label>Seed</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>Fixed seed for reproducible results. -1 = random.</TooltipContent>
          </Tooltip>
        </div>
        <Input
          type="number"
          value={settings.seed}
          onChange={(e) => update({ seed: parseInt(e.target.value) || -1 })}
          placeholder="-1 for random"
          className="h-8"
        />
      </div>

      {/* LM Temperature */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Label>LM Temperature</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>Controls creativity of lyrics/structure generation.</TooltipContent>
            </Tooltip>
          </div>
          <span className="text-xs text-muted-foreground">
            {settings.lmTemperature.toFixed(2)}
          </span>
        </div>
        <Slider
          value={[settings.lmTemperature]}
          min={LM_TEMPERATURE_MIN}
          max={LM_TEMPERATURE_MAX}
          step={0.05}
          onValueChange={([v]) => update({ lmTemperature: v })}
        />
      </div>

      {/* Batch Size / Audio Format */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <div className="flex items-center gap-1">
            <Label>Batch Size</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>Number of variations to generate per run.</TooltipContent>
            </Tooltip>
          </div>
          <Select
            value={String(settings.batchSize)}
            onValueChange={(v) => update({ batchSize: parseInt(v) })}
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from(
                { length: BATCH_SIZE_MAX - BATCH_SIZE_MIN + 1 },
                (_, i) => i + BATCH_SIZE_MIN,
              ).map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1">
            <Label>Format</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>Output audio format.</TooltipContent>
            </Tooltip>
          </div>
          <Select
            value={settings.audioFormat}
            onValueChange={(v) => update({ audioFormat: v })}
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUDIO_FORMATS.map((fmt) => (
                <SelectItem key={fmt.value} value={fmt.value}>
                  {fmt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

    </div>
  );
}

function HeartMuLaAdvancedSettings() {
  const settings = useGenerationStore((s) => s.heartmulaSettings);
  const update = useGenerationStore((s) => s.updateHeartmulaSettings);

  return (
    <div className="space-y-4">
      {/* Temperature */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Label>Temperature</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>Controls randomness. Higher = more creative, lower = more deterministic.</TooltipContent>
            </Tooltip>
          </div>
          <span className="text-xs text-muted-foreground">
            {settings.temperature.toFixed(1)}
          </span>
        </div>
        <Slider
          value={[settings.temperature]}
          min={0.1}
          max={2.0}
          step={0.1}
          onValueChange={([v]) => update({ temperature: v })}
        />
      </div>

      {/* Top-K */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Label>Top-K</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>Number of top tokens to sample from. Lower = more focused.</TooltipContent>
            </Tooltip>
          </div>
          <span className="text-xs text-muted-foreground">
            {settings.topk}
          </span>
        </div>
        <Slider
          value={[settings.topk]}
          min={1}
          max={200}
          step={1}
          onValueChange={([v]) => update({ topk: v })}
        />
      </div>

      {/* CFG Scale */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Label>CFG Scale</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>Classifier-free guidance. Higher = more faithful to tags.</TooltipContent>
            </Tooltip>
          </div>
          <span className="text-xs text-muted-foreground">
            {settings.cfgScale.toFixed(1)}
          </span>
        </div>
        <Slider
          value={[settings.cfgScale]}
          min={0.1}
          max={5.0}
          step={0.1}
          onValueChange={([v]) => update({ cfgScale: v })}
        />
      </div>

      {/* Format info */}
      <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        Output format: MP3 only. Single output (no batch).
      </div>
    </div>
  );
}

export function AdvancedSettings() {
  const [open, setOpen] = useState(false);
  const { activeBackend } = useActiveBackend();

  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        Advanced Settings
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t border-border px-3 py-3">
          {activeBackend === "heartmula" ? (
            <HeartMuLaAdvancedSettings />
          ) : (
            <AceStepAdvancedSettings />
          )}
        </div>
      )}
    </div>
  );
}

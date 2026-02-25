export const VALID_LANGUAGES = [
  { value: "unknown", label: "Auto-detect" },
  { value: "zh", label: "Chinese" },
  { value: "en", label: "English" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "es", label: "Spanish" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
  { value: "ru", label: "Russian" },
  { value: "ar", label: "Arabic" },
  { value: "hi", label: "Hindi" },
  { value: "tr", label: "Turkish" },
  { value: "pl", label: "Polish" },
  { value: "nl", label: "Dutch" },
  { value: "sv", label: "Swedish" },
  { value: "fi", label: "Finnish" },
  { value: "da", label: "Danish" },
  { value: "no", label: "Norwegian" },
  { value: "el", label: "Greek" },
  { value: "cs", label: "Czech" },
  { value: "ro", label: "Romanian" },
  { value: "hu", label: "Hungarian" },
  { value: "bg", label: "Bulgarian" },
  { value: "hr", label: "Croatian" },
  { value: "sk", label: "Slovak" },
  { value: "sl", label: "Slovenian" },
  { value: "lt", label: "Lithuanian" },
  { value: "lv", label: "Latvian" },
  { value: "et", label: "Estonian" },
  { value: "he", label: "Hebrew" },
  { value: "th", label: "Thai" },
  { value: "vi", label: "Vietnamese" },
  { value: "id", label: "Indonesian" },
  { value: "ms", label: "Malay" },
  { value: "tl", label: "Filipino" },
  { value: "sw", label: "Swahili" },
  { value: "uk", label: "Ukrainian" },
  { value: "ca", label: "Catalan" },
  { value: "gl", label: "Galician" },
  { value: "eu", label: "Basque" },
  { value: "sr", label: "Serbian" },
  { value: "mk", label: "Macedonian" },
  { value: "sq", label: "Albanian" },
  { value: "bs", label: "Bosnian" },
  { value: "cy", label: "Welsh" },
  { value: "ga", label: "Irish" },
  { value: "mt", label: "Maltese" },
  { value: "is", label: "Icelandic" },
  { value: "mn", label: "Mongolian" },
] as const;

export const KEYSCALE_NOTES = ["C", "D", "E", "F", "G", "A", "B"] as const;
export const KEYSCALE_ACCIDENTALS = ["", "#", "b"] as const;
export const KEYSCALE_MODES = ["major", "minor"] as const;

export const VALID_TIME_SIGNATURES = ["2/4", "3/4", "4/4", "6/8"] as const;

export const BPM_MIN = 30;
export const BPM_MAX = 300;
export const BPM_DEFAULT = 120;

export const DURATION_MIN = 10;
export const DURATION_MAX = 300;
export const DURATION_DEFAULT = 60;

export const AUDIO_FORMATS = [
  { value: "flac", label: "FLAC (Lossless)" },
  { value: "mp3", label: "MP3" },
  { value: "wav", label: "WAV (16-bit)" },
  { value: "wav32", label: "WAV (32-bit Float)" },
  { value: "opus", label: "Opus" },
  { value: "aac", label: "AAC" },
] as const;

export const MODE_TO_TASK_TYPE: Record<string, string> = {
  Simple: "text2music",
  Custom: "text2music",
  Remix: "music2music",
  Repaint: "repainting",
  Extract: "extract",
  Lego: "lego",
  Complete: "complete",
};

export const VALID_TRACK_NAMES = [
  { value: "vocals", label: "Vocals" },
  { value: "backing_vocals", label: "Backing Vocals" },
  { value: "drums", label: "Drums" },
  { value: "bass", label: "Bass" },
  { value: "guitar", label: "Guitar" },
  { value: "keyboard", label: "Keyboard" },
  { value: "percussion", label: "Percussion" },
  { value: "strings", label: "Strings" },
  { value: "synth", label: "Synth" },
  { value: "brass", label: "Brass" },
  { value: "woodwinds", label: "Woodwinds" },
  { value: "fx", label: "FX / Sound Effects" },
] as const;

export const INFERENCE_STEPS_MIN = 1;
export const INFERENCE_STEPS_MAX = 50;
export const INFERENCE_STEPS_DEFAULT = 8;

export const GUIDANCE_SCALE_MIN = 1;
export const GUIDANCE_SCALE_MAX = 15;
export const GUIDANCE_SCALE_DEFAULT = 7;

export const BATCH_SIZE_MIN = 1;
export const BATCH_SIZE_MAX = 8;
export const BATCH_SIZE_DEFAULT = 2;

export const SHIFT_MIN = 1;
export const SHIFT_MAX = 5;
export const SHIFT_DEFAULT = 3;

export const LM_TEMPERATURE_MIN = 0;
export const LM_TEMPERATURE_MAX = 2;
export const LM_TEMPERATURE_DEFAULT = 0.85;

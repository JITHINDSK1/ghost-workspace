export interface ModelConfig {
  id: string;
  name: string;
  providerId: string;
  type: string;
  contextLength?: string;
  vision?: boolean;
  tools?: boolean;
  icon?: string; 
}

export const ALLOWLIST = [
  "Inkling", "Inkling Small", "Qwen3.8 27B", "North Mini Code",
  "Apodex 1.1 Mini", "Laguna XS 2.1", "Nemotron 3 Nano Omni",
  "LFM2.5-2.6B", "Gemma 4 26B A4B", "Gemma 4 31B",
  "Llama 3", "Claude", "Gemini", "Liquid", "Mistral", "Qwen 2.5", "DeepSeek"
];

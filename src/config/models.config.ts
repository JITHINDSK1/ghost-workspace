export interface ModelConfig {
  id: string;
  name: string;
  providerId: 'openrouter' | 'agentrouter';
  type: 'coding' | 'vision' | 'long-context' | 'fast';
  icon?: string; 
}

export const modelsConfig: ModelConfig[] = [
  { id: 'anthropic/claude-3.5-sonnet:beta', name: 'Claude 3.5 Sonnet', providerId: 'openrouter', type: 'coding' },
  { id: 'openai/gpt-4o-2024-08-06', name: 'GPT-4o', providerId: 'openrouter', type: 'vision' },
  { id: 'google/gemini-1.5-pro-exp', name: 'Gemini 1.5 Pro', providerId: 'openrouter', type: 'vision' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', providerId: 'openrouter', type: 'fast' },
  { id: 'google/gemini-1.5-flash', name: 'Gemini 1.5 Flash', providerId: 'openrouter', type: 'fast' },
  { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus', providerId: 'openrouter', type: 'long-context' },
  { id: 'meta-llama/llama-3-70b-instruct', name: 'Llama 3 70B', providerId: 'agentrouter', type: 'fast' }
];

export const getModelsByType = (type: ModelConfig['type']) => {
  return modelsConfig.filter(m => m.type === type);
};

export const getModelById = (id: string) => {
  return modelsConfig.find(m => m.id === id);
};

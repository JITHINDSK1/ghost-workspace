export interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  type: 'coding' | 'vision' | 'long-context' | 'fast';
  icon?: string; 
}

export const modelsConfig: ModelConfig[] = [
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI', type: 'vision' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI', type: 'fast' },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'Anthropic', type: 'coding' },
  { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', provider: 'Anthropic', type: 'long-context' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'Google', type: 'vision' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'Google', type: 'fast' },
];

export const getModelsByType = (type: ModelConfig['type']) => {
  return modelsConfig.filter(m => m.type === type);
};

export const getModelById = (id: string) => {
  return modelsConfig.find(m => m.id === id);
};

export function stripNullUndefined(obj: any): any {
  if (obj === null || obj === undefined) return undefined;
  if (Array.isArray(obj)) return obj.map(stripNullUndefined).filter(x => x !== undefined);
  if (typeof obj === 'object') {
    const newObj: any = {};
    for (const key in obj) {
      const val = stripNullUndefined(obj[key]);
      if (val !== undefined) newObj[key] = val;
    }
    return newObj;
  }
  return obj;
}

export interface ProviderConfig {
  id: string;
  baseURL: string;
  apiKey: string;
  headers?: Record<string, string>;
}

export const providers: ProviderConfig[] = [
  {
    id: 'openrouter',
    baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY || '',
    headers: {
      'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
      'X-Title': 'Ghost'
    }
  },
  {
    id: 'agentrouter',
    baseURL: process.env.AGENTROUTER_BASE_URL || 'https://api.agentrouter.com/v1',
    apiKey: process.env.AGENTROUTER_API_KEY || '',
  }
];

export const getProvider = (providerId: string) => providers.find(p => p.id === providerId);

export async function createChatCompletion(providerId: string, payload: any, signal?: AbortSignal, options?: { customApiKey?: string, customBaseUrl?: string }) {
  const provider = getProvider(providerId);
  if (!provider) throw new Error(`Provider ${providerId} not found`);
  
  const apiKey = options?.customApiKey?.trim() || provider.apiKey;
  const baseURL = options?.customBaseUrl?.trim() || provider.baseURL;

  if (!apiKey) throw new Error(`API key for ${providerId} not configured. Please add a key in Settings.`);

  // Validation
  if (apiKey.includes(' ') || apiKey.includes('\n')) {
     throw new Error(`Invalid API key format for ${providerId}.`);
  }
  if (!baseURL.startsWith('https://')) {
     throw new Error(`Base URL for ${providerId} must use HTTPS.`);
  }

  const cleanPayload = stripNullUndefined(payload);
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    ...(provider.headers || {})
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s TTFT
  
  const abortHandler = () => controller.abort();
  if (signal) signal.addEventListener('abort', abortHandler);

  try {
    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(cleanPayload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
       let errorMsg = response.statusText;
       try {
         const text = await response.text();
         if (text.toLowerCase().includes('<html')) {
           throw new Error(`HTML response detected (WAF/Captcha) from ${providerId} (${response.status})`);
         }
         const err = JSON.parse(text);
         errorMsg = err.error?.message || JSON.stringify(err);
       } catch (e) {
         if (e instanceof Error && e.message.includes('HTML')) throw e;
       }
       throw new Error(`Provider Error ${response.status}: ${errorMsg}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
       throw new Error(`HTML response detected (WAF/Captcha) from ${providerId}`);
    }

    return response;
  } finally {
    if (signal) signal.removeEventListener('abort', abortHandler);
  }
}

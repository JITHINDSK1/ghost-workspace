import { NextResponse } from 'next/server';
import { getAvailableModels } from '@/lib/models';
import { createChatCompletion } from '@/lib/providers';

export async function POST(req: Request) {
  try {
    const { messages, model, max_tokens, exclude_models, exclude_reasoning, request_type } = await req.json();
    
    const models = await getAvailableModels();
    
    let fallbackChain = [];
    if (model === "auto") {
       const isBuild = request_type === 'build';
       // Filter out models pushed to bottom (e.g. failing health check, could implement later)
       const buildModels = models.filter(m => m.tier === 'build' && m.id !== 'auto');
       const patchModels = models.filter(m => m.tier === 'patch' && m.id !== 'auto');
       
       if (isBuild) {
          fallbackChain = [...buildModels, ...patchModels];
       } else {
          fallbackChain = [...patchModels, ...buildModels];
       }
       if (fallbackChain.length === 0) fallbackChain = models.filter(m => m.id !== 'auto');
    } else {
       const initialModel = models.find(m => m.id === model);
       if (!initialModel) return NextResponse.json({ error: "Invalid model" }, { status: 400 });
       fallbackChain = [initialModel, ...models.filter(m => m.type === initialModel.type && m.id !== initialModel.id && m.id !== 'auto')];
    }
    
    if (exclude_models && Array.isArray(exclude_models)) {
       fallbackChain = fallbackChain.filter(m => !exclude_models.includes(m.id));
    }
    
    let lastError: Error | null = null;
    const attempts: any[] = [];
    const maxAttempts = 4;
    const startTime = Date.now();

    for (let i = 0; i < fallbackChain.length && attempts.length < maxAttempts; i++) {
       const m = fallbackChain[i];
       
       if (attempts.some(a => a.model === m.id && a.status === 'failed')) continue;
       if (Date.now() - startTime > 60000) break;
       
       const attemptStart = Date.now();
       let ttfb = 0;
       
       try {
         const customApiKey = req.headers.get(`x-ghost-${m.providerId}-key`) || undefined;
         const customBaseUrl = req.headers.get(`x-ghost-${m.providerId}-baseurl`) || undefined;

         let supported = m.supportedParameters || [];
         if (exclude_reasoning) {
            supported = supported.filter((p: string) => p !== 'reasoning' && !p.includes('reasoning_effort'));
         }
         const hasReasoningSupport = supported.includes('reasoning') || supported.includes('provider.reasoning_effort');
         
         const payload: any = { model: m.id, messages, stream: true };
         if (max_tokens) payload.max_tokens = max_tokens;
         
         const response = await createChatCompletion(m.providerId, payload, req.signal, { customApiKey, customBaseUrl });
         ttfb = Date.now() - attemptStart;
         
         const headers = new Headers(response.headers);
         headers.set('X-Model-Used', m.name);
         headers.set('X-Fallback', i > 0 ? 'true' : 'false');
         
         // Inject attempts info as a header for success
         attempts.push({ model: m.id, status: 'success', ttfbMs: ttfb, totalMs: ttfb });
         headers.set('X-Attempts', JSON.stringify(attempts));
         
         return new Response(response.body, { headers });
       } catch (err: any) {
         ttfb = Date.now() - attemptStart;
         
         const httpStatus = err.message.match(/Provider Error (\d+)/)?.[1] || 500;
         const errType = err.message.includes('timeout') ? 'timeout' : err.message.includes('HTML') ? 'WAF' : 'error';
         
         attempts.push({
           model: m.id,
           status: 'failed',
           httpStatus: parseInt(httpStatus as string, 10),
           errorType: errType,
           errorMessage: err.message,
           ttfbMs: ttfb,
           totalMs: ttfb
         });
         
         console.error(`[Attempt Failed] Model: ${m.name}, HTTP: ${httpStatus}, Error: ${err.message.substring(0, 500)}`);
         lastError = err;
         
         if (err.name === 'AbortError') {
             throw err;
         }
       }
    }

    return NextResponse.json({ 
      error: `All models failed. Last error: ${lastError?.message || 'Unknown error'}`,
      attempts
    }, { status: 500 });

  } catch (error: any) {
    if (error.name === 'AbortError') {
       return new Response(null, { status: 499 });
    }
    return NextResponse.json({ error: error.message || "An unexpected error occurred" }, { status: 500 });
  }
}

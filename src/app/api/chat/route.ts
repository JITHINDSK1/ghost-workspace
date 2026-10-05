import { NextResponse } from 'next/server';
import { modelsConfig } from '@/config/models.config';
import { createChatCompletion } from '@/lib/providers';

export async function POST(req: Request) {
  try {
    const { messages, model } = await req.json();
    
    const initialModel = modelsConfig.find(m => m.id === model);
    if (!initialModel) return NextResponse.json({ error: "Invalid model" }, { status: 400 });

    const fallbackChain = [initialModel, ...modelsConfig.filter(m => m.type === initialModel.type && m.id !== initialModel.id)];
    
    let lastError: Error | null = null;

    for (let i = 0; i < fallbackChain.length; i++) {
       const m = fallbackChain[i];
       try {
         const response = await createChatCompletion(m.providerId, {
           model: m.id,
           messages,
           stream: true
         }, req.signal);
         
         const headers = new Headers(response.headers);
         headers.set('X-Model-Used', m.name);
         headers.set('X-Fallback', i > 0 ? 'true' : 'false');
         
         return new Response(response.body, { headers });
       } catch (err: any) {
         console.error(`Model ${m.name} failed:`, err.message);
         lastError = err;
         
         if (err.name === 'AbortError') {
             throw err;
         }
       }
    }

    return NextResponse.json({ error: `All models failed. Last error: ${lastError?.message || 'Unknown error'}` }, { status: 500 });

  } catch (error: any) {
    if (error.name === 'AbortError') {
       return new Response(null, { status: 499 });
    }
    return NextResponse.json({ error: error.message || "An unexpected error occurred" }, { status: 500 });
  }
}

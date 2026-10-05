import { NextResponse } from 'next/server';
import { providers, createChatCompletion } from '@/lib/providers';

export async function GET() {
  const results: Record<string, string> = {};
  
  for (const p of providers) {
    try {
      const res = await createChatCompletion(p.id, {
        model: p.id === 'openrouter' ? 'openai/gpt-4o-mini' : 'meta-llama/llama-3-8b-instruct',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1
      });
      results[p.id] = res.ok ? 'ok' : 'fail';
    } catch (e) {
      results[p.id] = 'fail';
    }
  }
  
  return NextResponse.json({ status: 'ok', providers: results });
}

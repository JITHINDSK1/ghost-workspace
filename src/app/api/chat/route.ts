import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { messages, model } = await req.json();

    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      // Dummy streaming response for testing UI when no API key is provided
      const stream = new ReadableStream({
        async start(controller) {
          const text = "Please set `OPENROUTER_API_KEY` in `.env.local` to use the real model.\n\nHere is a code block test:\n```javascript\nfunction hello() {\n  console.log('Hello AI Workspace');\n}\n```\n";
          for (let i = 0; i < text.length; i++) {
            controller.enqueue(new TextEncoder().encode(text[i]));
            await new Promise(r => setTimeout(r, 15)); // simulated latency
          }
          controller.close();
        }
      });
      return new Response(stream, { headers: { 'Content-Type': 'text/plain' } });
    }

    // Call OpenRouter
    const openRouterReq = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || 'openai/gpt-4o-mini',
        messages: messages,
        stream: true,
      }),
    });

    if (!openRouterReq.ok) {
      return new Response('Error from OpenRouter: ' + await openRouterReq.text(), { status: openRouterReq.status });
    }

    // Pass the stream directly through
    return new Response(openRouterReq.body, {
      headers: {
        'Content-Type': 'text/event-stream',
      }
    });

  } catch (err: any) {
    return new Response(err.message || 'Internal Server Error', { status: 500 });
  }
}

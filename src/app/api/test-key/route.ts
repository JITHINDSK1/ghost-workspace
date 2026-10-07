import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { providerId, key, baseUrl } = await req.json();

    if (!key) {
      return NextResponse.json({ error: "No API key provided" }, { status: 400 });
    }

    const targetUrl = (baseUrl || (providerId === 'openrouter' ? 'https://openrouter.ai/api/v1' : 'https://api.agentrouter.com/v1')).replace(/\/$/, '') + '/models';

    if (!targetUrl.startsWith('https://')) {
      return NextResponse.json({ error: "Base URL must use HTTPS" }, { status: 400 });
    }

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${key.trim()}`,
      }
    });

    if (response.ok) {
      return NextResponse.json({ status: "OK" });
    } else {
      let errorMsg = response.statusText;
      try {
        const text = await response.text();
        if (text.toLowerCase().includes('<html')) {
          return NextResponse.json({ error: "Blocked by provider (HTML response detected)" }, { status: response.status });
        }
        const err = JSON.parse(text);
        errorMsg = err.error?.message || JSON.stringify(err);
      } catch (e) {
        // Ignore
      }
      return NextResponse.json({ error: `Provider returned ${response.status}: ${errorMsg}`.replace(key, '[REDACTED]') }, { status: response.status });
    }
  } catch (error: any) {
    return NextResponse.json({ error: `Network error: ${error.message}` }, { status: 500 });
  }
}

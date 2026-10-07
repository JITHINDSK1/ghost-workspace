import { NextResponse } from 'next/server';
import { providers } from '@/lib/providers';

export async function GET() {
  const config = providers.map(p => ({
    id: p.id,
    hasDefaultKey: !!p.apiKey,
    defaultBaseUrl: p.baseURL
  }));
  return NextResponse.json({ config });
}

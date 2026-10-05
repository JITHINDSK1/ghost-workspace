import { NextResponse } from 'next/server';

const ALLOWLIST = [
  "Inkling", "Inkling Small", "Qwen3.8 27B", "North Mini Code",
  "Apodex 1.1 Mini", "Laguna XS 2.1", "Nemotron 3 Nano Omni",
  "LFM2.5-2.6B", "Gemma 4 26B A4B", "Gemma 4 31B",
  "Llama 3", "Claude", "Gemini", "Liquid", "Mistral", "Qwen 2.5", "DeepSeek" // Some actual openrouter free models might have these names if allowlist fails
];

const FALLBACK_MODELS = [
  { id: "auto", name: "Auto", providerId: "openrouter", type: "fast", contextLength: "Dynamic", vision: true, tools: true },
  { id: "meta-llama/llama-3.1-8b-instruct:free", name: "Llama 3.1 8B (Free)", providerId: "openrouter", type: "fast", contextLength: "8K", vision: false, tools: true },
  { id: "google/gemini-1.5-flash-exp:free", name: "Gemini 1.5 Flash (Free)", providerId: "openrouter", type: "vision", contextLength: "1M", vision: true, tools: true },
  { id: "qwen/qwen-2.5-coder-32b-instruct:free", name: "Qwen 2.5 Coder 32B (Free)", providerId: "openrouter", type: "coding", contextLength: "32K", vision: false, tools: true }
];

let cachedModels: any = null;
let cacheTime = 0;

export async function GET() {
  if (cachedModels && Date.now() - cacheTime < 3600000) {
    return NextResponse.json({ models: cachedModels });
  }

  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", { next: { revalidate: 3600 } });
    if (!res.ok) throw new Error("Failed to fetch models");
    const data = await res.json();
    
    const freeTextModels = data.data.filter((m: any) => 
      m.pricing?.prompt === "0" && 
      m.pricing?.completion === "0" &&
      !m.name.toLowerCase().includes("embedding") &&
      !m.name.toLowerCase().includes("guard")
    );

    let mapped = freeTextModels
      .filter((m: any) => ALLOWLIST.some(a => m.name.toLowerCase().includes(a.toLowerCase())))
      .map((m: any) => {
        const vision = m.architecture?.modality?.includes("image") || m.id.includes("vision") || m.id.includes("gemini");
        const tools = m.architecture?.tools === true || m.description?.toLowerCase().includes("tool");
        let contextLength = m.context_length ? `${Math.round(m.context_length / 1000)}K` : "Unknown";
        if (m.context_length >= 1000000) contextLength = `${Math.round(m.context_length / 1000000)}M`;
        
        return {
          id: m.id,
          name: m.name,
          providerId: "openrouter",
          type: vision ? "vision" : "fast",
          contextLength,
          vision,
          tools
        };
      });
      
    // If exact allowlist didn't yield enough, just use top 10 free text models
    if (mapped.length < 3) {
      mapped = freeTextModels.slice(0, 15).map((m: any) => {
        const vision = m.architecture?.modality?.includes("image") || m.id.includes("vision") || m.id.includes("gemini");
        let contextLength = m.context_length ? `${Math.round(m.context_length / 1000)}K` : "Unknown";
        if (m.context_length >= 1000000) contextLength = `${Math.round(m.context_length / 1000000)}M`;
        return { id: m.id, name: m.name, providerId: "openrouter", type: vision ? "vision" : "fast", contextLength, vision, tools: true };
      });
    }

    cachedModels = [
      { id: "auto", name: "Auto", providerId: "openrouter", type: "fast", contextLength: "Dynamic", vision: true, tools: true },
      ...mapped
    ];
    cacheTime = Date.now();
    return NextResponse.json({ models: cachedModels });
  } catch (err) {
    return NextResponse.json({ models: FALLBACK_MODELS });
  }
}

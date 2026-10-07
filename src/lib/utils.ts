import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function cleanArtifactCode(code: string): string {
  let cleaned = code.trim();
  
  // Fix A: strip OpenRouter processing comments
  cleaned = cleaned.replace(/: OPENROUTER PROCESSING/g, '');
  cleaned = cleaned.replace(/: PROCESSING/g, '');
  
  // Safety net: decode entities ONCE if it starts with &lt; or contains &lt;!DOCTYPE / &lt;html
  if (cleaned.startsWith('&lt;') || cleaned.includes('&lt;!DOCTYPE') || cleaned.includes('&lt;html')) {
    cleaned = cleaned
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&amp;/g, '&');
  }

  // Strip wrapping ``` fences if the model added them
  // It could be ```html ... ``` or ``` ... ```
  cleaned = cleaned.replace(/^```[a-z]*\n?/i, '');
  cleaned = cleaned.replace(/\n?```$/i, '');
  cleaned = cleaned.trim();

  return cleaned;
}

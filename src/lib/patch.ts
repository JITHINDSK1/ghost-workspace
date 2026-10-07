export interface Edit {
  find: string;
  replace: string;
}

export interface PatchResult {
  success: boolean;
  code: string;
  failedEditIndex?: number;
  errorMessage?: string;
  failedFind?: string;
}

function findNormalizedMatch(code: string, findText: string): { start: number, end: number }[] {
  const lines = findText.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const regexPattern = lines.map(l => {
    const escaped = l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escaped.replace(/\s+/g, '\\s+');
  }).join('\\s+');

  const matches: { start: number, end: number }[] = [];
  try {
    const re = new RegExp(regexPattern, 'g');
    let match;
    while ((match = re.exec(code)) !== null) {
      matches.push({ start: match.index, end: match.index + match[0].length });
    }
  } catch (e) {
    console.error("Regex compile failed for patch matching", e);
  }
  return matches;
}

export function parsePatch(patchText: string): Edit[] {
  const edits: Edit[] = [];
  let searchIdx = 0;
  
  while (true) {
    const editStart = patchText.indexOf('<edit>', searchIdx);
    if (editStart === -1) break;
    const editEnd = patchText.indexOf('</edit>', editStart);
    if (editEnd === -1) break;

    const editBlock = patchText.slice(editStart + 6, editEnd);
    searchIdx = editEnd + 7;

    const findStart = editBlock.indexOf('<find>');
    const findEnd = editBlock.indexOf('</find>');
    const replaceStart = editBlock.indexOf('<replace>');
    const replaceEnd = editBlock.indexOf('</replace>');

    if (findStart !== -1 && findEnd !== -1 && replaceStart !== -1 && replaceEnd !== -1 && findStart < findEnd && replaceStart < replaceEnd) {
      const findText = editBlock.slice(findStart + 6, findEnd);
      let cleanFind = findText;
      if (cleanFind.startsWith('\n')) cleanFind = cleanFind.slice(1);
      
      const replaceText = editBlock.slice(replaceStart + 9, replaceEnd);
      let cleanReplace = replaceText;
      if (cleanReplace.startsWith('\n')) cleanReplace = cleanReplace.slice(1);

      edits.push({ find: cleanFind, replace: cleanReplace });
    }
  }

  return edits;
}

export function applyPatch(code: string, edits: Edit[]): PatchResult {
  let currentCode = code;

  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i];
    const findText = edit.find;
    
    let matches: { start: number, end: number }[] = [];
    let idx = currentCode.indexOf(findText);
    while (idx !== -1) {
      matches.push({ start: idx, end: idx + findText.length });
      idx = currentCode.indexOf(findText, idx + 1);
    }

    if (matches.length === 0) {
      matches = findNormalizedMatch(currentCode, findText);
    }

    if (matches.length === 0) {
      return { success: false, code, failedEditIndex: i, errorMessage: "Not found in the code.", failedFind: findText };
    }
    if (matches.length > 1) {
      return { success: false, code, failedEditIndex: i, errorMessage: `Found ${matches.length} times in the code. Match must be unique.`, failedFind: findText };
    }

    const match = matches[0];
    currentCode = currentCode.slice(0, match.start) + edit.replace + currentCode.slice(match.end);
  }

  return { success: true, code: currentCode };
}

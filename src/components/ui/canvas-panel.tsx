import { useState, useEffect, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { html } from "@codemirror/lang-html";
import { X, Play, Code, Copy, Download, RefreshCw, Maximize, Smartphone, Monitor } from "lucide-react";

export interface CanvasArtifact {
  id: string;
  title: string;
  type: string;
  code: string;
}

export function CanvasPanel({ 
  artifact, 
  onClose, 
  onUpdate 
}: { 
  artifact: CanvasArtifact | null; 
  onClose: () => void;
  onUpdate: (code: string) => void;
}) {
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [code, setCode] = useState("");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (artifact) {
      setCode(artifact.code);
    }
  }, [artifact?.code]);

  const handleRefresh = () => {
    if (iframeRef.current && artifact) {
      iframeRef.current.srcdoc = code;
    }
  };
  
  const handleDownload = () => {
    if (!artifact) return;
    const blob = new Blob([code], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${artifact.title.replace(/\s+/g, '-').toLowerCase()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
  };

  if (!artifact) return null;

  return (
    <div className="flex flex-col h-full bg-white/60 dark:bg-black/60 backdrop-blur-xl border-l border-white/20 dark:border-white/10 z-50">
      <div className="flex items-center justify-between p-3 border-b border-white/20 dark:border-white/10 shrink-0">
        <span className="font-medium text-sm truncate max-w-[200px]">{artifact.title}</span>
        <div className="flex items-center gap-2">
          <div className="flex bg-white/40 dark:bg-black/40 rounded-lg p-1 border border-white/20 dark:border-white/10">
            <button onClick={() => setTab("preview")} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${tab === "preview" ? "bg-white dark:bg-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-100"}`}>Preview</button>
            <button onClick={() => setTab("code")} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${tab === "code" ? "bg-white dark:bg-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-100"}`}>Code</button>
          </div>
          <div className="w-px h-4 bg-gray-300 dark:bg-gray-700 mx-1" />
          <button onClick={handleCopy} className="p-1.5 text-gray-500 hover:text-foreground rounded-md hover:bg-white/40 dark:hover:bg-white/10" title="Copy Code"><Copy className="size-4"/></button>
          <button onClick={handleDownload} className="p-1.5 text-gray-500 hover:text-foreground rounded-md hover:bg-white/40 dark:hover:bg-white/10" title="Download HTML"><Download className="size-4"/></button>
          <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-foreground rounded-md hover:bg-white/40 dark:hover:bg-white/10 ml-1"><X className="size-4"/></button>
        </div>
      </div>
      
      {tab === "preview" && (
        <div className="flex-1 p-2 md:p-4 flex flex-col items-center overflow-hidden bg-gray-50/30 dark:bg-gray-900/30">
           <div className="flex gap-2 mb-3 w-full justify-center md:justify-end">
             <div className="flex bg-white/40 dark:bg-black/40 rounded-lg p-1 border border-white/20 dark:border-white/10">
               <button onClick={() => setDevice("desktop")} className={`p-1.5 rounded-md transition-colors ${device === 'desktop' ? 'bg-white dark:bg-gray-800 shadow-sm text-foreground' : 'text-gray-500'}`}><Monitor className="size-4"/></button>
               <button onClick={() => setDevice("mobile")} className={`p-1.5 rounded-md transition-colors ${device === 'mobile' ? 'bg-white dark:bg-gray-800 shadow-sm text-foreground' : 'text-gray-500'}`}><Smartphone className="size-4"/></button>
             </div>
             <button onClick={handleRefresh} className="p-1.5 rounded-lg text-gray-500 hover:text-foreground bg-white/40 dark:bg-black/40 hover:bg-white/60 dark:hover:bg-white/10 border border-white/20 dark:border-white/10"><RefreshCw className="size-4"/></button>
           </div>
           <div className={`transition-all duration-300 bg-white rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 flex-1 overflow-hidden ${device === 'mobile' ? 'w-[375px]' : 'w-full max-w-5xl'}`}>
              <iframe
                ref={iframeRef}
                srcDoc={code}
                sandbox="allow-scripts allow-forms allow-modals allow-popups"
                className="w-full h-full border-0 bg-white"
                onLoad={() => {
                  if (!(window as any).__loggedIframe) {
                    console.log("IFRAME SRCDOC (first 200 chars):", code.substring(0, 200));
                    (window as any).__loggedIframe = true;
                  }
                }}
              />
           </div>
        </div>
      )}
      
      {tab === "code" && (
        <div className="flex-1 overflow-hidden flex flex-col bg-[#282c34]">
          <div className="flex-1 overflow-y-auto">
            <CodeMirror
              value={code}
              height="100%"
              extensions={[html()]}
              onChange={(val) => {
                setCode(val);
                onUpdate(val);
              }}
              theme="dark"
              style={{ fontSize: 13, fontFamily: 'monospace' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

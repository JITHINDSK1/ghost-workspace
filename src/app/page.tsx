"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { PromptInput, Attachment } from "@/components/ui/ai-chat-input";
import { ModelConfig } from "@/config/models.config";
import { chatDB, Message, Conversation } from "@/lib/db";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css'; 
import { FileText, Plus, Moon, Sun, PanelLeft, Settings, Search, MessageSquare, MoreHorizontal, Pencil, Trash, Check, X, Code, ArrowRight, Copy, ArrowDown, Key, Brain, ChevronRight } from "lucide-react";
import { SettingsDialog } from "@/components/ui/settings-dialog";
import { DESIGN_SKILL_PROMPT } from "@/lib/prompts/design-skill";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { cn, cleanArtifactCode } from "@/lib/utils";
import { parsePatch, applyPatch } from "@/lib/patch";
import { ShiningText } from "@/components/ui/shining-text";
import { Panel, Group, Separator } from "react-resizable-panels";
import { CanvasPanel, CanvasArtifact } from "@/components/ui/canvas-panel";

const lightGradient = "radial-gradient(125% 125% at 50% 101%, rgba(245,87,2,1) 10.5%, rgba(245,120,2,1) 16%, rgba(245,140,2,1) 17.5%, rgba(245,170,100,1) 25%, rgba(238,174,202,1) 40%, rgba(202,179,214,1) 65%, rgba(148,201,233,1) 100%)";
const darkGradient = "radial-gradient(125% 125% at 50% 10%, #000 40%, #63e 100%)";

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  const [hoveredConvId, setHoveredConvId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [isRenamingId, setIsRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  
  const [inputValue, setInputValue] = useState("");
  
  const [autoScroll, setAutoScroll] = useState(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isSendingRef = useRef(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  
  const [isMobile, setIsMobile] = useState(false);
  
  // Canvas State
  const [isCanvasOpen, setIsCanvasOpen] = useState(false);
  const [currentArtifact, setCurrentArtifact] = useState<CanvasArtifact | null>(null);

  const [apiKeys, setApiKeys] = useState<{providerId: string, key: string, baseUrl?: string}[]>([]);
  const [serverConfig, setServerConfig] = useState<{id: string, hasDefaultKey: boolean, defaultBaseUrl: string}[]>([]);

  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "dark" : "light");
    
    const savedSidebar = localStorage.getItem("sidebarExpanded");
    if (savedSidebar) {
      setIsSidebarExpanded(savedSidebar === "true");
    }
    
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    loadConversations();
    
    chatDB.getApiKeys().then(setApiKeys);
    fetch('/api/config').then(res => res.json()).then(data => setServerConfig(data.config)).catch(() => {});
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        setIsSidebarExpanded(prev => {
          const next = !prev;
          localStorage.setItem("sidebarExpanded", String(next));
          return next;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    
    const handleOpenSettings = () => setSettingsOpen(true);
    document.addEventListener('open-settings', handleOpenSettings);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', checkMobile);
      document.removeEventListener('open-settings', handleOpenSettings);
    }
  }, []);

  const loadConversations = async () => {
    const convs = await chatDB.getConversations();
    setConversations(convs.sort((a, b) => b.updatedAt - a.updatedAt));
  };

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  const toggleSidebar = () => {
    setIsSidebarExpanded(prev => {
      const next = !prev;
      localStorage.setItem("sidebarExpanded", String(next));
      if (!next) {
        setIsSearching(false);
        setSearchQuery("");
      }
      return next;
    });
  };
  
  const handleSearchClick = () => {
    if (!isSidebarExpanded) {
      setIsSidebarExpanded(true);
      localStorage.setItem("sidebarExpanded", "true");
    }
    setIsSearching(true);
    setTimeout(() => searchInputRef.current?.focus(), 250);
  };

  const handleScroll = () => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
  };

  useEffect(() => {
    if (autoScroll && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages, isStreaming, autoScroll]);

  const switchConversation = async (id: string | null) => {
    setActiveConversationId(id);
    if (id) {
      const msgs = await chatDB.getMessages(id);
      setMessages(msgs.sort((a, b) => a.timestamp - b.timestamp));
    } else {
      setMessages([]);
    }
    if (isMobile) setIsMobileOpen(false);
    setIsCanvasOpen(false);
  };
  
  const startRename = (id: string, currentTitle: string) => {
    setIsRenamingId(id);
    setRenameValue(currentTitle);
    setMenuOpenId(null);
  };
  
  const commitRename = async (id: string) => {
    if (renameValue.trim()) {
      await chatDB.renameConversation(id, renameValue.trim());
      await loadConversations();
    }
    setIsRenamingId(null);
  };

  const confirmDelete = async (id: string) => {
    await chatDB.deleteConversation(id);
    if (activeConversationId === id) switchConversation(null);
    await loadConversations();
    setIsDeletingId(null);
    setMenuOpenId(null);
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  };

  const extractContext = async (attachments: Attachment[]) => {
    let context = "";
    for (const a of attachments) {
      if (a.type === 'text' || a.type === 'code') {
        try {
          const text = await a.file.text();
          context += `\n\n--- File: ${a.name} ---\n${text}\n`;
        } catch (e) {}
      } else if (a.type === 'pdf') {
         context += `\n\n--- File: ${a.name} (PDF text extraction pending) ---\n`;
      }
    }
    return context;
  };

  const handleSend = async (content: string, meta: { model: ModelConfig; effort: string; attachments: Attachment[] }) => {
    if (isSendingRef.current) return;
    isSendingRef.current = true;
    
    let convId = activeConversationId;
    if (!convId) {
      convId = Date.now().toString();
      const words = content.split(/\s+/);
      const title = words.slice(0, 6).join(' ') + (words.length > 6 ? "..." : "");
      await chatDB.createConversation(convId, title);
      setActiveConversationId(convId);
      loadConversations();
    }

    const extraContext = await extractContext(meta.attachments);
    const augmentedContent = extraContext ? `${content}${extraContext}` : content;

    const userMsg: Message = {
      id: Date.now().toString(), role: "user", content: augmentedContent, timestamp: Date.now(),
      attachments: meta.attachments.map(a => ({ id: a.id, name: a.name, type: a.type, data: a.base64 || a.url }))
    };
    
    setMessages(prev => [...prev, userMsg]);
    await chatDB.addMessage(convId, userMsg);
    
    setIsStreaming(true);
    setAutoScroll(true);
    abortControllerRef.current = new AbortController();
    
    const assistantId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: "<patch-retry-state>Ghost is thinking...</patch-retry-state>", timestamp: Date.now(), modelUsed: meta.model.name }]);

    try {
      const systemPrompt = {
        role: "system",
        content: `When providing code for a webpage, app, or component, output ONE complete HTML file with inline CSS and JS.
- Static HTML cannot use JavaScript template literals like \${...}. Generate dynamic markup inside <script> with innerHTML/createElement.
- Make sure every opening tag has a matching closing tag, and never use a stale hard-coded date (use dates relative to now).
- When editing, preserve all unrelated code exactly.

FORMAT
- First request / brand-new artifact / major redesign:
  <artifact type="html" title="...">FULL FILE</artifact>
- Small or medium change to an existing artifact:
  <patch>
    <edit>
      <find>exact text copied from the current code</find>
      <replace>new text</replace>
    </edit>
  </patch>

PATCH RULES
- <find> must be copied EXACTLY (spacing, quotes, case) from the current code, and include enough surrounding text to match exactly ONE place.
- Keep each edit as small as possible. Never include unchanged code that isn't needed to make the match unique.
- Multiple edits are applied in order. To delete code, use an empty <replace>. To insert code, find an anchor line and replace it with anchor + new code.
- Raw code only. No markdown fences, no HTML-escaping, no commentary inside <find>/<replace>.
- If more than ~40% of the file would change, or the user wants a redesign, return a full <artifact> instead.
- A short sentence of explanation OUTSIDE the tags is fine.
- Respond with only plain chat text outside the artifact/patch.`
      };

      const isNew = !currentArtifact;
      const isRedesign = /redesign|make it look better|premium|new style|from scratch/i.test(content);
      
      let finalSystemContent = systemPrompt.content;
      if (isNew || isRedesign) {
         finalSystemContent += '\n\n' + DESIGN_SKILL_PROMPT;
         if (localStorage.getItem('designQuality') === 'max') {
           finalSystemContent += '\n\nGo the extra mile: richer gradients, more refined micro-interactions, one signature interactive moment, and sharper copy. Spend your effort on craft, not length.';
         }
      }

      const buildApiMessages = (historyMsgs: Message[]) => {
         const sysMsg = { role: "system", content: finalSystemContent };
         const apiMessages = [sysMsg, ...historyMsgs].map((m: any) => {
           let content = m.content;
           if (m.role === 'assistant') {
              content = content.replace(/<artifact[^>]*title="([^"]+)"[^>]*>[\s\S]*?(?:<\/artifact>|$)/gi, '[artifact: $1]');
              content = content.replace(/(?:<patch>|\[patch\])[\s\S]*?(?:<\/patch>|\[\/patch\]|$)/gi, '[patch applied]');
              content = content.replace(/<edit>[\s\S]*?(?:<\/edit>|$)/gi, '[patch applied]');
              content = content.replace(/<patch-retry-state>[\s\S]*?(?:<\/patch-retry-state>|$)/gi, '');
           }
           if (m.attachments && m.attachments.some((a: any) => a.type === 'image')) {
             const parts: any[] = [{ type: "text", text: content }];
             m.attachments.forEach((a: any) => {
               if (a.type === 'image' && a.data) parts.push({ type: "image_url", image_url: { url: a.data } });
             });
             return { role: m.role, content: parts };
           }
           return { role: m.role, content };
         });

         if (currentArtifact) {
            apiMessages.splice(apiMessages.length - 1, 0, {
               role: "system",
               content: `Current artifact (${currentArtifact.title}):\n<artifact type="${currentArtifact.type}" title="${currentArtifact.title}">\n${currentArtifact.code}\n</artifact>\n\nApply the user's request to it. For small/medium changes, use <patch>. For major changes, output a full <artifact>.`
            });
         }
         return apiMessages;
      };

      const processTurn = async (chatHistory: Message[], retryCount: number = 0, excludeModels: string[] = [], excludeReasoning: boolean = false) => {
        if (!abortControllerRef.current) return;
        
        try {
          let apiMessages = buildApiMessages(chatHistory);
          
          let contextLimit = meta.model.contextTokens || 100000;
          const maxAllowedTokens = contextLimit * 0.6;
          let estimatedTokens = JSON.stringify(apiMessages).length / 3.5;
          while (estimatedTokens > maxAllowedTokens && apiMessages.length > 3) {
             apiMessages.splice(1, 1);
             estimatedTokens = JSON.stringify(apiMessages).length / 3.5;
          }
          const customHeaders: Record<string, string> = { "Content-Type": "application/json" };
          const openRouterKey = apiKeys.find(k => k.providerId === 'openrouter');
          if (openRouterKey) {
            customHeaders['x-ghost-openrouter-key'] = openRouterKey.key;
            if (openRouterKey.baseUrl) customHeaders['x-ghost-openrouter-baseurl'] = openRouterKey.baseUrl;
          }
          const agentRouterKey = apiKeys.find(k => k.providerId === 'agentrouter');
          if (agentRouterKey) {
            customHeaders['x-ghost-agentrouter-key'] = agentRouterKey.key;
            if (agentRouterKey.baseUrl) customHeaders['x-ghost-agentrouter-baseurl'] = agentRouterKey.baseUrl;
          }

          const request_type = !currentArtifact || chatHistory[chatHistory.length - 1].content.toLowerCase().match(/redesign|make it look better|premium|new style|from scratch/) ? 'build' : 'patch';
          
          const response = await fetch("/api/chat", {
            method: "POST", headers: customHeaders,
            body: JSON.stringify({ messages: apiMessages, model: meta.model.id, max_tokens: 8192, exclude_models: excludeModels, exclude_reasoning: excludeReasoning, request_type }),
            signal: abortControllerRef.current.signal,
          });

          if (!response.ok) {
            const errorText = await response.text();
            let errMsg = errorText;
            let errorAttempts;
            try {
              const parsed = JSON.parse(errorText);
              errMsg = parsed.error || errorText;
              errorAttempts = parsed.attempts;
            } catch(e) {}
            if (response.status === 401 || errMsg.includes('not configured')) {
               setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: `> **Action Required:** Your API key looks invalid or missing. \n\n<button class="px-3 py-1.5 mt-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors shadow-sm" onclick="document.dispatchEvent(new CustomEvent('open-settings'))">Open Settings</button>` } : m));
               return;
            }
            if (errorAttempts) {
               setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, attempts: errorAttempts } : m));
            }
            throw new Error(errMsg);
          }
          
          const usedModel = response.headers.get("X-Model-Used") || meta.model.name;
          const fellBack = response.headers.get("X-Fallback") === 'true';
          const attemptsHeader = response.headers.get("X-Attempts");
          const attempts = attemptsHeader ? JSON.parse(attemptsHeader) : undefined;

          setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, modelUsed: usedModel, fellBack, attempts } : m));

          if (!response.body) throw new Error("No response body");
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          
          let finalContent = "";
          let reasoningContent = "";
          let lastArtifactCode = "";
          let sseBuffer = "";
          let isSSE = false;
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            
            if (chunk.includes("data: ") || isSSE) {
               isSSE = true;
               sseBuffer += chunk;
               let i;
               while ((i = sseBuffer.indexOf('\n')) !== -1) {
                 let line = sseBuffer.slice(0, i).trim();
                 sseBuffer = sseBuffer.slice(i + 1);
                 
                 if (!line || line.startsWith(':')) continue;
                 if (line === 'data: [DONE]') continue;
                 
                 if (line.startsWith('data: ')) {
                   try {
                     const data = JSON.parse(line.slice(6));
                     const delta = data.choices?.[0]?.delta;
                     if (delta) {
                       finalContent += delta.content || "";
                       reasoningContent += delta.reasoning || delta.reasoning_content || delta.reasoning_details || "";
                     }
                     
                     const artifactMatch = finalContent.match(/<artifact type="([^"]+)" title="([^"]+)">([\s\S]*?)(?:<\/artifact>|$)/);
                     if (artifactMatch) {
                       const [, type, title, rawCode] = artifactMatch;
                       const code = cleanArtifactCode(rawCode);
                       if (code !== lastArtifactCode) {
                         lastArtifactCode = code;
                         setCurrentArtifact({ id: assistantId, title, type, code });
                         setIsCanvasOpen(true);
                         setIsSidebarExpanded(false);
                       }
                     }
                     
                     setMessages(prev => prev.map(m => m.id === assistantId ? { 
                       ...m, 
                       content: finalContent || (reasoningContent ? "" : "<patch-retry-state>Ghost is thinking...</patch-retry-state>"),
                       reasoning: reasoningContent 
                     } : m));
                   } catch (e) {}
                 }
               }
            } else {
               finalContent += chunk;
               const artifactMatch = finalContent.match(/<artifact type="([^"]+)" title="([^"]+)">([\s\S]*?)(?:<\/artifact>|$)/);
               if (artifactMatch) {
                 const [, type, title, rawCode] = artifactMatch;
                 const code = cleanArtifactCode(rawCode);
                 if (code !== lastArtifactCode) {
                   lastArtifactCode = code;
                   setCurrentArtifact({ id: assistantId, title, type, code });
                   setIsCanvasOpen(true);
                   setIsSidebarExpanded(false);
                 }
               }
               
               setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: finalContent || "<patch-retry-state>Ghost is thinking...</patch-retry-state>" } : m));
            }
          }
          
          // TRUNCATION GUARD
          const initialArtifactMatch = finalContent.match(/<artifact[^>]*>([\s\S]*?)(?:<\/artifact>|$)/);
          if (initialArtifactMatch && finalContent.includes('<artifact') && !finalContent.includes('</artifact>') && !finalContent.trim().endsWith('</html>')) {
             const lines = finalContent.trimEnd().split('\n');
             const last3 = lines.slice(-3).join('\n');
             setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: `<patch-retry-state>Output truncated, continuing...</patch-retry-state>` } : m));
             const continuePrompt = `Your output was cut off. Continue exactly where you stopped, starting from this last line:\n${last3}\nOutput only the remaining code.`;
             const contMessages = buildApiMessages([...chatHistory, { role: "assistant", content: finalContent } as Message, { role: "user", content: continuePrompt } as Message]);
             
             try {
               const contResponse = await fetch("/api/chat", {
                  method: "POST", headers: customHeaders,
                  body: JSON.stringify({ messages: contMessages, model: meta.model.id, max_tokens: 8192 }),
                  signal: abortControllerRef.current.signal,
               });
               
               if (contResponse.ok && contResponse.body) {
                  const cReader = contResponse.body.getReader();
                  const cDecoder = new TextDecoder();
                  let cFinal = "";
                  let cSseBuffer = "";
                  let cIsSSE = false;
                  while(true) {
                     const { done, value } = await cReader.read();
                     if (done) break;
                     const chunk = cDecoder.decode(value, { stream: true });
                     if (chunk.includes("data: ") || cIsSSE) {
                        cIsSSE = true;
                        cSseBuffer += chunk;
                        let i;
                        while ((i = cSseBuffer.indexOf('\n')) !== -1) {
                           let line = cSseBuffer.slice(0, i).trim();
                           cSseBuffer = cSseBuffer.slice(i + 1);
                           if (!line || line.startsWith(':') || line === 'data: [DONE]') continue;
                           if (line.startsWith('data: ')) {
                              try { cFinal += JSON.parse(line.slice(6)).choices?.[0]?.delta?.content || ""; } catch(e){}
                           }
                        }
                     } else {
                        cFinal += chunk;
                     }
                  }
                  
                  let stitched = finalContent;
                  const matchIdx = cFinal.indexOf(last3);
                  if (matchIdx !== -1) {
                     stitched += cFinal.slice(matchIdx + last3.length);
                  } else {
                     stitched += '\n' + cFinal;
                  }
                  if (!stitched.includes('</artifact>')) stitched += '\n</artifact>';
                  finalContent = stitched;
                  
                  const newMatch = finalContent.match(/<artifact type="([^"]+)" title="([^"]+)">([\s\S]*?)(?:<\/artifact>|$)/);
                  if (newMatch) {
                     lastArtifactCode = cleanArtifactCode(newMatch[3]);
                     setCurrentArtifact({ id: assistantId, title: newMatch[2], type: newMatch[1], code: lastArtifactCode });
                  }
               }
             } catch (e) {}
          }

          // VALIDATION PASS
          if (lastArtifactCode) {
             const issues = [];
             if (!lastArtifactCode.includes('</html>')) issues.push("Missing </html> at the end.");
             
             ['section', 'div', 'main'].forEach(tag => {
                const openCount = (lastArtifactCode.match(new RegExp(`<${tag}[^>]*>`, 'g')) || []).length;
                const closeCount = (lastArtifactCode.match(new RegExp(`</${tag}>`, 'g')) || []).length;
                if (openCount !== closeCount) issues.push(`Unbalanced <${tag}> tags (open: ${openCount}, close: ${closeCount}).`);
             });
             
             if (lastArtifactCode.includes('${')) issues.push("Contains ${} which breaks static HTML.");
             if (lastArtifactCode.includes(': OPENROUTER PROCESSING')) issues.push("Contains ': OPENROUTER PROCESSING' junk.");
             if (/src="https?:\/\//.test(lastArtifactCode)) issues.push("Contains external image URLs. Use inline SVG only.");
             
             if (issues.length > 0 && retryCount < 1) {
                setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: `<patch-retry-state>Fixing HTML issues...</patch-retry-state>` } : m));
                const fixPrompt = `Your generated artifact has the following issues:\n- ${issues.join('\n- ')}\n\nPlease output a <patch> to fix these issues. If they are severe layout/closing tag issues, output a full rewritten <artifact>.`;
                const newHistory = [...chatHistory, { role: "assistant", content: finalContent } as Message, { role: "user", content: fixPrompt } as Message];
                return processTurn(newHistory, retryCount + 1);
             }
          }
          
          const hasForeignTool = /<\|tool_call_start\|>|<tool_call>|\[artifact\(/.test(finalContent);
          const hasValidTag = /<artifact|<patch>/.test(finalContent);
          
          if (hasForeignTool && !hasValidTag) {
             setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: `<patch-retry-state>Model returned invalid format, retrying...</patch-retry-state>` } : m));
             return processTurn(chatHistory, retryCount, [...excludeModels, usedModel], excludeReasoning);
          }
          
          if (!finalContent.trim() && reasoningContent.trim()) {
             if (!excludeReasoning) {
                setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: `<patch-retry-state>Model returned only reasoning, retrying without reasoning...</patch-retry-state>` } : m));
                return processTurn(chatHistory, retryCount, excludeModels, true);
             } else {
                setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: `<patch-retry-state>Model returned only reasoning again, skipping...</patch-retry-state>` } : m));
                return processTurn(chatHistory, retryCount, [...excludeModels, usedModel], excludeReasoning);
             }
          }

          if (!finalContent.trim()) {
             const errMsg = `Received empty response from ${usedModel}. This usually means the provider filtered the request or returned an empty stream.`;
             const failedAttempts = attempts ? [...attempts, {model: usedModel, status: 'failed', errorMessage: 'Empty response'}] : undefined;
             setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: `> **Error:** ${errMsg}`, attempts: failedAttempts } : m));
             await chatDB.addMessage(convId, { id: assistantId, role: "assistant", content: `> **Error:** ${errMsg}`, timestamp: Date.now(), modelUsed: usedModel, fellBack, attempts: failedAttempts });
             return;
          }
          
          const edits = parsePatch(finalContent);
          if (edits.length > 0 && currentArtifact) {
                 const result = applyPatch(currentArtifact.code, edits);
                 if (result.success) {
                    const newCode = cleanArtifactCode(result.code);
                    setCurrentArtifact(prev => prev ? { ...prev, code: newCode } : null);
                    
                    const existing = await chatDB.getArtifacts(convId);
                    const dbArtifact = existing.find(a => a.title === currentArtifact.title);
                    if (dbArtifact) {
                       dbArtifact.currentVersionIndex++;
                       dbArtifact.versions.push({ versionIndex: dbArtifact.currentVersionIndex, content: newCode, createdAt: Date.now() });
                       await chatDB.saveArtifact(dbArtifact);
                    }
                    await chatDB.addMessage(convId, { id: assistantId, role: "assistant", content: finalContent, timestamp: Date.now(), modelUsed: usedModel, fellBack });
                 } else {
                    if (retryCount === 0) {
                       setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: `<patch-retry-state>Ghost is retrying the edit...</patch-retry-state>` } : m));
                       const errorPrompt = `Your last edit failed to apply. Error: ${result.errorMessage}\nFailing <find> block:\n${result.failedFind}\n\nPlease return a corrected <patch> (or full <artifact> if necessary).`;
                       const newHistory = [...chatHistory, { role: "assistant", content: finalContent } as Message, { role: "user", content: errorPrompt } as Message];
                       return processTurn(newHistory, 1);
                    } else if (retryCount === 1) {
                       setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: `<patch-retry-state>Ghost is rewriting the entire file...</patch-retry-state>` } : m));
                       const errorPrompt = `Patch failed again. Please rewrite the entire file using <artifact type="html" title="..."> FULL CODE </artifact>.`;
                       const newHistory = [...chatHistory, { role: "assistant", content: finalContent } as Message, { role: "user", content: errorPrompt } as Message];
                       return processTurn(newHistory, 2);
                    } else {
                       toast.error("Patch application failed permanently.");
                       await chatDB.addMessage(convId, { id: assistantId, role: "assistant", content: finalContent, timestamp: Date.now(), modelUsed: usedModel, fellBack });
                    }
                 }
          } else {
             if (lastArtifactCode) {
                const artifactMatch = finalContent.match(/<artifact type="([^"]+)" title="([^"]+)">([\s\S]*?)(?:<\/artifact>|$)/);
                if (artifactMatch) {
                   await chatDB.saveArtifact({
                      id: assistantId,
                      conversationId: convId,
                      title: artifactMatch[2],
                      type: artifactMatch[1],
                      versions: [{ versionIndex: 1, content: cleanArtifactCode(artifactMatch[3]), createdAt: Date.now() }],
                      currentVersionIndex: 1
                   });
                }
             }
             await chatDB.addMessage(convId, { id: assistantId, role: "assistant", content: finalContent, timestamp: Date.now(), modelUsed: usedModel, fellBack });
          }
        } catch (err: any) {
          if (err.name !== "AbortError") {
             console.error("Chat error:", err.message);
             setMessages(prev => {
                const target = prev.find(m => m.id === assistantId);
                const attempts = target?.attempts;
                chatDB.addMessage(convId, { id: assistantId, role: "assistant", content: `> **Error:** ${err.message}`, timestamp: Date.now(), modelUsed: meta.model.name, fellBack: true, attempts }).catch(console.error);
                return prev.map(m => m.id === assistantId ? {
                 ...m,
                 content: m.content.includes('<patch-retry-state>') ? `> **Error:** ${err.message}` : m.content + `\n\n> **Error:** ${err.message}`
                } : m);
             });
          }
        }
      };

      await processTurn([...messages, userMsg], 0);
      setIsStreaming(false);
      abortControllerRef.current = null;
    } catch (e) {
      setIsStreaming(false);
      abortControllerRef.current = null;
    } finally {
      isSendingRef.current = false;
    }
  };

  const filteredConversations = useMemo(() => {
    if (!searchQuery) return conversations;
    return conversations.filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [conversations, searchQuery]);

  const renderMessageContent = (m: Message) => {
    const parts = m.content.split(/(<artifact[\s\S]*?(?:<\/artifact>|$)|(?:<patch>|\[patch\])[\s\S]*?(?:<\/patch>|\[\/patch\]|$)|<edit>[\s\S]*?(?:<\/edit>|$))/i).filter(Boolean);
    return parts.map((part, i) => {
      if (part.startsWith('<artifact')) {
        const titleMatch = part.match(/title="([^"]+)"/);
        const title = titleMatch ? titleMatch[1] : "Generating Artifact...";
        const isComplete = part.endsWith('</artifact>');
        const rawCode = part.replace(/<artifact[^>]+>|<\/artifact>/g, '').trim();
        const code = cleanArtifactCode(rawCode);

        return (
           <div key={i} onClick={() => { setCurrentArtifact({id: m.id, title, type: 'html', code}); setIsCanvasOpen(true); setIsSidebarExpanded(false); }} className="my-4 cursor-pointer bg-white/60 dark:bg-black/60 border border-white/40 dark:border-white/10 rounded-xl p-4 flex items-center justify-between hover:bg-white/80 dark:hover:bg-white/10 transition-colors shadow-sm w-full max-w-sm">
             <div className="flex items-center gap-3">
               <div className="p-2.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg"><Code className="size-5"/></div>
               <div className="flex flex-col">
                 <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate w-40">{title}</div>
                 <div className="text-xs text-foreground/60">{isComplete ? "Click to open artifact" : "Generating..."}</div>
               </div>
             </div>
             <ArrowRight className="size-4 text-foreground/40" />
           </div>
        );
      }
      
      if (part.match(/^(?:<patch>|\[patch\]|<edit>)/i)) {
         const isComplete = part.match(/(?:<\/patch>|\[\/patch\]|<\/edit>)$/i);
         const editsCount = (part.match(/<edit>/gi) || []).length;
         
         return (
            <div key={i} onClick={() => { setIsCanvasOpen(true); setIsSidebarExpanded(false); }} className="my-4 cursor-pointer bg-white/60 dark:bg-black/60 border border-white/40 dark:border-white/10 rounded-xl p-4 flex items-center justify-between hover:bg-white/80 dark:hover:bg-white/10 transition-colors shadow-sm w-full max-w-sm">
             <div className="flex items-center gap-3">
               <div className="p-2.5 bg-green-500/10 text-green-600 dark:text-green-400 rounded-lg"><Pencil className="size-5"/></div>
               <div className="flex flex-col">
                 <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate w-40">Edited Artifact</div>
                 <div className="text-xs text-foreground/60">{isComplete ? `${editsCount} changes applied` : "Applying changes..."}</div>
               </div>
             </div>
             <ArrowRight className="size-4 text-foreground/40" />
           </div>
         );
      }

      if (part.startsWith('<patch-retry-state>')) {
         const text = part.replace(/<patch-retry-state[^>]*>|<\/patch-retry-state>/g, '').trim();
         return <div key={i} className="my-4 pl-2"><ShiningText text={text} /></div>;
      }

      return (
         <div key={i} className="prose prose-sm dark:prose-invert max-w-none break-words text-gray-900 dark:text-gray-100">
           <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>{part}</ReactMarkdown>
         </div>
      );
    });
  };

  const renderSidebarContent = (isMobileParam: boolean = false) => {
    const expanded = isMobileParam ? true : isSidebarExpanded;
    return (
      <div className={cn("flex flex-col h-full", isMobileParam ? "w-72" : "w-full")}>
         <div className="flex items-center justify-between h-14 shrink-0 px-3">
            <AnimatePresence>
              {expanded && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex-1 overflow-hidden pl-1">
                   <span className="font-[family-name:var(--font-display)] italic text-[26px] leading-none tracking-tight text-gray-900 dark:text-gray-100 whitespace-nowrap">Ghost</span>
                </motion.div>
              )}
            </AnimatePresence>
            {!isMobileParam && (
              <button onClick={toggleSidebar} className="shrink-0 p-1.5 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-white/10 transition-colors" title="Toggle Sidebar (Cmd+B)">
                 <PanelLeft className="size-[18px]" />
              </button>
            )}
            {isMobileParam && (
              <button onClick={() => setIsMobileOpen(false)} className="shrink-0 p-1.5 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-white/10">
                 <X className="size-[18px]" />
              </button>
            )}
         </div>
         
         <div className="px-3 mt-2 space-y-1 shrink-0 flex flex-col items-center w-full">
           <button onClick={() => switchConversation(null)} className={cn("flex items-center justify-center rounded-lg text-gray-700 dark:text-gray-300 transition-colors hover:bg-white/60 dark:hover:bg-white/10", expanded ? "w-full py-2 px-2.5 justify-start gap-3" : "w-[36px] h-[36px]")} title={!expanded ? "New chat" : undefined}>
             <Plus className="size-[18px] shrink-0" />
             {expanded && <span className="text-[13px] font-medium whitespace-nowrap text-gray-900 dark:text-gray-100">New chat</span>}
           </button>
           
           <button onClick={handleSearchClick} className={cn("flex items-center justify-center rounded-lg text-gray-700 dark:text-gray-300 transition-colors hover:bg-white/60 dark:hover:bg-white/10", expanded ? "w-full py-2 px-2.5 justify-start gap-3" : "w-[36px] h-[36px]")} title={!expanded ? "Search chats" : undefined}>
             <Search className="size-[18px] shrink-0" />
             {expanded && <span className="text-[13px] font-medium whitespace-nowrap text-gray-900 dark:text-gray-100">Search chats</span>}
           </button>
           
           {expanded && isSearching && (
             <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="px-1 py-2 w-full overflow-hidden">
               <input 
                 ref={searchInputRef} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search..."
                 className="w-full bg-white/40 dark:bg-black/40 border border-white/50 dark:border-white/10 rounded-md px-2 py-1.5 text-[13px] outline-none text-gray-900 dark:text-gray-100 shadow-sm"
               />
             </motion.div>
           )}
           
           <button className={cn("flex items-center justify-center rounded-lg text-gray-700 dark:text-gray-300 transition-colors hover:bg-white/60 dark:hover:bg-white/10", expanded ? "w-full py-2 px-2.5 justify-start gap-3" : "w-[36px] h-[36px]")} title={!expanded ? "Chats" : undefined}>
             <MessageSquare className="size-[18px] shrink-0" />
             {expanded && <span className="text-[13px] font-medium whitespace-nowrap text-gray-900 dark:text-gray-100">Chats</span>}
           </button>
         </div>
         
         <div className="flex-1 overflow-y-auto overflow-x-hidden mt-6 flex flex-col group/list relative">
           <div className="absolute inset-y-0 right-0 w-[3px] bg-transparent group-hover/list:bg-gray-300 dark:group-hover/list:bg-gray-700 transition-colors opacity-0 group-hover/list:opacity-100 rounded-full" />
           
           {expanded && (
             <div className="px-5 mb-1.5">
               <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 capitalize whitespace-nowrap tracking-wide">Recents</span>
             </div>
           )}
           
           <div className="flex-1 px-3 space-y-0.5 pb-2">
             {filteredConversations.map(c => (
                <div 
                  key={c.id} onMouseEnter={() => setHoveredConvId(c.id)} onMouseLeave={() => { setHoveredConvId(null); setMenuOpenId(null); setIsDeletingId(null); }}
                  className={cn("relative flex items-center rounded-lg transition-colors group/item min-h-[36px]", expanded ? "px-2.5" : "justify-center", activeConversationId === c.id ? "bg-white/80 dark:bg-white/10 text-gray-900 dark:text-gray-100" : "text-gray-700 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-white/5")}
                >
                  {!expanded ? (
                    <button onClick={() => switchConversation(c.id)} className="w-9 h-9 flex items-center justify-center" title={c.title}>
                       <div className="w-1.5 h-1.5 rounded-full bg-current opacity-40 group-hover/item:opacity-100 transition-opacity" />
                    </button>
                  ) : (
                    <>
                      {isRenamingId === c.id ? (
                        <input 
                          autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)} onBlur={() => commitRename(c.id)} onKeyDown={e => e.key === 'Enter' && commitRename(c.id)}
                          className="flex-1 bg-white/60 dark:bg-black/60 outline-none px-1.5 py-0.5 text-[13px] text-gray-900 dark:text-gray-100 border border-white/50 dark:border-white/20 rounded shadow-sm"
                        />
                      ) : (
                        <button onClick={() => switchConversation(c.id)} className="flex-1 truncate text-left text-[13px] leading-[36px] font-medium text-gray-800 dark:text-gray-200">
                           {c.title || "New Chat"}
                        </button>
                      )}
                      
                      {hoveredConvId === c.id && isRenamingId !== c.id && (
                        <div className="absolute right-1.5 flex items-center bg-transparent">
                          {isDeletingId === c.id ? (
                            <div className="flex items-center gap-1 bg-white dark:bg-gray-800 backdrop-blur-xl rounded-md p-0.5 shadow-sm border border-gray-200 dark:border-gray-700">
                              <button onClick={() => confirmDelete(c.id)} className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"><Check className="size-3.5"/></button>
                              <button onClick={() => setIsDeletingId(null)} className="p-1 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"><X className="size-3.5"/></button>
                            </div>
                          ) : (
                            <button onClick={() => setMenuOpenId(menuOpenId === c.id ? null : c.id)} className="p-1 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-white/80 dark:hover:bg-white/20 rounded-md transition-colors backdrop-blur-sm">
                              <MoreHorizontal className="size-[18px]" />
                            </button>
                          )}
                          
                          {menuOpenId === c.id && !isDeletingId && (
                            <div className="absolute right-0 top-full mt-1 w-32 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl text-gray-900 dark:text-gray-100 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-1 z-[100] flex flex-col">
                              <button onClick={() => startRename(c.id, c.title)} className="flex items-center gap-2 px-2 py-1.5 text-[13px] hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md text-left w-full"><Pencil className="size-3.5"/> Rename</button>
                              <button onClick={() => setIsDeletingId(c.id)} className="flex items-center gap-2 px-2 py-1.5 text-[13px] hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 rounded-md text-left w-full"><Trash className="size-3.5"/> Delete</button>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
             ))}
           </div>
         </div>

         <div className="p-3 border-t border-white/30 dark:border-white/10 shrink-0 flex flex-col items-center w-full">
            <button onClick={() => setSettingsOpen(true)} className={cn("flex items-center justify-center rounded-lg text-gray-700 dark:text-gray-300 transition-colors hover:bg-white/60 dark:hover:bg-white/10", expanded ? "w-full py-2 px-2.5 justify-start gap-3" : "w-[36px] h-[36px]")} title="Settings">
               <Settings className="size-[18px] shrink-0" />
               {expanded && <span className="text-[13px] font-medium whitespace-nowrap text-gray-900 dark:text-gray-100">Settings</span>}
            </button>
         </div>
      </div>
    );
  };

  return (
    <>
      <div 
        style={{ position: 'fixed', inset: 0, zIndex: -1, backgroundImage: theme === 'light' ? lightGradient : darkGradient, transition: "background-image 0.5s ease" }}
      />

      <div className="flex h-screen overflow-hidden text-foreground font-sans w-full">
        
        <motion.aside 
          initial={false}
          animate={{ width: isSidebarExpanded ? 280 : 64 }}
          transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.3 }}
          className="hidden md:flex h-full shrink-0 flex-col bg-white/1 dark:bg-black/1 backdrop-blur-xl border-r border-white/20 dark:border-white/10 overflow-hidden z-40"
        >
          {renderSidebarContent(false)}
        </motion.aside>

        <AnimatePresence>
          {isMobileOpen && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="md:hidden fixed inset-0 z-40 bg-black/20 backdrop-blur-sm" onClick={() => setIsMobileOpen(false)} />
              <motion.aside initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", bounce: 0, duration: 0.4 }} className="md:hidden fixed inset-y-0 left-0 z-50 h-full w-72 flex flex-col bg-white/1 dark:bg-black/1 backdrop-blur-2xl border-r border-white/20 dark:border-white/10 shadow-2xl overflow-hidden">
                {renderSidebarContent(true)}
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        <Group orientation="horizontal" className="flex-1 overflow-hidden h-full z-10">
          <Panel minSize={30} defaultSize={isCanvasOpen && !isMobile ? 50 : 100} className="flex flex-col relative h-full">
             <header className="md:hidden flex items-center justify-between p-3 sticky top-0 z-30">
                <button onClick={() => setIsMobileOpen(true)} className="p-2 rounded-lg bg-white/50 dark:bg-black/50 backdrop-blur-xl border border-white/40 dark:border-white/10 text-gray-900 dark:text-gray-100 shadow-sm">
                  <PanelLeft className="size-5" />
                </button>
             </header>

             <div className="flex-1 relative overflow-hidden flex flex-col h-full pt-12 md:pt-16">
               {!activeConversationId ? (
                 <motion.div layout className="flex-1 flex flex-col items-center justify-center p-4 pb-20">
                    <motion.div layoutId="header-text" className="flex flex-col items-center mb-10 text-center">
                      <h2 className="font-[family-name:var(--font-display)] italic text-gray-900/80 dark:text-gray-100/80 px-4" style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)", letterSpacing: "-0.02em", lineHeight: 1.02 }}>
                        What will we build today?
                      </h2>
                      {serverConfig.length > 0 && apiKeys.length === 0 && !serverConfig.some(c => c.hasDefaultKey) && (
                        <button onClick={() => setSettingsOpen(true)} className="mt-8 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-600 dark:text-orange-400 font-medium text-sm hover:bg-orange-500/20 transition-colors shadow-sm">
                          <Key className="size-4" /> Add an API Key to get started
                        </button>
                      )}
                    </motion.div>
                    
                    <motion.div layoutId="prompt-input" className="w-full max-w-3xl">
                       <PromptInput onSubmit={handleSend} isStreaming={isStreaming} onStop={handleStop} value={inputValue} onChange={setInputValue} />
                    </motion.div>
                 </motion.div>
               ) : (
                 <div className="flex-1 flex flex-col h-full relative">
                   <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 scroll-smooth" ref={messagesContainerRef} onScroll={handleScroll}>
                     <div className="max-w-4xl mx-auto w-full space-y-6 pb-4">
                        {messages.map(m => {
                          const isThinking = m.role === "assistant" && !!m.content.match(/^<patch-retry-state>[\s\S]*<\/patch-retry-state>$/);
                          
                          return (
                          <div key={m.id} className={cn("flex flex-col gap-1.5 w-full", m.role === "user" ? "items-end" : "items-start")}>
                             {!isThinking && (
                               <div className="flex items-center gap-2 px-2">
                                  <span className="text-xs font-semibold opacity-60 flex items-center gap-2">
                                    {m.role === "assistant" ? `Answered by ${m.modelUsed || "Ghost"}` : "You"}
                                    {m.fellBack && <span className="text-[10px] text-orange-500 font-medium px-1.5 py-0.5 bg-orange-500/10 rounded-md border border-orange-500/20">(Provider failed, fell back to this model)</span>}
                                  </span>
                               </div>
                             )}
                             
                             <div className={cn(
                               "max-w-[85%]",
                               !isThinking && "px-5 py-4 rounded-3xl border shadow-sm bg-white/50 dark:bg-black/50 backdrop-blur-xl border-white/40 dark:border-white/10"
                             )}>
                                {m.role === "assistant" && !m.content && isStreaming ? (
                                  <div className="animate-pulse flex gap-1.5 items-center h-6 px-1">
                                    <div className="w-2 h-2 bg-foreground/50 rounded-full"/><div className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce"/><div className="w-2 h-2 bg-foreground/50 rounded-full"/>
                                  </div>
                                ) : isThinking ? (
                                  <div className="py-2 pl-2 text-sm text-muted-foreground">
                                    <ShiningText text={m.content.replace(/<patch-retry-state[^>]*>|<\/patch-retry-state>/g, '').trim()} />
                                  </div>
                                ) : (
                                  <>
                                    {m.role === "assistant" && m.attempts && m.attempts.length > 0 && (
                                      <div className="mb-4">
                                        <details className="text-xs group cursor-pointer">
                                          <summary className="font-medium text-foreground/60 select-none flex items-center gap-1.5 opacity-80 hover:opacity-100 transition-opacity">
                                            <ChevronRight className="size-3 group-open:rotate-90 transition-transform" />
                                            Attempts ({m.attempts.length})
                                          </summary>
                                          <div className="mt-2 ml-4 flex flex-col gap-1 border-l-2 border-foreground/10 pl-3 py-1 text-foreground/70">
                                            {m.attempts.map((att: any, idx: number) => (
                                              <div key={idx} className="flex flex-col mb-1 border-b border-foreground/5 pb-1 last:border-0 last:pb-0">
                                                <div className="flex items-center gap-2">
                                                  <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", att.status === 'success' ? "bg-green-500" : "bg-red-500")}/>
                                                  <span className="font-semibold text-foreground/90">{att.model}</span>
                                                  <span className="text-foreground/50 tabular-nums">({att.ttfbMs}ms)</span>
                                                  {att.httpStatus && <span className="bg-foreground/10 px-1 py-0.5 rounded text-[10px] font-mono leading-none">{att.httpStatus}</span>}
                                                </div>
                                                {att.status === 'failed' && (
                                                  <div className="text-[11px] text-red-500/90 break-words line-clamp-2 leading-tight ml-3.5 mt-0.5">
                                                    {att.errorType ? `[${att.errorType}] ` : ''}{att.errorMessage}
                                                  </div>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        </details>
                                      </div>
                                    )}
                                    {m.role === "assistant" && m.reasoning && (
                                      <div className="mb-4">
                                        <details className="text-sm text-muted-foreground group">
                                          <summary className="cursor-pointer select-none font-medium flex items-center gap-2 opacity-70 hover:opacity-100 transition-opacity">
                                             <Brain className="size-4" /> Thinking...
                                          </summary>
                                          <div className="mt-2 p-3 bg-black/5 dark:bg-white/5 rounded-lg border border-black/10 dark:border-white/10 italic prose prose-sm dark:prose-invert">
                                             <ReactMarkdown>{m.reasoning}</ReactMarkdown>
                                          </div>
                                        </details>
                                      </div>
                                    )}
                                    {renderMessageContent(m)}
                                  </>
                                )}
                                
                                {m.attachments && m.attachments.length > 0 && !isThinking && (
                                   <div className="flex flex-wrap gap-2 mt-4">
                                      {m.attachments.map(a => (
                                         a.type === "image" ? (
                                           <img key={a.id} src={a.data as string} className="h-24 w-auto rounded-xl object-cover border border-white/40 dark:border-white/10 shadow-sm" alt="attachment" />
                                         ) : (
                                           <div key={a.id} className="h-24 w-32 bg-white/40 dark:bg-black/40 rounded-xl flex flex-col items-center justify-center border border-white/40 dark:border-white/10 gap-2 p-2 text-center overflow-hidden shadow-sm">
                                             <FileText className="size-8 opacity-70"/>
                                             <span className="text-xs font-semibold truncate w-full text-gray-900 dark:text-gray-100">{a.name}</span>
                                           </div>
                                         )
                                      ))}
                                   </div>
                                )}
                             </div>
                             
                             {!isThinking && (
                               <div className={cn("flex items-center gap-1 mt-1 px-2", m.role === "user" ? "justify-end" : "justify-start")}>
                                 <button 
                                   onClick={() => {
                                     navigator.clipboard.writeText(m.content);
                                     toast.success("Copied to clipboard");
                                   }} 
                                   className="p-1.5 text-foreground/40 hover:text-foreground/80 hover:bg-white/40 dark:hover:bg-white/10 rounded-md transition-colors"
                                   title="Copy message"
                                 >
                                   <Copy className="size-3.5" />
                                 </button>
                                 <button 
                                   onClick={() => {
                                     setInputValue(m.content);
                                   }}
                                   className="p-1.5 text-foreground/40 hover:text-foreground/80 hover:bg-white/40 dark:hover:bg-white/10 rounded-md transition-colors"
                                   title="Edit message"
                                 >
                                   <Pencil className="size-3.5" />
                                 </button>
                               </div>
                             )}
                          </div>
                        )})}
                     </div>
                   </div>

                   <AnimatePresence>
                     {!autoScroll && (
                       <motion.button
                         initial={{ opacity: 0, y: 10, scale: 0.9 }}
                         animate={{ opacity: 1, y: 0, scale: 1 }}
                         exit={{ opacity: 0, y: 10, scale: 0.9 }}
                         onClick={() => {
                            setAutoScroll(true);
                            if (messagesContainerRef.current) {
                               messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
                            }
                         }}
                         className="absolute bottom-28 left-1/2 -translate-x-1/2 p-2.5 rounded-full bg-white dark:bg-black text-gray-900 dark:text-white shadow-xl border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors z-50 flex items-center justify-center"
                       >
                         <ArrowDown className="size-4" />
                       </motion.button>
                     )}
                   </AnimatePresence>

                   <div className="p-4 md:px-8 pb-8 shrink-0 flex justify-center w-full">
                      <motion.div layoutId="prompt-input" className="w-full max-w-4xl">
                         <PromptInput onSubmit={handleSend} isStreaming={isStreaming} onStop={handleStop} value={inputValue} onChange={setInputValue} />
                      </motion.div>
                   </div>
                 </div>
               )}
             </div>
          </Panel>

          {isCanvasOpen && !isMobile && (
            <>
              <Separator className="w-1.5 bg-border/20 hover:bg-blue-500/50 active:bg-blue-500 transition-colors cursor-col-resize z-50" />
              <Panel minSize={30} defaultSize={50} className="h-full z-40 bg-white/50 dark:bg-black/50 backdrop-blur-2xl">
                 <CanvasPanel artifact={currentArtifact} onClose={() => setIsCanvasOpen(false)} onUpdate={(code) => setCurrentArtifact(prev => prev ? {...prev, code} : null)} />
              </Panel>
            </>
          )}
        </Group>

        {/* Mobile Canvas Fullscreen Overlay */}
        <AnimatePresence>
          {isCanvasOpen && isMobile && (
            <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }} className="fixed inset-0 z-[60] bg-background">
               <CanvasPanel artifact={currentArtifact} onClose={() => setIsCanvasOpen(false)} onUpdate={(code) => setCurrentArtifact(prev => prev ? {...prev, code} : null)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <SettingsDialog 
        isOpen={settingsOpen} 
        onClose={() => setSettingsOpen(false)} 
        theme={theme} 
        toggleTheme={toggleTheme}
        apiKeys={apiKeys}
        setApiKeys={setApiKeys}
        serverConfig={serverConfig}
      />
    </>
  );
}

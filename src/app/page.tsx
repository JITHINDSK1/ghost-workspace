"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { PromptInput, Attachment } from "@/components/ui/ai-chat-input";
import { ModelConfig } from "@/config/models.config";
import { chatDB, Message, Conversation } from "@/lib/db";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css'; 
import { FileText, Plus, Moon, Sun, PanelLeft, Settings, Search, MessageSquare, MoreHorizontal, Pencil, Trash, Check, X, Code, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
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
  
  const [autoScroll, setAutoScroll] = useState(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  
  const [isMobile, setIsMobile] = useState(false);
  
  // Canvas State
  const [isCanvasOpen, setIsCanvasOpen] = useState(false);
  const [currentArtifact, setCurrentArtifact] = useState<CanvasArtifact | null>(null);

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
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', checkMobile);
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
    // Include current artifact context if modifying
    if (currentArtifact && isCanvasOpen) {
       context += `\n\n--- Current Artifact Code ---\n${currentArtifact.code}\n`;
    }
    return context;
  };

  const handleSend = async (content: string, meta: { model: ModelConfig; effort: string; attachments: Attachment[] }) => {
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
    setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: "", timestamp: Date.now(), modelUsed: meta.model.name }]);

    try {
      const systemPrompt = {
        role: "system",
        content: "When providing code for a webpage, app, or component, you MUST use the following format with ONE complete self-contained HTML file (inline CSS and JS). Do not use markdown blocks for the code. Format:\n<artifact type=\"html\" title=\"Short title\">...full code...</artifact>\nRespond with only plain chat text outside the artifact."
      };
      
      const apiMessages = [systemPrompt as Message, ...messages, userMsg].map((m: any) => {
        if (m.attachments && m.attachments.some((a: any) => a.type === 'image')) {
          const parts: any[] = [{ type: "text", text: m.content }];
          m.attachments.forEach((a: any) => {
            if (a.type === 'image' && a.data) parts.push({ type: "image_url", image_url: { url: a.data } });
          });
          return { role: m.role, content: parts };
        }
        return { role: m.role, content: m.content };
      });

      const response = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, model: meta.model.id }),
        signal: abortControllerRef.current.signal,
      });
      
      if (!response.body) throw new Error("No response body");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      let finalContent = "";
      let lastArtifactCode = "";
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        
        if (chunk.includes("data: ")) {
          const lines = chunk.split("\n");
          for (const line of lines) {
             if (line.startsWith("data: ") && !line.includes("[DONE]")) {
                try {
                  const data = JSON.parse(line.slice(6));
                  finalContent += data.choices?.[0]?.delta?.content || "";
                  
                  // Live parsing of artifact
                  const artifactMatch = finalContent.match(/<artifact type="([^"]+)" title="([^"]+)">([\s\S]*?)(?:<\/artifact>|$)/);
                  if (artifactMatch) {
                    const [, type, title, code] = artifactMatch;
                    if (code !== lastArtifactCode) {
                      lastArtifactCode = code;
                      setCurrentArtifact({ id: assistantId, title, type, code });
                      setIsCanvasOpen(true);
                      setIsSidebarExpanded(false); // auto-collapse
                    }
                  }
                  
                  setMessages(prev => {
                    const newMsgs = [...prev];
                    newMsgs[newMsgs.length - 1].content = finalContent;
                    return newMsgs;
                  });
                } catch (e) {}
             }
          }
        } else {
           finalContent += chunk;
           // Plain text fallback matching
           const artifactMatch = finalContent.match(/<artifact type="([^"]+)" title="([^"]+)">([\s\S]*?)(?:<\/artifact>|$)/);
           if (artifactMatch) {
             const [, type, title, code] = artifactMatch;
             if (code !== lastArtifactCode) {
               lastArtifactCode = code;
               setCurrentArtifact({ id: assistantId, title, type, code });
               setIsCanvasOpen(true);
               setIsSidebarExpanded(false);
             }
           }
           
           setMessages(prev => {
             const newMsgs = [...prev];
             newMsgs[newMsgs.length - 1].content = finalContent;
             return newMsgs;
           });
        }
      }
      
      // Save finalized artifact to DB if one was created
      if (lastArtifactCode) {
         const artifactMatch = finalContent.match(/<artifact type="([^"]+)" title="([^"]+)">([\s\S]*?)(?:<\/artifact>|$)/);
         if (artifactMatch) {
            await chatDB.saveArtifact({
               id: assistantId,
               conversationId: convId,
               title: artifactMatch[2],
               type: artifactMatch[1],
               versions: [{ versionIndex: 1, content: artifactMatch[3], createdAt: Date.now() }],
               currentVersionIndex: 1
            });
         }
      }
      
      await chatDB.addMessage(convId, { id: assistantId, role: "assistant", content: finalContent, timestamp: Date.now(), modelUsed: meta.model.name });
    } catch (err: any) {
      if (err.name !== "AbortError") console.error("Chat error", err);
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const filteredConversations = useMemo(() => {
    if (!searchQuery) return conversations;
    return conversations.filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [conversations, searchQuery]);

  const renderMessageContent = (m: Message) => {
    const parts = m.content.split(/(<artifact[\s\S]*?(?:<\/artifact>|$))/).filter(Boolean);
    return parts.map((part, i) => {
      if (part.startsWith('<artifact')) {
        const titleMatch = part.match(/title="([^"]+)"/);
        const title = titleMatch ? titleMatch[1] : "Generating Artifact...";
        const isComplete = part.endsWith('</artifact>');
        const code = part.replace(/<artifact[^>]+>|<\/artifact>/g, '').trim();

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

        <PanelGroup direction="horizontal" className="flex-1 overflow-hidden h-full z-10">
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
                    </motion.div>
                    
                    <motion.div layoutId="prompt-input" className="w-full max-w-3xl">
                       <PromptInput onSubmit={handleSend} isStreaming={isStreaming} onStop={handleStop} />
                    </motion.div>
                 </motion.div>
               ) : (
                 <div className="flex-1 flex flex-col h-full">
                   <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 scroll-smooth" ref={messagesContainerRef} onScroll={handleScroll}>
                     <div className="max-w-4xl mx-auto w-full space-y-6 pb-4">
                        {messages.map(m => (
                          <div key={m.id} className={cn("flex flex-col gap-1.5 w-full", m.role === "user" ? "items-end" : "items-start")}>
                             <div className="flex items-center gap-2 px-2">
                                <span className="text-xs font-semibold opacity-60">
                                  {m.role === "assistant" ? (m.modelUsed || "Ghost") : "You"}
                                </span>
                             </div>
                             
                             <div className={cn("px-5 py-4 rounded-3xl max-w-[85%] border shadow-sm", "bg-white/50 dark:bg-black/50 backdrop-blur-xl border-white/40 dark:border-white/10")}>
                                {m.role === "assistant" && !m.content && isStreaming ? (
                                  <div className="animate-pulse flex gap-1.5 items-center h-6 px-1">
                                    <div className="w-2 h-2 bg-foreground/50 rounded-full"/><div className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce"/><div className="w-2 h-2 bg-foreground/50 rounded-full"/>
                                  </div>
                                ) : (
                                  renderMessageContent(m)
                                )}
                                
                                {m.attachments && m.attachments.length > 0 && (
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
                          </div>
                        ))}
                     </div>
                   </div>

                   <div className="p-4 md:px-8 pb-8 shrink-0 flex justify-center w-full">
                      <motion.div layoutId="prompt-input" className="w-full max-w-4xl">
                         <PromptInput onSubmit={handleSend} isStreaming={isStreaming} onStop={handleStop} />
                      </motion.div>
                   </div>
                 </div>
               )}
             </div>
          </Panel>

          {isCanvasOpen && !isMobile && (
            <>
              <PanelResizeHandle className="w-1.5 bg-border/20 hover:bg-blue-500/50 active:bg-blue-500 transition-colors cursor-col-resize z-50" />
              <Panel minSize={30} defaultSize={50} className="h-full z-40 bg-white/50 dark:bg-black/50 backdrop-blur-2xl">
                 <CanvasPanel artifact={currentArtifact} onClose={() => setIsCanvasOpen(false)} onUpdate={(code) => setCurrentArtifact(prev => prev ? {...prev, code} : null)} />
              </Panel>
            </>
          )}
        </PanelGroup>

        {/* Mobile Canvas Fullscreen Overlay */}
        <AnimatePresence>
          {isCanvasOpen && isMobile && (
            <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }} className="fixed inset-0 z-[60] bg-background">
               <CanvasPanel artifact={currentArtifact} onClose={() => setIsCanvasOpen(false)} onUpdate={(code) => setCurrentArtifact(prev => prev ? {...prev, code} : null)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {settingsOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={() => setSettingsOpen(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }} onClick={e => e.stopPropagation()} className="bg-white/80 dark:bg-black/80 backdrop-blur-2xl border border-white/50 dark:border-white/10 p-6 rounded-3xl w-full max-w-sm shadow-2xl flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100 tracking-tight">Settings</h3>
                <button onClick={() => setSettingsOpen(false)} className="p-1.5 hover:bg-white/60 dark:hover:bg-white/10 rounded-xl text-gray-500 dark:text-gray-400 transition-colors"><X className="size-5"/></button>
              </div>
              
              <div className="flex flex-col gap-2">
                 <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest px-1">Appearance</div>
                 <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/60 dark:bg-white/5 border border-white/50 dark:border-white/10 shadow-sm">
                   <div className="flex items-center gap-3">
                     {theme === 'dark' ? <Moon className="size-5 text-gray-900 dark:text-gray-100"/> : <Sun className="size-5 text-gray-900 dark:text-gray-100"/>}
                     <span className="font-medium text-[15px] text-gray-900 dark:text-gray-100">Dark Mode</span>
                   </div>
                   <button onClick={toggleTheme} className={cn("w-11 h-6 rounded-full flex items-center px-1 transition-colors shadow-inner", theme === 'dark' ? "bg-blue-500 justify-end" : "bg-gray-300 dark:bg-gray-700 justify-start")}>
                     <motion.div layout className="size-4 bg-white rounded-full shadow-sm" />
                   </button>
                 </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

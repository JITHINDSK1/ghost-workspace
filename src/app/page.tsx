"use client";

import { useEffect, useState, useRef } from "react";
import { PromptInput, Attachment } from "@/components/ui/ai-chat-input";
import { ModelConfig } from "@/config/models.config";
import { chatDB, Message, Conversation } from "@/lib/db";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css'; 
import { FileText, Plus, Moon, Sun, PanelLeft, Settings } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";

// Original Gradient - at full brightness
const lightGradient = "radial-gradient(125% 125% at 50% 101%, rgba(245,87,2,1) 10.5%, rgba(245,120,2,1) 16%, rgba(245,140,2,1) 17.5%, rgba(245,170,100,1) 25%, rgba(238,174,202,1) 40%, rgba(202,179,214,1) 65%, rgba(148,201,233,1) 100%)";

// Deep, rich dark version
const darkGradient = "radial-gradient(125% 125% at 50% 101%, rgba(120,40,0,1) 10.5%, rgba(120,60,0,1) 16%, rgba(120,70,0,1) 17.5%, rgba(120,80,40,1) 25%, rgba(110,80,100,1) 40%, rgba(90,80,100,1) 65%, rgba(60,90,110,1) 100%)";

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "dark" : "light");
    
    const savedSidebar = localStorage.getItem("sidebarOpen");
    if (savedSidebar) {
      setIsSidebarOpen(savedSidebar === "true");
    }
    
    loadConversations();
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
    setIsSidebarOpen(prev => {
      const next = !prev;
      localStorage.setItem("sidebarOpen", String(next));
      return next;
    });
  };

  const handleScroll = () => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isNearBottom);
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
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
      localStorage.setItem("sidebarOpen", "false");
    }
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
        } catch (e) {
          console.warn("Could not read file", a.name);
        }
      } else if (a.type === 'pdf') {
         context += `\n\n--- File: ${a.name} (PDF text extraction requires additional libraries) ---\n`;
      }
    }
    return context;
  };

  const handleSend = async (content: string, meta: { model: ModelConfig; effort: string; attachments: Attachment[] }) => {
    let convId = activeConversationId;
    if (!convId) {
      convId = Date.now().toString();
      await chatDB.createConversation(convId, content.substring(0, 30) + (content.length > 30 ? "..." : ""));
      setActiveConversationId(convId);
      loadConversations();
    }

    const extraContext = await extractContext(meta.attachments);
    const augmentedContent = extraContext ? `${content}${extraContext}` : content;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: augmentedContent,
      timestamp: Date.now(),
      attachments: meta.attachments.map(a => ({
        id: a.id, name: a.name, type: a.type, data: a.base64 || a.url
      }))
    };
    
    setMessages(prev => [...prev, userMsg]);
    await chatDB.addMessage(convId, userMsg);
    
    setIsStreaming(true);
    setAutoScroll(true);
    abortControllerRef.current = new AbortController();
    
    const assistantId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, {
       id: assistantId, role: "assistant", content: "", timestamp: Date.now(), modelUsed: meta.model.name
    }]);

    try {
      const apiMessages = [...messages, userMsg].map(m => {
        if (m.attachments && m.attachments.some(a => a.type === 'image')) {
          const parts: any[] = [{ type: "text", text: m.content }];
          m.attachments.forEach(a => {
            if (a.type === 'image' && a.data) {
              parts.push({ type: "image_url", image_url: { url: a.data } });
            }
          });
          return { role: m.role, content: parts };
        }
        return { role: m.role, content: m.content };
      });

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
           messages: apiMessages,
           model: meta.model.id 
        }),
        signal: abortControllerRef.current.signal,
      });
      
      if (!response.body) throw new Error("No response body");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      let finalContent = "";
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
                  const token = data.choices?.[0]?.delta?.content || "";
                  finalContent += token;
                  
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
           setMessages(prev => {
             const newMsgs = [...prev];
             newMsgs[newMsgs.length - 1].content = finalContent;
             return newMsgs;
           });
        }
      }
      
      await chatDB.addMessage(convId, {
         id: assistantId, role: "assistant", content: finalContent, timestamp: Date.now(), modelUsed: meta.model.name
      });
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("Chat error", err);
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  return (
    <>
      {/* Fixed Full Screen Background Layer */}
      <div 
        style={{
          position: 'fixed', inset: 0, zIndex: -1,
          backgroundImage: theme === 'light' ? lightGradient : darkGradient,
          transition: "background-image 0.5s ease"
        }}
      />

      <div className="flex h-screen overflow-hidden text-foreground font-sans w-full">
        
        {/* Sidebar */}
        <AnimatePresence initial={false}>
          {isSidebarOpen && (
            <>
              {/* Mobile Backdrop */}
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="md:hidden fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
                onClick={() => setIsSidebarOpen(false)}
              />
              
              <motion.aside 
                initial={{ x: "-100%", width: 0 }}
                animate={{ x: 0, width: 288 }} // 288px = w-72
                exit={{ x: "-100%", width: 0 }}
                transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                className="fixed md:relative z-50 h-full shrink-0 flex flex-col bg-white/50 dark:bg-black/50 backdrop-blur-xl border-r border-white/40 dark:border-white/10 overflow-hidden shadow-xl md:shadow-none"
              >
                 <div className="w-72 h-full flex flex-col">
                    <div className="p-4 flex items-center h-20 border-b border-white/30 dark:border-white/10 shrink-0 pl-16 md:pl-4">
                       <span className="font-[family-name:var(--font-display)] italic text-4xl tracking-tight text-gray-900 dark:text-gray-100">Ghost</span>
                    </div>
                    <div className="p-4 shrink-0">
                       <button onClick={() => switchConversation(null)} className="w-full flex items-center justify-center gap-2 bg-white/70 dark:bg-black/70 hover:bg-white dark:hover:bg-black/90 py-3 px-4 rounded-xl transition-colors font-medium border border-white/50 dark:border-white/10 text-gray-900 dark:text-gray-100 shadow-sm">
                          <Plus className="size-4" /> New Chat
                       </button>
                    </div>
                    <div className="flex-1 overflow-y-auto px-3 space-y-1 py-2">
                       <div className="text-[10px] font-bold text-foreground/50 uppercase tracking-widest mb-2 px-2">Recent</div>
                       {conversations.map(c => (
                          <button key={c.id} onClick={() => switchConversation(c.id)} className={cn("w-full text-left px-3 py-2.5 rounded-xl truncate text-sm transition-colors border border-transparent", activeConversationId === c.id ? "bg-white/60 dark:bg-black/60 font-semibold border-white/30 dark:border-white/10 shadow-sm text-gray-900 dark:text-gray-100" : "hover:bg-white/40 dark:hover:bg-black/40 text-foreground/80")}>
                             {c.title || "New Chat"}
                          </button>
                       ))}
                    </div>
                    <div className="p-4 border-t border-white/30 dark:border-white/10 shrink-0">
                       <button onClick={toggleTheme} className="flex items-center gap-3 w-full px-3 py-3 rounded-xl hover:bg-white/50 dark:hover:bg-black/50 transition-colors font-medium text-gray-900 dark:text-gray-100">
                          {theme === 'light' ? <Moon className="size-5" /> : <Sun className="size-5" />}
                          <span>Toggle Dark Mode</span>
                       </button>
                    </div>
                 </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        <main className="flex-1 flex flex-col relative min-w-0 h-full">
           
           <header className="absolute top-0 inset-x-0 z-30 p-4 flex items-center justify-between pointer-events-none">
              <button 
                onClick={toggleSidebar} 
                className="pointer-events-auto p-2.5 rounded-xl bg-white/50 dark:bg-black/50 backdrop-blur-xl border border-white/40 dark:border-white/10 text-gray-900 dark:text-gray-100 hover:bg-white/80 dark:hover:bg-black/80 transition-colors shadow-sm"
              >
                <PanelLeft className="size-5" />
              </button>

              <AnimatePresence>
                {!isSidebarOpen && (
                  <motion.button 
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    onClick={toggleTheme} 
                    className="pointer-events-auto p-2.5 rounded-xl bg-white/50 dark:bg-black/50 backdrop-blur-xl border border-white/40 dark:border-white/10 text-gray-900 dark:text-gray-100 hover:bg-white/80 dark:hover:bg-black/80 transition-colors shadow-sm"
                  >
                    {theme === 'dark' ? <Moon className="size-5"/> : <Sun className="size-5" />}
                  </motion.button>
                )}
              </AnimatePresence>
           </header>

           <div className="flex-1 relative overflow-hidden flex flex-col h-full pt-16">
             
             {!activeConversationId ? (
               <motion.div 
                 layout
                 className="flex-1 flex flex-col items-center justify-center p-4 pb-20"
               >
                  <motion.div layoutId="header-text" className="flex flex-col items-center mb-10 text-center">
                    <h2 
                      className="font-[family-name:var(--font-display)] italic text-gray-900/80 dark:text-gray-100/80 px-4"
                      style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)", letterSpacing: "-0.02em", lineHeight: 1.02 }}
                    >
                      What will we build today?
                    </h2>
                  </motion.div>
                  
                  <motion.div layoutId="prompt-input" className="w-full max-w-3xl">
                     <PromptInput onSubmit={handleSend} isStreaming={isStreaming} onStop={handleStop} />
                  </motion.div>
               </motion.div>
             ) : (
               <div className="flex-1 flex flex-col h-full">
                 
                 <div 
                    className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 scroll-smooth"
                    ref={messagesContainerRef}
                    onScroll={handleScroll}
                 >
                   <div className="max-w-4xl mx-auto w-full space-y-6 pb-4">
                      {messages.map(m => (
                        <div key={m.id} className={cn("flex flex-col gap-1.5 w-full", m.role === "user" ? "items-end" : "items-start")}>
                           <div className="flex items-center gap-2 px-2">
                              <span className="text-xs font-semibold opacity-60">
                                {m.role === "assistant" ? (m.modelUsed || "Ghost") : "You"}
                              </span>
                           </div>
                           
                           <div className={cn(
                              "px-5 py-4 rounded-3xl max-w-[85%] border shadow-sm", 
                              "bg-white/50 dark:bg-black/50 backdrop-blur-xl border-white/40 dark:border-white/10"
                           )}>
                              {m.role === "assistant" && !m.content && isStreaming ? (
                                <div className="animate-pulse flex gap-1.5 items-center h-6 px-1">
                                  <div className="w-2 h-2 bg-foreground/50 rounded-full"/>
                                  <div className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce"/>
                                  <div className="w-2 h-2 bg-foreground/50 rounded-full"/>
                                </div>
                              ) : (
                                <div className="prose prose-sm dark:prose-invert max-w-none break-words text-gray-900 dark:text-gray-100">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                                    {m.content}
                                  </ReactMarkdown>
                                </div>
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
        </main>
      </div>
    </>
  );
}

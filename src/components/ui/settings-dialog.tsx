import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Moon, Sun, Key, ShieldCheck, Save, Trash2, Eye, EyeOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { chatDB } from '@/lib/db';
import { toast } from 'sonner';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  apiKeys: { providerId: string, key: string, baseUrl?: string }[];
  setApiKeys: (keys: { providerId: string, key: string, baseUrl?: string }[]) => void;
  serverConfig: { id: string, hasDefaultKey: boolean, defaultBaseUrl: string }[];
}

export function SettingsDialog({ isOpen, onClose, theme, toggleTheme, apiKeys, setApiKeys, serverConfig }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'apikeys'>('general');
  const [keyStates, setKeyStates] = useState<Record<string, { key: string, baseUrl: string, show: boolean, testing: boolean, testResult: string | null }>>({});
  const [designQuality, setDesignQuality] = useState<'standard' | 'max'>('standard');

  useEffect(() => {
    const savedQuality = localStorage.getItem('designQuality') as 'standard' | 'max';
    if (savedQuality) setDesignQuality(savedQuality);
    
    if (isOpen) {
      const states: any = {};
      ['openrouter', 'agentrouter'].forEach(providerId => {
        const stored = apiKeys.find(k => k.providerId === providerId);
        const srv = serverConfig.find(c => c.id === providerId);
        states[providerId] = {
          key: stored?.key ? 'sk-or-••••' + stored.key.slice(-4) : '',
          baseUrl: stored?.baseUrl || srv?.defaultBaseUrl || '',
          show: false,
          testing: false,
          testResult: null
        };
      });
      setKeyStates(states);
      setActiveTab('general');
    }
  }, [isOpen, apiKeys, serverConfig]);

  const toggleDesignQuality = () => {
    const next = designQuality === 'standard' ? 'max' : 'standard';
    setDesignQuality(next);
    localStorage.setItem('designQuality', next);
    toast.success(`Design quality set to ${next === 'max' ? 'Max' : 'Standard'}`);
  };

  if (!isOpen) return null;

  const handleSave = async (providerId: string) => {
    const state = keyStates[providerId];
    if (state.key && !state.key.startsWith('sk-or-••••')) {
      await chatDB.saveApiKey(providerId, state.key, state.baseUrl);
      toast.success(`${providerId} key saved`);
    } else if (state.key.startsWith('sk-or-••••')) {
      // Just update base url if key hasn't changed
      const existing = apiKeys.find(k => k.providerId === providerId);
      if (existing) {
        await chatDB.saveApiKey(providerId, existing.key, state.baseUrl);
        toast.success(`${providerId} config updated`);
      }
    }
    const keys = await chatDB.getApiKeys();
    setApiKeys(keys);
  };

  const handleRemove = async (providerId: string) => {
    await chatDB.removeApiKey(providerId);
    setKeyStates(prev => ({ ...prev, [providerId]: { ...prev[providerId], key: '', testResult: null } }));
    const keys = await chatDB.getApiKeys();
    setApiKeys(keys);
    toast.success(`${providerId} key removed`);
  };

  const handleTest = async (providerId: string) => {
    let keyToTest = keyStates[providerId].key;
    if (keyToTest.startsWith('sk-or-••••')) {
      keyToTest = apiKeys.find(k => k.providerId === providerId)?.key || '';
    }
    if (!keyToTest) return;

    setKeyStates(prev => ({ ...prev, [providerId]: { ...prev[providerId], testing: true, testResult: null } }));
    try {
      const res = await fetch('/api/test-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId, key: keyToTest, baseUrl: keyStates[providerId].baseUrl })
      });
      const data = await res.json();
      if (res.ok) {
        setKeyStates(prev => ({ ...prev, [providerId]: { ...prev[providerId], testing: false, testResult: 'OK' } }));
      } else {
        setKeyStates(prev => ({ ...prev, [providerId]: { ...prev[providerId], testing: false, testResult: data.error } }));
      }
    } catch (err: any) {
      setKeyStates(prev => ({ ...prev, [providerId]: { ...prev[providerId], testing: false, testResult: 'Network error' } }));
    }
  };

  const clearAllKeys = async () => {
    if (confirm("Are you sure you want to clear all keys from this browser?")) {
      await chatDB.clearAllApiKeys();
      const keys = await chatDB.getApiKeys();
      setApiKeys(keys);
      setKeyStates(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(k => {
          next[k].key = '';
          next[k].testResult = null;
        });
        return next;
      });
      toast.success("All keys cleared");
    }
  };

  const providers = [
    { id: 'openrouter', name: 'OpenRouter' },
    { id: 'agentrouter', name: 'AgentRouter' }
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }} onClick={e => e.stopPropagation()} className="bg-white/90 dark:bg-[#111]/90 backdrop-blur-2xl border border-white/50 dark:border-white/10 p-6 rounded-3xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between mb-4 shrink-0">
          <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100 tracking-tight">Settings</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-xl text-gray-500 dark:text-gray-400 transition-colors"><X className="size-5"/></button>
        </div>

        <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-white/10 pb-2 shrink-0">
          <button onClick={() => setActiveTab('general')} className={cn("px-4 py-2 rounded-xl text-sm font-medium transition-colors", activeTab === 'general' ? "bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white" : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-200")}>General</button>
          <button onClick={() => setActiveTab('apikeys')} className={cn("px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2", activeTab === 'apikeys' ? "bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white" : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-200")}><Key className="size-4"/> API Keys</button>
        </div>
        
        <div className="overflow-y-auto pr-2 custom-scrollbar flex-1">
          {activeTab === 'general' && (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                 <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest px-1">Appearance</div>
                 <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/60 dark:bg-white/5 border border-black/5 dark:border-white/10 shadow-sm">
                   <div className="flex items-center gap-3">
                     {theme === 'dark' ? <Moon className="size-5 text-gray-900 dark:text-gray-100"/> : <Sun className="size-5 text-gray-900 dark:text-gray-100"/>}
                     <span className="font-medium text-[15px] text-gray-900 dark:text-gray-100">Dark Mode</span>
                   </div>
                   <button onClick={toggleTheme} className={cn("w-11 h-6 rounded-full flex items-center px-1 transition-colors shadow-inner", theme === 'dark' ? "bg-blue-500 justify-end" : "bg-gray-300 dark:bg-gray-700 justify-start")}>
                     <motion.div layout className="size-4 bg-white rounded-full shadow-sm" />
                   </button>
                 </div>
              </div>

              <div className="flex flex-col gap-2">
                 <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest px-1">Behavior</div>
                 <div className="flex flex-col p-3.5 rounded-2xl bg-white/60 dark:bg-white/5 border border-black/5 dark:border-white/10 shadow-sm gap-2">
                   <div className="flex items-center justify-between">
                     <div className="flex items-center gap-3">
                       <span className="font-medium text-[15px] text-gray-900 dark:text-gray-100">Design Quality</span>
                     </div>
                     <button onClick={toggleDesignQuality} className={cn("w-11 h-6 rounded-full flex items-center px-1 transition-colors shadow-inner", designQuality === 'max' ? "bg-purple-500 justify-end" : "bg-gray-300 dark:bg-gray-700 justify-start")}>
                       <motion.div layout className="size-4 bg-white rounded-full shadow-sm" />
                     </button>
                   </div>
                   <p className="text-[13px] text-gray-500 dark:text-gray-400 leading-relaxed pr-8">
                     {designQuality === 'max' ? "Max: Prioritizes craft, richer gradients, micro-interactions, and premium layouts over generation speed." : "Standard: Balances good design with faster generation."}
                   </p>
                 </div>
              </div>
            </div>
          )}

          {activeTab === 'apikeys' && (
            <div className="flex flex-col gap-6">
              {providers.map(p => {
                const srv = serverConfig.find(c => c.id === p.id);
                const hasLocalKey = !!apiKeys.find(k => k.providerId === p.id);
                const isUsingLocal = hasLocalKey;
                const isUsingServer = !hasLocalKey && srv?.hasDefaultKey;
                const state = keyStates[p.id] || { key: '', baseUrl: '', show: false, testing: false, testResult: null };

                return (
                  <div key={p.id} className="flex flex-col gap-3 p-4 rounded-2xl bg-white/60 dark:bg-white/5 border border-black/5 dark:border-white/10 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                        {p.name}
                      </div>
                      <div className="flex items-center gap-2 text-xs font-medium px-2.5 py-1 rounded-full bg-black/5 dark:bg-white/10">
                        {isUsingLocal ? (
                          <><div className="size-2 rounded-full bg-green-500"/> <span className="text-gray-700 dark:text-gray-300">Using your key</span></>
                        ) : isUsingServer ? (
                          <><div className="size-2 rounded-full bg-emerald-500"/> <span className="text-gray-700 dark:text-gray-300">Using server default (.env)</span></>
                        ) : (
                          <><div className="size-2 rounded-full bg-red-500"/> <span className="text-gray-700 dark:text-gray-300">Not configured</span></>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-2 relative">
                      <input 
                        type={state.show ? "text" : "password"} 
                        value={state.key} 
                        onChange={e => setKeyStates(prev => ({ ...prev, [p.id]: { ...prev[p.id], key: e.target.value } }))}
                        placeholder={`Enter ${p.name} API Key`}
                        className="w-full bg-white dark:bg-black/50 border border-black/10 dark:border-white/10 rounded-xl px-4 py-2 text-sm outline-none focus:border-blue-500 pr-10 text-gray-900 dark:text-gray-100"
                      />
                      <button onClick={() => setKeyStates(prev => ({ ...prev, [p.id]: { ...prev[p.id], show: !prev[p.id].show } }))} className="absolute right-3 top-[9px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                        {state.show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase ml-1">Base URL (Optional)</label>
                      <input 
                        type="text"
                        value={state.baseUrl} 
                        onChange={e => setKeyStates(prev => ({ ...prev, [p.id]: { ...prev[p.id], baseUrl: e.target.value } }))}
                        placeholder={srv?.defaultBaseUrl || "https://..."}
                        className="w-full bg-white dark:bg-black/50 border border-black/10 dark:border-white/10 rounded-xl px-4 py-2 text-sm outline-none focus:border-blue-500 text-gray-900 dark:text-gray-100"
                      />
                    </div>

                    <div className="flex items-center gap-2 mt-1">
                      <button onClick={() => handleTest(p.id)} disabled={!state.key || state.testing} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors disabled:opacity-50">
                        {state.testing ? <Loader2 className="size-3.5 animate-spin"/> : <ShieldCheck className="size-3.5"/>}
                        Test Connection
                      </button>
                      <button onClick={() => handleSave(p.id)} disabled={!state.key} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50 ml-auto">
                        <Save className="size-3.5"/> Save
                      </button>
                      {hasLocalKey && (
                        <button onClick={() => handleRemove(p.id)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors">
                          <Trash2 className="size-3.5"/>
                        </button>
                      )}
                    </div>

                    {state.testResult && (
                      <div className={cn("text-xs p-2.5 rounded-lg mt-1", state.testResult === 'OK' ? "bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400" : "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400")}>
                        {state.testResult === 'OK' ? "Connection successful!" : state.testResult}
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="flex flex-col gap-4 px-2">
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed text-center">
                  Keys are stored securely in this browser only and sent to your Ghost server with each request. Never use your personal keys on a shared or public computer.
                </p>
                <button onClick={clearAllKeys} className="text-xs text-red-500 hover:text-red-600 font-medium underline underline-offset-2 self-center">Clear all keys</button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

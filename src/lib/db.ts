import { openDB, DBSchema } from 'idb';

export interface Attempt {
  model: string;
  status: 'success' | 'failed';
  httpStatus?: number;
  errorType?: string;
  errorMessage?: string;
  ttfbMs?: number;
  totalMs?: number;
  tokensIn?: number;
  tokensOut?: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning?: string;
  attachments?: {
    id: string;
    name: string;
    type: string;
    data: Blob | string; // Blob or base64
  }[];
  modelUsed?: string;
  fellBack?: boolean;
  attempts?: Attempt[];
  timestamp: number;
}

export interface Conversation {
  id: string;
  title: string;
  updatedAt: number;
}

export interface ArtifactVersion {
  versionIndex: number;
  content: string;
  createdAt: number;
}

export interface Artifact {
  id: string;
  conversationId: string;
  title: string;
  type: string;
  versions: ArtifactVersion[];
  currentVersionIndex: number;
}

interface ChatDB extends DBSchema {
  conversations: {
    key: string;
    value: Conversation;
    indexes: { 'by-date': number };
  };
  messages: {
    key: string;
    value: Message & { conversationId: string };
    indexes: { 'by-conversation': string };
  };
  artifacts: {
    key: string;
    value: Artifact;
    indexes: { 'by-conversation': string };
  };
  apiKeys: {
    key: string;
    value: { providerId: string; key: string; baseUrl?: string };
  };
}

const DB_NAME = 'ai-workspace-db';
const DB_VERSION = 3; // Bumped version

let dbPromise: Promise<import('idb').IDBPDatabase<ChatDB>> | null = null;

export const getDB = async () => {
  if (!dbPromise) {
    dbPromise = openDB<ChatDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('conversations')) {
          const convStore = db.createObjectStore('conversations', { keyPath: 'id' });
          convStore.createIndex('by-date', 'updatedAt');
        }
        if (!db.objectStoreNames.contains('messages')) {
          const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
          msgStore.createIndex('by-conversation', 'conversationId');
        }
        if (!db.objectStoreNames.contains('artifacts')) {
          const artifactStore = db.createObjectStore('artifacts', { keyPath: 'id' });
          artifactStore.createIndex('by-conversation', 'conversationId');
        }
        if (!db.objectStoreNames.contains('apiKeys')) {
          db.createObjectStore('apiKeys', { keyPath: 'providerId' });
        }
      },
      blocked(currentVersion, blockedVersion, event) {
        console.warn(`Database upgrade blocked. Close other tabs.`);
      },
      blocking(currentVersion, blockedVersion, event) {
        // If another connection wants to upgrade, close this one
        dbPromise?.then(db => db.close());
        dbPromise = null;
      },
      terminated() {
        dbPromise = null;
      }
    });
  }
  return dbPromise;
};

// We will use a safe wrapper to execute db operations
const safeDbCall = async <T>(operation: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    console.error('Database operation failed:', error);
    // Show toast if available, or just log
    import('sonner').then(({ toast }) => {
      toast.error('Storage error occurred. Functionality may be limited.');
    }).catch(() => {});
    return fallback;
  }
};

export const chatDB = {
  async getConversations() {
    return safeDbCall(async () => {
      const db = await getDB();
      return db.getAllFromIndex('conversations', 'by-date');
    }, []);
  },
  async createConversation(id: string, title: string) {
    return safeDbCall(async () => {
      const db = await getDB();
      await db.put('conversations', { id, title, updatedAt: Date.now() });
    }, undefined);
  },
  async getMessages(conversationId: string) {
    return safeDbCall(async () => {
      const db = await getDB();
      return db.getAllFromIndex('messages', 'by-conversation', conversationId);
    }, []);
  },
  async addMessage(conversationId: string, message: Message) {
    return safeDbCall(async () => {
      const db = await getDB();
      await db.put('messages', { ...message, conversationId });
      const conv = await db.get('conversations', conversationId);
      if (conv) {
        conv.updatedAt = Date.now();
        await db.put('conversations', conv);
      }
    }, undefined);
  },
  async renameConversation(id: string, title: string) {
    return safeDbCall(async () => {
      const db = await getDB();
      const conv = await db.get('conversations', id);
      if (conv) {
        conv.title = title;
        await db.put('conversations', conv);
      }
    }, undefined);
  },
  async deleteConversation(id: string) {
    return safeDbCall(async () => {
      const db = await getDB();
      await db.delete('conversations', id);
      const messages = await db.getAllKeysFromIndex('messages', 'by-conversation', id);
      const tx = db.transaction('messages', 'readwrite');
      await Promise.all(messages.map(key => tx.store.delete(key)));
      await tx.done;
    }, undefined);
  },
  async getArtifacts(conversationId: string) {
    return safeDbCall(async () => {
      const db = await getDB();
      return db.getAllFromIndex('artifacts', 'by-conversation', conversationId);
    }, []);
  },
  async saveArtifact(artifact: Artifact) {
    return safeDbCall(async () => {
      const db = await getDB();
      await db.put('artifacts', artifact);
    }, undefined);
  },
  async getApiKeys() {
    return safeDbCall(async () => {
      const db = await getDB();
      return db.getAll('apiKeys');
    }, []);
  },
  async saveApiKey(providerId: string, key: string, baseUrl?: string) {
    return safeDbCall(async () => {
      const db = await getDB();
      await db.put('apiKeys', { providerId, key, baseUrl });
    }, undefined);
  },
  async removeApiKey(providerId: string) {
    return safeDbCall(async () => {
      const db = await getDB();
      await db.delete('apiKeys', providerId);
    }, undefined);
  },
  async clearAllApiKeys() {
    return safeDbCall(async () => {
      const db = await getDB();
      await db.clear('apiKeys');
    }, undefined);
  }
};

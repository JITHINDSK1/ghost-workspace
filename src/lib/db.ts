import { openDB, DBSchema } from 'idb';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: {
    id: string;
    name: string;
    type: string;
    data: Blob | string; // Blob or base64
  }[];
  modelUsed?: string;
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
}

const DB_NAME = 'ai-workspace-db';
const DB_VERSION = 1;

export const getDB = async () => {
  return openDB<ChatDB>(DB_NAME, DB_VERSION, {
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
    },
  });
};

export const chatDB = {
  async getConversations() {
    const db = await getDB();
    return db.getAllFromIndex('conversations', 'by-date');
  },
  async createConversation(id: string, title: string) {
    const db = await getDB();
    await db.put('conversations', { id, title, updatedAt: Date.now() });
  },
  async getMessages(conversationId: string) {
    const db = await getDB();
    return db.getAllFromIndex('messages', 'by-conversation', conversationId);
  },
  async addMessage(conversationId: string, message: Message) {
    const db = await getDB();
    await db.put('messages', { ...message, conversationId });
    const conv = await db.get('conversations', conversationId);
    if (conv) {
      conv.updatedAt = Date.now();
      await db.put('conversations', conv);
    }
  },
  async renameConversation(id: string, title: string) {
    const db = await getDB();
    const conv = await db.get('conversations', id);
    if (conv) {
      conv.title = title;
      await db.put('conversations', conv);
    }
  },
  async deleteConversation(id: string) {
    const db = await getDB();
    await db.delete('conversations', id);
    const messages = await db.getAllKeysFromIndex('messages', 'by-conversation', id);
    const tx = db.transaction('messages', 'readwrite');
    await Promise.all(messages.map(key => tx.store.delete(key)));
    await tx.done;
  },
  async getArtifacts(conversationId: string) {
    const db = await getDB();
    return db.getAllFromIndex('artifacts', 'by-conversation', conversationId);
  },
  async saveArtifact(artifact: Artifact) {
    const db = await getDB();
    await db.put('artifacts', artifact);
  }
};

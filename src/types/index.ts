// Global environment interface for Cloudflare Workers
export interface Env {
  EMAIL_STORAGE: KVNamespace;
  ADMIN_PASSWORD: string;
  DOMAIN: string;
}

// Email interface for stored emails
export interface EmailData {
  subject: string;
  from: string;
  content: string;
  receivedAt: number;
  headers: Record<string, string>;
}

// Feed configuration interface
export interface FeedConfig {
  title: string;
  description?: string;
  allowed_senders?: string[];
  language: string;
  site_url: string;
  feed_url: string;
  author?: string;
  created_at: number;
  updated_at?: number;
}

// Feed metadata interface
export interface FeedMetadata {
  emails: EmailMetadata[];
}

// Email metadata interface (summary info for listing)
export interface EmailMetadata {
  key: string;
  subject: string;
  receivedAt: number;
}

// Feed list interface
export interface FeedList {
  feeds: FeedListItem[];
}

// Feed summary interface (for the global feed list)
export interface FeedListItem {
  id: string;
  title: string;
  description?: string;
}

// Declare KVNamespace for TypeScript
declare global {
  // This is not an ideal solution but works for our example
  interface KVNamespace {
    get(key: string, options?: { type: "text" }): Promise<string | null>;
    get(key: string, options: { type: "json" }): Promise<any | null>;
    get(
      key: string,
      options: { type: "arrayBuffer" },
    ): Promise<ArrayBuffer | null>;
    get(
      key: string,
      options: { type: "stream" },
    ): Promise<ReadableStream | null>;
    put(
      key: string,
      value: string | ArrayBuffer | ReadableStream | FormData,
    ): Promise<void>;
    delete(key: string): Promise<void>;
    list(options?: {
      prefix?: string;
      limit?: number;
      cursor?: string;
    }): Promise<{
      keys: { name: string; expiration?: number }[];
      list_complete: boolean;
      cursor?: string;
    }>;
  }
}

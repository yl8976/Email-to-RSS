import { beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';

/**
 * Mock implementation of Cloudflare Workers runtime environment
 * Based on: https://developers.cloudflare.com/workers/testing/
 */

// Define Cloudflare Workers runtime globals
declare global {
  // CF Worker specific globals
  var caches: CacheStorage;
  var crypto: Crypto;
  var Response: typeof Response;
  var Request: typeof Request;
  var URLSearchParams: typeof URLSearchParams;
  var URL: typeof URL;
  var Headers: typeof Headers;
  var FormData: typeof FormData;
  var Blob: typeof Blob;
  var atob: (data: string) => string;
  var btoa: (data: string) => string;
}

/**
 * Mock KV namespace implementation
 * Simulates Cloudflare Workers KV storage using an in-memory Map
 */
class MockKV {
  private store: Map<string, any> = new Map();

  async get(key: string, type: 'text' | 'json' | 'arrayBuffer' | 'stream' = 'text') {
    const value = this.store.get(key);
    if (!value) return null;
    return type === 'json' ? JSON.parse(value) : value;
  }

  async put(key: string, value: any) {
    this.store.set(key, typeof value === 'string' ? value : JSON.stringify(value));
    return undefined; // Match CF Workers KV behavior
  }

  async delete(key: string) {
    this.store.delete(key);
    return undefined; // Match CF Workers KV behavior
  }

  async list(options?: { prefix?: string; cursor?: string; limit?: number }) {
    const keys = Array.from(this.store.keys())
      .filter(key => !options?.prefix || key.startsWith(options.prefix))
      .slice(0, options?.limit || undefined)
      .map(name => ({ name }));
    
    return {
      keys,
      list_complete: true,
      cursor: ''
    };
  }
}

/**
 * Mock Cache implementation
 * Simulates Cloudflare Workers Cache API using an in-memory Map
 */
class MockCache implements Cache {
  private store: Map<string, Response> = new Map();

  async put(request: RequestInfo, response: Response): Promise<undefined> {
    const key = request instanceof Request ? request.url : request;
    this.store.set(key, response.clone());
    return undefined;
  }

  async match(request: RequestInfo, options?: CacheQueryOptions): Promise<Response | undefined> {
    const key = request instanceof Request ? request.url : request;
    const response = this.store.get(key);
    return response?.clone();
  }

  async delete(request: RequestInfo, options?: CacheQueryOptions): Promise<boolean> {
    const key = request instanceof Request ? request.url : request;
    return this.store.delete(key);
  }

  // Required Cache interface methods with minimal implementations
  async add(): Promise<void> { throw new Error('Not implemented'); }
  async addAll(): Promise<void> { throw new Error('Not implemented'); }
  async keys(): Promise<Request[]> { return []; }
}

// Create MSW server for mocking external requests
export const server = setupServer();

// Setup before tests
beforeAll(() => {
  // Setup MSW server
  server.listen({ onUnhandledRequest: 'error' });

  // Mock Cloudflare Workers runtime globals
  global.caches = {
    default: new MockCache(),
    open: async () => new MockCache()
  } as unknown as CacheStorage;

  // Mock crypto for generating random values
  if (!global.crypto) {
    global.crypto = require('crypto').webcrypto;
  }

  // Ensure other required globals are available
  if (!global.FormData) {
    const { FormData } = require('undici');
    global.FormData = FormData;
  }

  if (!global.Headers) {
    const { Headers } = require('undici');
    global.Headers = Headers;
  }

  if (!global.Request) {
    const { Request } = require('undici');
    global.Request = Request;
  }

  if (!global.Response) {
    const { Response } = require('undici');
    global.Response = Response;
  }
});

// Clean up after tests
afterAll(() => {
  server.close();
});

afterEach(() => {
  server.resetHandlers();
});

/**
 * Create a mock environment for testing
 * @returns Mock environment with KV storage and configuration
 */
export const createMockEnv = () => ({
  EMAIL_STORAGE: new MockKV(),
  DOMAIN: 'test.getmynews.app',
  ADMIN_PASSWORD: 'test-password',
});

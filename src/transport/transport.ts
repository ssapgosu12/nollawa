export interface Transport<Message> {
  connect(): Promise<void>;
  send(message: Message): void;
  onMessage(handler: (message: Message) => void): () => void;
  onPeerChange(handler: (count: number) => void): () => void;
  close(): void;
}
const DEVICE_DB = 'nollawa-device';
const DEVICE_STORE = 'identity';
const RECONNECT_KEY = 'reconnect-key';
let reconnectKeyPromise: Promise<string> | null = null;
export function deviceReconnectKey(): Promise<string> {
  if (reconnectKeyPromise) return reconnectKeyPromise;
  reconnectKeyPromise = new Promise((resolve) => {
    const fallback = crypto.randomUUID();
    if (!globalThis.indexedDB) {
      resolve(fallback);
      return;
    }
    const open = indexedDB.open(DEVICE_DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(DEVICE_STORE);
    open.onerror = () => resolve(fallback);
    open.onsuccess = () => {
      const database = open.result;
      const transaction = database.transaction(DEVICE_STORE, 'readwrite');
      const store = transaction.objectStore(DEVICE_STORE);
      const read = store.get(RECONNECT_KEY);
      let value: string = fallback;
      read.onsuccess = () => {
        if (typeof read.result === 'string') value = read.result;
        else store.put(value, RECONNECT_KEY);
      };
      transaction.oncomplete = () => {
        database.close();
        resolve(value);
      };
      transaction.onerror = () => {
        database.close();
        resolve(fallback);
      };
    };
  });
  return reconnectKeyPromise;
}
export function reconnectUrl(url: string, key: string, name = ''): string {
  const endpoint = new URL(url);
  endpoint.searchParams.set('reconnectKey', key);
  if (name) endpoint.searchParams.set('name', name);
  return endpoint.toString();
}
export class LoopbackTransport<Message> implements Transport<Message> {
  private messages = new Set<(message: Message) => void>();
  private peers = new Set<(count: number) => void>();
  async connect() {
    this.peers.forEach((handler) => handler(1));
  }
  send(message: Message) {
    queueMicrotask(() => this.messages.forEach((handler) => handler(structuredClone(message))));
  }
  onMessage(handler: (message: Message) => void) {
    this.messages.add(handler);
    return () => this.messages.delete(handler);
  }
  onPeerChange(handler: (count: number) => void) {
    this.peers.add(handler);
    return () => this.peers.delete(handler);
  }
  close() {
    this.peers.forEach((handler) => handler(0));
    this.messages.clear();
  }
}
export class WebSocketTransport<Message> implements Transport<Message> {
  private socket: WebSocket | null = null;
  private messages = new Set<(message: Message) => void>();
  private peers = new Set<(count: number) => void>();
  private heartbeat: number | null = null;
  private established = false;
  private stopped = false;
  private retry = 0;
  private readonly wake = () => { if (document.visibilityState === 'visible') this.ping(); };
  constructor(private readonly url: string, private readonly reconnectKey: string, private readonly name = '') {}
  connect(): Promise<void> {
    return new Promise((resolve, reject) => this.open(resolve, reject));
  }
  private ping() {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'heartbeat', at: Date.now() }));
  }
  private open(resolve?: () => void, reject?: (error: Error) => void) {
    const socket = new WebSocket(reconnectUrl(this.url, this.reconnectKey, this.name));
    this.socket = socket;
    socket.addEventListener('open', () => {
      this.established = true;
      this.retry = 0;
      this.heartbeat = window.setInterval(() => this.ping(), 20_000);
      document.addEventListener('visibilitychange', this.wake);
      resolve?.();
    }, { once: true });
    socket.addEventListener('error', () => reject?.(new Error('릴레이 연결에 실패했습니다.')), { once: true });
    socket.addEventListener('close', () => this.reopen());
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as Message & { type?: string; count?: number };
      if (message.type === 'peers' && typeof message.count === 'number') this.peers.forEach((handler) => handler(message.count ?? 0));
      else this.messages.forEach((handler) => handler(message));
    });
  }
  private reopen() {
    if (this.heartbeat !== null) window.clearInterval(this.heartbeat);
    this.heartbeat = null;
    document.removeEventListener('visibilitychange', this.wake);
    if (this.stopped || !this.established) return;
    this.peers.forEach((handler) => handler(0));
    window.setTimeout(() => { if (!this.stopped) this.open(); }, Math.min(1000 * 2 ** this.retry++, 10_000));
  }
  send(message: Message) {
    if (this.socket?.readyState !== WebSocket.OPEN) throw new Error('릴레이 연결이 열려 있지 않습니다.');
    this.socket.send(JSON.stringify(message));
  }
  onMessage(handler: (message: Message) => void) {
    this.messages.add(handler);
    return () => this.messages.delete(handler);
  }
  onPeerChange(handler: (count: number) => void) {
    this.peers.add(handler);
    return () => this.peers.delete(handler);
  }
  close() {
    this.stopped = true;
    if (this.heartbeat !== null) window.clearInterval(this.heartbeat);
    this.heartbeat = null;
    document.removeEventListener('visibilitychange', this.wake);
    this.socket?.close();
    this.peers.forEach((handler) => handler(0));
  }
}

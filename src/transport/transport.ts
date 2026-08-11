export interface Transport<Message> {
  connect(): Promise<void>;
  send(message: Message): void;
  onMessage(handler: (message: Message) => void): () => void;
  onPeerChange(handler: (count: number) => void): () => void;
  close(): void;
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

  constructor(private readonly url: string) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      this.socket = socket;
      socket.addEventListener('open', () => {
        this.heartbeat = window.setInterval(() => socket.send(JSON.stringify({ type: 'heartbeat', at: Date.now() })), 20_000);
        resolve();
      }, { once: true });
      socket.addEventListener('error', () => reject(new Error('릴레이 연결에 실패했습니다.')), { once: true });
      socket.addEventListener('message', (event) => {
        const message = JSON.parse(String(event.data)) as Message & { type?: string; count?: number };
        if (message.type === 'peers' && typeof message.count === 'number') this.peers.forEach((handler) => handler(message.count ?? 0));
        else this.messages.forEach((handler) => handler(message));
      });
    });
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
    if (this.heartbeat !== null) window.clearInterval(this.heartbeat);
    this.socket?.close();
    this.peers.forEach((handler) => handler(0));
  }
}

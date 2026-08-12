import { describe, expect, it } from 'vitest';
import { LoopbackTransport, reconnectUrl, WebSocketTransport, type Transport } from './transport';

describe('loopback 전송', () => {
  it('원격과 같은 Transport 계약으로 메시지를 왕복한다', async () => {
    const transport: Transport<{ value: number }> = new LoopbackTransport();
    const received = new Promise<number>((resolve) => transport.onMessage((message) => resolve(message.value)));
    await transport.connect();
    transport.send({ value: 7 });
    await expect(received).resolves.toBe(7);
  });
});

describe('L1: 원격 재연결 키', () => {
  it('비밀이 아닌 안정 키를 원격 WebSocket URL에 공급한다', () => {
    const url = reconnectUrl('wss://relay.example/room/ABC-67', 'device-key-123456');
    expect(url).toBe('wss://relay.example/room/ABC-67?reconnectKey=device-key-123456');
  });

  it('로비 participant 표시 이름을 같은 최초 연결에 인코딩한다', () => {
    const url = new URL(reconnectUrl('wss://relay.example/room/ABC-67', 'device-key-123456', '나 이름'));
    expect(url.searchParams.get('name')).toBe('나 이름');
  });
});

describe('WebSocketTransport 재연결 계약', () => {
  class FakeSocket {
    static instances: FakeSocket[] = [];
    static readonly OPEN = 1;
    readyState = 1;
    private listeners: Record<string, (() => void)[]> = {};
    constructor(readonly url: string) { FakeSocket.instances.push(this); }
    addEventListener(type: string, handler: () => void) { (this.listeners[type] ??= []).push(handler); }
    removeEventListener() {}
    send() {}
    close() { this.emit('close'); }
    emit(type: string) { (this.listeners[type] ?? []).forEach((handler) => handler()); }
  }

  function stubEnvironment() {
    FakeSocket.instances = [];
    const scope = globalThis as unknown as Record<string, unknown>;
    scope.WebSocket = FakeSocket;
    scope.window = { setInterval: () => 1, clearInterval: () => {}, setTimeout: (run: () => void) => { run(); return 1; } };
    scope.document = { addEventListener: () => {}, removeEventListener: () => {}, visibilityState: 'visible' };
  }

  it('서버가 소켓을 끊으면 다시 붙고, close() 뒤에는 다시 붙지 않는다', async () => {
    stubEnvironment();
    const transport = new WebSocketTransport('wss://relay.example/room/ABC-67', 'device-key-123456', '나');
    const connected = transport.connect();
    FakeSocket.instances[0]!.emit('open');
    await connected;
    expect(FakeSocket.instances).toHaveLength(1);

    FakeSocket.instances[0]!.emit('close');
    expect(FakeSocket.instances).toHaveLength(2);

    FakeSocket.instances[1]!.emit('open');
    transport.close();
    FakeSocket.instances[1]!.emit('close');
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it('한 번도 열리지 않은 연결은 재시도하지 않는다 — 잘못된 방 코드로 무한 재접속하지 않기 위해', () => {
    stubEnvironment();
    const transport = new WebSocketTransport('wss://relay.example/room/ABC-67', 'device-key-123456');
    transport.connect().catch(() => {});
    FakeSocket.instances[0]!.emit('close');
    expect(FakeSocket.instances).toHaveLength(1);
  });
});

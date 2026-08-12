import { describe, expect, it } from 'vitest';
import { LoopbackTransport, reconnectUrl, type Transport } from './transport';

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

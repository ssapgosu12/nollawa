import { describe, expect, it } from 'vitest';
import { LoopbackTransport, type Transport } from './transport';

describe('loopback 전송', () => {
  it('원격과 같은 Transport 계약으로 메시지를 왕복한다', async () => {
    const transport: Transport<{ value: number }> = new LoopbackTransport();
    const received = new Promise<number>((resolve) => transport.onMessage((message) => resolve(message.value)));
    await transport.connect();
    transport.send({ value: 7 });
    await expect(received).resolves.toBe(7);
  });
});

import { describe, expect, it } from 'vitest';
import { RoomLobby } from './RoomLobby';
import type { RoomSnapshot } from './room-state';

const room = (readyGuests: number, aiOpponent = true): RoomSnapshot => ({
  code: 'ABC-67', hostId: 'p1', game: 'samok', teamNames: ['콜라', '사이다'], settings: { aiOpponent }, phase: 'lobby',
  participants: [1, 2, 3, 4].map((slot, index) => ({ id: `p${slot}`, slot, name: `사람 ${slot}`, ready: index > 0 && index <= readyGuests, present: true })),
});

function tree(node: unknown): any[] {
  if (Array.isArray(node)) return node.flatMap(tree);
  if (!node || typeof node !== 'object') return [];
  const vnode = node as any;
  return [vnode, ...tree(vnode.props?.children)];
}

const text = (node: any): string => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : String(node ?? '');

describe('N2: RoomLobby 하단 단일 action', () => {
  it('손님은 카드 준비 버튼 없이 시작 위치의 준비 하나만 보고 방장은 시작만 본다', () => {
    const guestButtons = tree(RoomLobby({ room: room(2), selfId: 'p2', send() {}, openGames() {} })).filter((node) => node.type === 'button').map(text);
    expect(guestButtons.filter((label) => label === '준비' || label === '준비 취소')).toEqual(['준비 취소']);
    expect(guestButtons).not.toContain('플레이 시작');
    const hostButtons = tree(RoomLobby({ room: room(2), selfId: 'p1', send() {}, openGames() {} })).filter((node) => node.type === 'button').map(text);
    expect(hostButtons).toContain('플레이 시작');
    expect(hostButtons).not.toContain('준비');
    expect(hostButtons).not.toContain('준비 취소');
  });
});

describe('N5: RoomLobby 시작 button emphasis', () => {
  it('불가능한 방장 시작에는 primary가 없고 가능한 시작에만 있으며 손님은 시작 button이 없다', () => {
    const start = (ready: number, id: string) => tree(RoomLobby({ room: room(ready), selfId: id, send() {}, openGames() {} })).find((node) => node.type === 'button' && text(node) === '플레이 시작');
    expect(start(1, 'p1').props).toMatchObject({ disabled: true, class: undefined });
    expect(start(2, 'p1').props).toMatchObject({ disabled: false, class: 'primary' });
    expect(start(2, 'p2')).toBeUndefined();
  });
});

describe('N6: RoomLobby authoritative AI setting control', () => {
  it('방장과 손님이 같은 snapshot 값을 보되 방장만 command를 보낼 수 있다', () => {
    const sent: unknown[] = [];
    const hostTree = tree(RoomLobby({ room: room(2), selfId: 'p1', send: (command) => sent.push(command), openGames() {} }));
    expect(hostTree.find((node) => node.type === 'details' && node.props.class === 'game-settings')).toBeTruthy();
    expect(hostTree.find((node) => node.type === 'summary' && node.props['aria-label'] === '게임 설정')).toBeTruthy();
    const hostInput = hostTree.find((node) => node.type === 'input' && node.props.type === 'checkbox');
    expect(hostInput.props).toMatchObject({ checked: true, disabled: false });
    hostInput.props.onChange({ currentTarget: { checked: false } });
    expect(sent).toEqual([{ command: 'set-ai-opponent', enabled: false }]);
    const guestInput = tree(RoomLobby({ room: room(2), selfId: 'p2', send: (command) => sent.push(command), openGames() {} })).find((node) => node.type === 'input' && node.props.type === 'checkbox');
    expect(guestInput.props).toMatchObject({ checked: true, disabled: true });
    guestInput.props.onChange({ currentTarget: { checked: false } });
    expect(sent).toHaveLength(1);
  });
});

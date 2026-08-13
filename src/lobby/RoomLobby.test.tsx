import { describe, expect, it } from 'vitest';
import { RoomLobby } from './RoomLobby';
import type { RoomSnapshot } from './room-state';

const room = (readyGuests: number, aiOpponent = true, total = 4): RoomSnapshot => ({
  code: 'ABC-67', hostId: 'p1', game: 'samok', teamNames: ['콜라', '사이다'], settings: { aiOpponent }, phase: 'lobby',
  participants: Array.from({ length: total }, (_, index) => index + 1).map((slot, index) => ({ id: `p${slot}`, slot, name: `사람 ${slot}`, ready: index > 0 && index <= readyGuests, present: true })),
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

describe('A1: AI 대전은 사람 전원 한 팀', () => {
  it('AI-on은 한 줄 안내와 사람 슬롯 6개만 렌더하고 전부 1번 팀이며 준비 분모를 보존한다', () => {
    const aiTree = tree(RoomLobby({ room: room(5, true, 6), selfId: 'p1', send() {}, openGames() {} }));
    const banner = aiTree.find((node) => node.type === 'p' && node.props.class === 'ai-opponent-banner');
    expect(text(banner)).toBe('모두 함께 AI와 대전 중');
    expect(aiTree.find((node) => node.type === 'div' && node.props.class === 'team-headings')).toBeUndefined();
    const cells = aiTree.filter((node) => node.type === 'article' && String(node.props.class).includes('participant'));
    expect(cells).toHaveLength(6);
    expect(cells.every((node) => node.props.class === 'participant team-1')).toBe(true);
    expect(cells.map(text).join('')).not.toContain('빈 자리');
    expect(text(aiTree)).toContain('5/5 준비됨');
    const teamHeadings = tree(RoomLobby({ room: room(2, false), selfId: 'p1', send() {}, openGames() {} })).find((node) => node.type === 'div' && node.props.class === 'team-headings');
    expect(tree(teamHeadings).filter((node) => node.type === 'input')).toHaveLength(2);
  });
});

describe('D-014: 게임 이름 옆 AI 대전 꼬리표', () => {
  const heading = (aiOpponent: boolean) => {
    const nodes = tree(RoomLobby({ room: room(2, aiOpponent), selfId: 'p1', send() {}, openGames() {} }));
    return nodes.filter((node) => node.type === 'h2').map(text).join('');
  };

  it('AI 대전이 켜지면 이름 옆에 (AI 대전)이 붙고, 꺼지면 붙지 않는다', () => {
    expect(heading(true)).toBe('사목 (AI 대전)');
    expect(heading(false)).toBe('사목');
  });
});

describe('S1: 참가자 상태 5종 표시 우선순위', () => {
  it('다섯 label이 모두 구별되고 연결 끊김은 준비/게임 중보다 우선하면서 슬롯을 보존한다', () => {
    const current = room(0, false, 5);
    current.participants.forEach((person, index) => Object.assign(person, [
      { ready: false, activity: 'lobby' }, { ready: true, activity: 'lobby' },
      { activity: 'games' }, { activity: 'play' }, { ready: true, activity: 'play', present: false },
    ][index]));
    current.hostId = null;
    const nodes = tree(RoomLobby({ room: current, selfId: null, send() {}, openGames() {} }));
    const cards = nodes.filter((node) => node.type === 'article' && String(node.props.class).includes('participant'));
    expect(cards).toHaveLength(6);
    expect(cards.slice(0, 5).map((card) => text(tree(card).find((node) => node.type === 'span')))).toEqual(['대기', '준비', '게임 목록 보는 중', '게임 중', '연결 끊김']);
  });
});

describe('S2: AI 강도 snapshot과 방장 control', () => {
  it('보통/높음을 같은 snapshot에서 보며 방장만 강도 command를 보낸다', () => {
    const current = room(2);
    current.settings.aiStrength = 'high';
    const sent: unknown[] = [];
    const select = (id: string) => tree(RoomLobby({ room: current, selfId: id, send: (command) => sent.push(command), openGames() {} })).find((node) => node.type === 'select');
    expect(select('p1').props).toMatchObject({ value: 'high', disabled: false });
    select('p1').props.onChange({ currentTarget: { value: 'normal' } });
    expect(sent).toEqual([{ command: 'set-ai-strength', strength: 'normal' }]);
    expect(select('p2').props).toMatchObject({ value: 'high', disabled: true });
    select('p2').props.onChange({ currentTarget: { value: 'normal' } });
    expect(sent).toHaveLength(1);
  });
});

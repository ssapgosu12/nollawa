import type { Transport } from '../transport/transport';
import type { BoardSize } from '../game/catalog';
export interface RoomParticipant { id: string; slot: number; name: string; ready: boolean; present: boolean; activity?: 'lobby' | 'games' | 'play' }
export interface RoomSnapshot { code: string; participants: RoomParticipant[]; hostId: string | null; game: string; teamNames: [string, string]; settings: { aiOpponent: boolean; aiStrength?: 'normal' | 'high'; boardSize?: BoardSize }; phase: 'lobby' | 'play' }
export type RoomCommand =
  | { command: 'ready' | 'start' | 'return-lobby' | 'leave-room' } | { command: 'set-ai-opponent'; enabled: boolean } | { command: 'set-ai-strength'; strength: 'normal' | 'high' } | { command: 'set-board-size'; size: BoardSize } | { command: 'set-activity'; activity: 'lobby' | 'games' }
  | { command: 'select-game'; game: string } | { command: 'kick' | 'promote'; target: string } | { command: 'move'; target: string; slot: number } | { command: 'team-name'; team: 1 | 2; name: string };
export const MAIN_DESTINATIONS = [
  ['이 기기에서 플레이', 'games'],
  ['방 참여', 'lobby'],
  ['방 생성', 'lobby'],
] as const;
export const requiredReady = (total: number) => [0, 0, 2, 2, 3, 3, 4][total] ?? Infinity;
export const teamForSlot = (slot: number): 1 | 2 => slot % 2 ? 1 : 2;
export const roomSlots = (room: RoomSnapshot) => Array.from({ length: 6 }, (_, index) => room.participants.find((person) => person.slot === index + 1) ?? null);
export const isRoomHost = (room: RoomSnapshot, id: string | null) => id !== null && room.hostId === id;
export const participantStatusLabel = (room: RoomSnapshot, person: RoomParticipant) => !person.present ? '연결 끊김' : person.activity === 'games' ? '게임 목록 보는 중' : person.activity === 'play' ? '게임 중' : person.id === room.hostId || person.ready ? '준비' : '대기';
export const roomScreen = (room: RoomSnapshot, id: string | null) => {
  const person = room.participants.find((member) => member.id === id);
  return person?.activity === 'games' ? 'games' : room.phase === 'play' && person && (person.activity ?? 'play') === 'play' ? 'play' : 'lobby';
};
export const readyLabel = (room: RoomSnapshot) => {
  const guests = room.participants.filter((person) => person.id !== room.hostId);
  return `${guests.filter((person) => person.ready).length}/${guests.length} 준비됨`;
};
export function canStartRoom(room: RoomSnapshot): boolean {
  const ready = Number(room.participants.some((person) => person.id === room.hostId)) + room.participants.filter((person) => person.id !== room.hostId && person.ready).length;
  const yacht = room.game === 'yacht', fleet = room.game === 'fleet';
  return room.phase === 'lobby' && ready >= requiredReady(room.participants.length) && (yacht
    ? room.participants.length <= 4 && [1, 2].every((team) => room.participants.some((person) => teamForSlot(person.slot) === team))
    : fleet ? !room.settings.aiOpponent && room.participants.length >= 2 && room.participants.length <= 6
      : room.settings.aiOpponent || [1, 2].every((team) => room.participants.some((person) => teamForSlot(person.slot) === team)));
}
export function lobbyAction(room: RoomSnapshot, id: string | null) {
  const host = isRoomHost(room, id);
  const self = room.participants.find((person) => person.id === id);
  const enabledStart = host && canStartRoom(room);
  return host
    ? { command: 'start' as const, label: '플레이 시작', disabled: !enabledStart, emphasized: enabledStart }
    : { command: 'ready' as const, label: self ? self.ready ? '준비 취소' : '준비' : '방에서 나왔습니다', disabled: !self || room.phase !== 'lobby', emphasized: false };
}
export function reuseRemoteTransport<T>(current: Transport<T> | null, create: () => Transport<T>): Transport<T> {
  return current ?? create();
}

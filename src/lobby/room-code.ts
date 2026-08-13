const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
export const FORBIDDEN_COMBINATIONS = [
  'ASS', 'AZZ', 'BAD', 'BCH', 'BUM', 'BUT', 'CUM', 'DAM',
  'DCK', 'FAG', 'FCK', 'FUC', 'FUK', 'GAY', 'GUN', 'HAT',
  'JER', 'JYZ', 'KKK', 'KYS', 'NAZ', 'NGR', 'NUT', 'PNS',
  'PSS', 'SEX', 'SHT', 'SUC', 'SUK', 'VAG', 'WTF', 'XXX',
] as const;
export const MAX_ROOM_CODE_ATTEMPTS = 8;
export function normalizeRoomCode(value: string): string | null {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-HJ-KM-NP-Z]{3}[0-9]{2}$/.test(compact)) return null;
  return `${compact.slice(0, 3)}-${compact.slice(3)}`;
}
export function isForbiddenRoomCode(code: string): boolean {
  return FORBIDDEN_COMBINATIONS.includes(code.slice(0, 3).toUpperCase() as typeof FORBIDDEN_COMBINATIONS[number]);
}
function createCandidate(random: () => number): string {
  const letters = Array.from({ length: 3 }, () => LETTERS[Math.floor(random() * LETTERS.length)] ?? 'A').join('');
  const digits = String(Math.floor(random() * 100)).padStart(2, '0');
  return `${letters}-${digits}`;
}
export function createRoomCode(random: () => number = Math.random): string {
  for (let attempt = 0; attempt < MAX_ROOM_CODE_ATTEMPTS; attempt += 1) {
    const candidate = createCandidate(random);
    if (!isForbiddenRoomCode(candidate)) return candidate;
  }
  throw new Error('사용할 수 있는 방 코드를 만들지 못했습니다. 다시 시도해 주세요.');
}
export async function reserveRoomCode(
  reserve: (code: string) => Promise<boolean>,
  random: () => number = Math.random,
): Promise<string> {
  for (let attempt = 0; attempt < MAX_ROOM_CODE_ATTEMPTS; attempt += 1) {
    const candidate = createRoomCode(random);
    if (await reserve(candidate)) return candidate;
  }
  throw new Error('빈 방 코드를 찾지 못했습니다. 잠시 후 다시 시도해 주세요.');
}

type ReservationResponse = { status: number; ok: boolean };
type Reserver = (url: string, init: { method: string }) => Promise<ReservationResponse>;

export const RESERVATION_TRIES = 3;

/** 릴레이 방 객체가 처음 깨어날 때 Cloudflare가 간헐적으로 내부 오류를 낸다(세 번에 한 번꼴).
 *  같은 코드로 다시 부르면 이미 깨어 있어 성공하므로, 실패를 사용자에게 넘기기 전에 재시도한다. */
export async function requestReservation(
  url: string,
  send: Reserver,
  wait: (ms: number) => Promise<void>,
): Promise<boolean> {
  for (let attempt = 0; attempt < RESERVATION_TRIES; attempt += 1) {
    try {
      const response = await send(url, { method: 'POST' });
      if (response.status === 409) return false;
      if (response.ok) return true;
    } catch { /* 응답조차 못 받는 경우도 같은 원인이다 — 다음 시도로 넘어간다 */ }
    if (attempt < RESERVATION_TRIES - 1) await wait(200 * (attempt + 1));
  }
  throw new Error('방 코드를 확인하지 못했습니다. 다시 시도해 주세요.');
}

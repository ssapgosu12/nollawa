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

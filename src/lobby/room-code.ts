const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ';

export function normalizeRoomCode(value: string): string | null {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-HJ-KM-NP-Z]{3}[0-9]{2}$/.test(compact)) return null;
  return `${compact.slice(0, 3)}-${compact.slice(3)}`;
}

export function createRoomCode(random: () => number = Math.random): string {
  const letters = Array.from({ length: 3 }, () => LETTERS[Math.floor(random() * LETTERS.length)] ?? 'A').join('');
  const digits = String(Math.floor(random() * 100)).padStart(2, '0');
  return `${letters}-${digits}`;
}

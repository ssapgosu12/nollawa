import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { App, applyAuthorityGameAction, canConfirmMovePreview, confirmedActionFor, createMovePreview, createSharedGameStart, firstPlayerMethodFor, shouldRequestAiMove } from './App';
import { BoardGame } from './components/BoardGame';
import { RoomLobby } from './lobby/RoomLobby';
import { baduk, reduceBaduk } from './game/baduk';
import { GAME_CATALOG, actionForMove, boardSizesFor, initGame, isAiGameId, legalGameMoves } from './game/catalog';

const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
const lobbySource = readFileSync(new URL('./lobby/RoomLobby.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const text = (node) => node == null ? '' : Array.isArray(node) ? node.map(text).join(' ') : typeof node === 'object' ? text(node.props?.children) : String(node);

describe('M4-BADUK-1 shared catalog, entry, transport, and UI acceptance', () => {
  it('9/13/19 use the existing size selector and two-stage local/remote confirmation path', () => {
    expect(boardSizesFor('baduk')).toEqual([9, 13, 19]);
    for (const size of boardSizesFor('baduk')) {
      const state = initGame('baduk', size), move = legalGameMoves('baduk', state)[0], preview = createMovePreview('baduk', state, move);
      expect(state.board).toHaveLength(size);
      expect(canConfirmMovePreview('baduk', state, preview, false)).toBe(true);
      expect(confirmedActionFor('local', 'baduk', move)).toEqual(actionForMove('baduk', move));
      expect(confirmedActionFor('remote', 'baduk', move)).toEqual({ type: 'vote', move: `${move.row}:${move.column}` });
    }
    expect(appSource).toContain('boardSizesFor(game.id)');
    expect(appSource).toContain('setPreview(createMovePreview(selectedGame, state, move))');
  });

  it('catalog Korean name exposes local and remote human entry, common coin opening, and no Baduk AI entry', () => {
    const entry = GAME_CATALOG.find(({ id }) => id === 'baduk');
    expect(entry).toMatchObject({ name: '바둑', minPlayers: 2, maxPlayers: 2 });
    expect(entry.tags).not.toContain('봇 있음');
    expect(isAiGameId('baduk')).toBe(false);
    const staleAiRoom = { settings: { aiOpponent: true } };
    expect(firstPlayerMethodFor('remote', staleAiRoom, 'baduk')).toBe('coin');
    expect(shouldRequestAiMove('ai', null, true, 'baduk')).toBe(false);
    expect(createSharedGameStart('baduk', () => ({ outcomes: ['T'], replayKey: 7, firstPlayer: 2 }), 9)).toMatchObject({ game: 'baduk', state: { starter: 2, turn: 2 }, opening: { firstPlayer: 2 } });
    expect(appSource).toContain("startLocal(mode, game.id");
    expect(appSource).toContain('selectSharedGame(game.id');
    expect(appSource).toContain('isAiGameId(game.id)');
  });

  it('authority uses relay actor identity for Baduk scoring actions and keeps action payload identity-free', () => {
    let state = reduceBaduk(reduceBaduk(baduk.init(9), { type: 'pass' }, 1), { type: 'pass' }, 2);
    state.board[1][1] = 2;
    const action = { type: 'toggle-dead', row: 1, column: 1 };
    expect(action).not.toHaveProperty('actor');
    expect(applyAuthorityGameAction('baduk', state, action, undefined, true)).toBe(state);
    const accepted = applyAuthorityGameAction('baduk', state, action, { id: 'black', seat: 1 }, true);
    expect(accepted.deadMarks[1]).toEqual(['1:1']);
    expect(accepted.deadMarks[2]).toEqual([]);
  });

  it('required play, scoring, mismatch, and final UI states include pass, translucent dead marks, live preview, and submit', () => {
    const scoring = { ...baduk.init(9), phase: 'scoring', deadMarks: { 1: ['1:1'], 2: [] } }; scoring.board[1][1] = 2;
    const toggled = vi.fn(), view = BoardGame({ game: 'baduk', state: scoring, scoringSeat: 1, onDeadToggle: toggled });
    expect(view.props.renderCell(2, 1, 1, 150, 150).props.class).toBe('dead-stone');
    expect(view.props.isLegal(1, 1)).toBe(true); view.props.onSelect(1, 1); expect(toggled).toHaveBeenCalledWith({ row: 1, column: 1 });
    expect(styles).toMatch(/\.dead-stone \{ opacity: \.35/);
    for (const label of ['쉼', '종국 합의', '미리보기', '죽은 돌 제출', '제출됨']) expect(appSource).toContain(label);
  });

  it('Baduk room settings retain size selection while rendering no AI control or AI banner', () => {
    const room = { code: 'ABC-67', hostId: 'p1', game: 'baduk', teamNames: ['흑', '백'], settings: { aiOpponent: true, boardSize: 9 }, phase: 'lobby', participants: [{ id: 'p1', slot: 1, name: '하나', ready: true, present: true }, { id: 'p2', slot: 2, name: '둘', ready: true, present: true }] };
    const rendered = text(RoomLobby({ room, selfId: 'p1', send: vi.fn(), openGames: vi.fn() }));
    expect(rendered).toContain('바둑'); expect(rendered).toContain('판 크기'); expect(rendered).not.toContain('AI 대전'); expect(rendered).not.toContain('AI 강도');
    expect(lobbySource).toContain('aiSupported');
    expect(App).toBeTypeOf('function');
  });
});

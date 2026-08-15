import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { requestGameMove } from './ai/game-client';
import { BoardGame, nextLastTurnView, type LastTurnView } from './components/BoardGame';
import { CoinResults, DiceResults, EffectsTestPage } from './components/Effects';
import { FleetGame } from './components/FleetGame';
import { YachtGame } from './components/YachtGame';
import { Countdown, Vignette } from './components/TableEffects';
import { reduceRematchConsent, reduceSharedRematch, rematchProgress, type RematchMember, type RematchState } from './game/rematch-consent';
import { actionForMove, boardSizesFor, GAME_CATALOG, catalogGameId, gameId, hasBoardSize, initGame, isAiGameId, isBoardGameId, legalGameMoveKeys, moveKey, reduceGame, reduceGameMove, restartAction, terminalGame, voteActionForMove, type AiGameId, type BoardSize, type CatalogGameId, type GameAction, type GameId, type GameMove, type GameMoveKey, type GameState, type GameWireAction } from './game/catalog';
import { badukColorForSeat, badukPreviewFor, reduceBaduk, type BadukAction, type BadukState } from './game/baduk';
import { createFleetState, createVariantFleetState, fleetActorId, isFleetAction, isFleetState, reduceFleet, type FleetAction, type FleetState } from './game/fleet';
import { appendYachtInput, createYachtDiceOpening, createYachtEventLog, isYachtPersisted, loadYachtEvents, replayYachtEvents, saveYachtEvents, undoYachtInput, yachtPersisted, type YachtDiceOpening, type YachtInputEvent, type YachtPersisted } from './game/yacht-events';
import type { YachtParticipant } from './game/yacht-session';
import type { YachtTurnAction } from './game/yacht';
import { samok, type SamokState, type Seat } from './game/samok';
import { authorityResolvedVoteDeadline, authorityVoteDeadline, commitResolvedTeamVote, reduceAuthorityVote, roulettePlan, settleTeamVote, type TeamVoteRules, type VoteMember } from './game/team-vote';
import { normalizeRoomCode, requestReservation, reserveRoomCode } from './lobby/room-code';
import { RoomLobby } from './lobby/RoomLobby';
import { isRoomHost, MAIN_DESTINATIONS, reuseRemoteTransport, roomScreen, teamForSlot, type RoomCommand, type RoomSnapshot } from './lobby/room-state';
import { deviceReconnectKey, LoopbackTransport, WebSocketTransport, type Transport } from './transport/transport';
export type Screen = 'name' | 'room' | 'lobby' | 'games' | 'effects' | 'opening' | 'play' | 'yacht' | 'fleet';
export type PlayMode = 'local' | 'ai' | 'remote';
export type AppHistoryRoute = 'name' | 'lobby' | 'games' | 'play' | 'yacht' | 'yacht-sheet';
interface AppHistoryState { nollawa: 'route-v1'; route: AppHistoryRoute }
export type HistorySyncPlan = { type: 'none' } | { type: 'replace'; route: AppHistoryRoute } | { type: 'push'; routes: AppHistoryRoute[] } | { type: 'go'; delta: number; route: AppHistoryRoute };
const appHistoryState = (route: AppHistoryRoute): AppHistoryState => ({ nollawa: 'route-v1', route });
const appHistoryRouteFrom = (state: unknown): AppHistoryRoute | null => typeof state === 'object' && state !== null && (state as Partial<AppHistoryState>).nollawa === 'route-v1' ? (state as AppHistoryState).route : null;
export const remoteMatchRoute = (game: CatalogGameId): 'play' | 'yacht' => game === 'yacht' ? 'yacht' : 'play';
export function appHistoryRoute(screen: Screen, mode: PlayMode, openingDestination: 'play' | 'yacht' = 'play', yachtSheetOpen = false): AppHistoryRoute | null {
  if (screen === 'name' || screen === 'room') return 'name';
  if (screen === 'opening') return openingDestination;
  if (screen === 'yacht') return yachtSheetOpen ? 'yacht-sheet' : 'yacht';
  if (mode === 'remote') return screen === 'lobby' || screen === 'games' || screen === 'play' ? screen : null;
  return screen === 'games' ? 'games' : null;
}
export function remoteBackTransition(route: AppHistoryRoute): { screen: 'lobby' | 'name'; command: RoomCommand; close: boolean } | null {
  if (route === 'play' || route === 'yacht') return { screen: 'lobby', command: { command: 'return-lobby' }, close: false };
  if (route === 'games') return { screen: 'lobby', command: { command: 'set-activity', activity: 'lobby' }, close: false };
  if (route === 'lobby') return { screen: 'name', command: { command: 'leave-room' }, close: true };
  return null;
}
const historyChain = (route: AppHistoryRoute, mode: PlayMode): AppHistoryRoute[] => {
  if (route === 'name') return ['name'];
  if (mode !== 'remote') {
    if (route === 'games') return ['name', 'games'];
    if (route === 'yacht') return ['name', 'games', 'yacht'];
    if (route === 'yacht-sheet') return ['name', 'games', 'yacht', 'yacht-sheet'];
  }
  if (route === 'lobby') return ['name', 'lobby'];
  if (route === 'games' || route === 'play' || route === 'yacht') return ['name', 'lobby', route];
  if (route === 'yacht-sheet') return ['name', 'lobby', 'yacht', 'yacht-sheet'];
  return ['name'];
};
export function planHistorySync(current: AppHistoryRoute | null, next: AppHistoryRoute, mode: PlayMode = 'remote'): HistorySyncPlan {
  if (current === null) return { type: 'replace', route: next };
  if (current === next) return { type: 'none' };
  const currentChain = historyChain(current, mode), nextChain = historyChain(next, mode);
  let shared = 0;
  while (currentChain[shared] === nextChain[shared]) shared += 1;
  if (shared === currentChain.length) return { type: 'push', routes: nextChain.slice(shared) };
  if (shared === nextChain.length) return { type: 'go', delta: nextChain.length - currentChain.length, route: next };
  return { type: 'replace', route: next };
}
export interface AppBackTransition { route: AppHistoryRoute; screen: 'name' | 'lobby' | 'games' | 'yacht'; command?: RoomCommand; close: boolean; sheetOpen: boolean }
export function appBackTransition(route: AppHistoryRoute, mode: PlayMode): AppBackTransition | null {
  if (route === 'yacht-sheet') return { route: 'yacht', screen: 'yacht', close: false, sheetOpen: false };
  if (route === 'yacht') return mode === 'remote'
    ? { route: 'lobby', screen: 'lobby', command: { command: 'return-lobby' }, close: false, sheetOpen: false }
    : { route: 'games', screen: 'games', close: false, sheetOpen: false };
  if (route === 'play' && mode === 'remote') return { route: 'lobby', screen: 'lobby', command: { command: 'return-lobby' }, close: false, sheetOpen: false };
  if (route === 'games') return mode === 'remote'
    ? { route: 'lobby', screen: 'lobby', command: { command: 'set-activity', activity: 'lobby' }, close: false, sheetOpen: false }
    : { route: 'name', screen: 'name', close: true, sheetOpen: false };
  if (route === 'lobby' && mode === 'remote') return { route: 'name', screen: 'name', command: { command: 'leave-room' }, close: true, sheetOpen: false };
  return null;
}
interface PopStateTarget {
  history: Pick<History, 'replaceState'>;
  addEventListener(type: 'popstate', listener: (event: PopStateEvent) => void): void;
  removeEventListener(type: 'popstate', listener: (event: PopStateEvent) => void): void;
}
interface PopStateContext { route: AppHistoryRoute | null; mode: PlayMode; skip: AppHistoryRoute | null }
export function bindAppPopState(target: PopStateTarget, read: () => PopStateContext, clearSkip: () => void, apply: (transition: AppBackTransition) => void): () => void {
  const onPopState = (event: PopStateEvent) => {
    const current = read();
    if (current.skip) { clearSkip(); if (appHistoryRouteFrom(event.state) !== current.skip) target.history.replaceState(appHistoryState(current.skip), ''); return; }
    if (!current.route) return;
    const transition = appBackTransition(current.route, current.mode);
    if (!transition) return;
    if (appHistoryRouteFrom(event.state) !== transition.route) target.history.replaceState(appHistoryState(transition.route), '');
    apply(transition);
  };
  target.addEventListener('popstate', onPopState);
  return () => target.removeEventListener('popstate', onPopState);
}
interface ActionActor { id: string; seat: Seat | null }
interface AcceptedActionSource { actor: ActionActor; action: GameWireAction }
export interface FirstPlayerCoin { outcomes: readonly ['H' | 'T']; replayKey: number; firstPlayer: Seat }
interface FirstPlayerChoice { game: GameId; size: BoardSize; shared: boolean }
const isYachtAction = (action: GameWireAction | YachtTurnAction | FleetAction): action is YachtTurnAction => ['roll', 'toggle-reroll', 'stop', 'register'].includes(action.type);
type GameMessage =
  | { type: 'action'; action: GameWireAction | YachtTurnAction | FleetAction; actor?: ActionActor }
  | { type: 'snapshot'; game?: CatalogGameId; state: GameState | YachtPersisted | FleetState; source?: AcceptedActionSource; opening?: FirstPlayerCoin; yachtOpening?: YachtDiceOpening; openingChoice?: { game: GameId; size: BoardSize }; startsGame?: boolean }
  | { type: 'identity'; id: string; authority: string; seat: Seat | null }
  | { type: 'authority'; authority: string | null }
  | { type: 'room'; room: RoomSnapshot }
  | ({ type: 'room-command' } & RoomCommand)
  | { type: 'room-error'; message: string };
export type PeopleFilter = 'all' | '1' | '2' | '3-4';
export function filterGames(query: string, people: PeopleFilter, tags: readonly string[]) { const needle = query.trim().toLowerCase(), range = people === '1' ? [1, 1] : people === '2' ? [2, 2] : people === '3-4' ? [3, 4] : [1, 6]; return GAME_CATALOG.filter((game) => game.minPlayers <= range[1]! && game.maxPlayers >= range[0]! && tags.every((tag) => (game.tags as readonly string[]).includes(tag)) && `${game.name} ${game.tags.join(' ')}`.toLowerCase().includes(needle)); }
export function restartNoticeFor(state: GameState, source: AcceptedActionSource | undefined, clientId: string | null, seat: Seat | null): string {
  return source?.action.type === 'restart' && state.winner === null && !state.draw && state.moves === 0 && seat !== null && source.actor.id !== clientId ? '상대가 새 판을 시작했습니다' : '';
}
export const identitySeat = (message: Extract<GameMessage, { type: 'identity' }>): Seat | null => message.seat;
export const remoteSeatLabel = (seat: Seat | null): string => seat ? `내 팀 ${seat}` : '관전 중 · 좌석 없음';
export const remoteBoardDisabled = (state: SamokState, seat: Seat | null): boolean => samok.terminal(state).ended || seat !== state.turn;
const activeGameParticipants = (room: RoomSnapshot) => room.participants.filter((person) => (person.activity ?? (room.phase === 'play' ? 'play' : 'lobby')) === 'play');
export const roomVoteMembers = (room: RoomSnapshot | null, turn: Seat): VoteMember[] => room ? activeGameParticipants(room).filter((person) => room.settings.aiOpponent ? turn === 1 : teamForSlot(person.slot) === turn).map((person) => ({ id: person.id, team: turn })) : [];
export const roomRematchMembers = (room: RoomSnapshot | null): RematchMember[] => room ? activeGameParticipants(room).map(({ id, name }) => ({ id, name })) : [];
export const remoteRematchPresentation = (state: SamokState, room: RoomSnapshot | null, selfId: string | null) => rematchProgress(state, roomRematchMembers(room), selfId);
export const applyAuthorityRematch = (state: SamokState, actor: ActionActor | undefined, room: RoomSnapshot | null, authority: boolean): SamokState => authority && actor ? reduceRematchConsent(state, actor.id, roomRematchMembers(room)) : state;
export const shouldRequestAiMove = (mode: PlayMode, room: RoomSnapshot | null, authority: boolean, game: GameId = 'samok'): boolean => isAiGameId(game) && (mode === 'ai' || (mode === 'remote' && room?.settings.aiOpponent === true && authority));
export const applyAuthorityAiMove = (state: SamokState, column: number, authority: boolean): SamokState => authority ? samok.reduce(state, { type: 'drop', column }) : state;
export const applyAuthorityGameAction = (game: GameId, state: GameState, action: GameAction, actor: ActionActor | undefined, authority: boolean): GameState => {
  if (!authority || !actor?.seat) return state;
  if (game === 'baduk') return reduceBaduk(state as BadukState, action as BadukAction, actor.seat);
  return action.type === 'restart' || actor.seat === state.turn ? reduceGame(game, state, action) : state;
};
export const applyAuthorityGameRematch = (game: GameId, state: GameState, actor: ActionActor | undefined, room: RoomSnapshot | null, authority: boolean): GameState => authority && actor ? reduceSharedRematch(state as GameState & RematchState, actor.id, roomRematchMembers(room), terminalGame(game, state).ended, (current) => reduceGame(game, current, restartAction()) as GameState & RematchState) : state;
export const voteRulesForGame = (game: GameId): TeamVoteRules<GameState> => ({ legalMoves: (current) => legalGameMoveKeys(game, current), applyMove: (current, move) => reduceGameMove(game, current, move) });
export const AI_MOVE_DELAY_MS = 1_000;
export const COIN_TOSS_DURATION_MS = 700;
export const YACHT_OPENING_RESULT_MS = 4_000;
export const YACHT_OPENING_FADE_MS = 300;
export function scheduleYachtOpeningTransition(schedule: (task: () => void, delayMs: number) => number, onTimer: (timer: number | null) => void, onFade: () => void, onComplete: () => void) {
  onTimer(schedule(() => {
    onFade();
    onTimer(schedule(() => { onComplete(); onTimer(null); }, YACHT_OPENING_FADE_MS));
  }, YACHT_OPENING_RESULT_MS));
}
export const aiBudgetMs = (room: RoomSnapshot | null) => room?.settings.aiStrength === 'high' ? 3_000 : AI_MOVE_DELAY_MS;
export const gameListModeAfterPlay = (mode: PlayMode): PlayMode => mode === 'ai' ? 'local' : mode;
export const firstPlayerMethodFor = (mode: PlayMode, room: RoomSnapshot | null, game: GameId = 'samok'): 'coin' | 'choice' => game !== 'baduk' && (mode === 'ai' || (mode === 'remote' && room?.settings.aiOpponent === true)) ? 'choice' : 'coin';
export const firstPlayerChoiceLabels = (game: GameId): readonly [string, string] => game === 'omok' || game === 'yukmok' || game === 'baduk' ? ['흑돌 (선수)', '백돌 (후수)'] : ['1번 (선수)', '2번 (후수)'];
export const completedGameRestart = (game: GameId, before: GameState, after: GameState): boolean => terminalGame(game, before).ended && !terminalGame(game, after).ended;
export interface MovePreview { game: GameId; move: GameMove; moves: number; turn: Seat }
export const createMovePreview = (game: GameId, state: GameState, move: GameMove): MovePreview => ({ game, move, moves: state.moves, turn: state.turn });
export const canConfirmMovePreview = (game: GameId, state: GameState, preview: MovePreview | null, disabled: boolean): preview is MovePreview => Boolean(preview && !disabled && preview.game === game && preview.moves === state.moves && preview.turn === state.turn && legalGameMoveKeys(game, state).includes(moveKey(preview.move)));
export const confirmedActionFor = (mode: PlayMode, game: GameId, move: GameMove): GameWireAction => mode === 'remote' ? voteActionForMove(move) : actionForMove(game, move);
export const playStatusFor = (aiThinking: boolean, restartNotice: string, mode: PlayMode, seat: Seat | null): string => aiThinking ? 'AI 생각중...' : restartNotice || (mode === 'remote' ? remoteSeatLabel(seat) : '');
interface YachtGameRouteProps { events: readonly YachtInputEvent[]; mode: PlayMode; selfId: string | null; sheetOpen?: boolean; onSheetOpenChange?: (open: boolean) => void; onAction: (action: YachtTurnAction) => void; onUndo: () => void; onExit: () => void }
export function YachtGameRoute({ events, mode, selfId, sheetOpen = false, onSheetOpenChange = () => undefined, onAction, onUndo, onExit }: YachtGameRouteProps) {
  const session = replayYachtEvents(events);
  return <YachtGame events={events} actorId={mode === 'remote' ? selfId : session.currentParticipantId} viewerId={mode === 'remote' ? selfId : session.participants[0]?.id ?? null} local={mode !== 'remote'} sheetOpen={sheetOpen} onSheetOpenChange={onSheetOpenChange} onAction={onAction} onUndo={onUndo} onExit={onExit} />;
}
export const createFirstPlayerCoin = (random: () => number = Math.random, replayKey = Date.now()): FirstPlayerCoin => {
  const firstPlayer: Seat = random() < .5 ? 1 : 2;
  return { outcomes: [firstPlayer === 1 ? 'H' : 'T'], replayKey, firstPlayer };
};
export const createSharedGameSelection = (game: GameId, size: BoardSize = 13) => ({ type: 'snapshot' as const, game, state: initGame(game, size) });
export const createSharedGameStart = (game: GameId, createOpening: () => FirstPlayerCoin = createFirstPlayerCoin, size: BoardSize = 13) => {
  const opening = createOpening(); return { type: 'snapshot' as const, game, state: initialGameForOpening(game, opening.firstPlayer, size), opening }; };
export function initialGameForOpening(game: GameId, firstPlayer: Seat, size: BoardSize = 13): GameState {
  const initial = initGame(game, size);
  if (firstPlayer === 1) return initial;
  const board = initial.board.map((row) => row.map((cell) => cell === 1 ? 2 : cell === 2 ? 1 : cell));
  return { ...initial, board, turn: 2, starter: 2 } as GameState;
}
export function forcedAiOpeningMove(game: GameId, state: GameState): GameMove | null {
  if ((game !== 'omok' && game !== 'yukmok') || state.turn !== 2 || state.moves !== 0) return null;
  const center = Math.floor(state.board.length / 2);
  return { row: center, column: center };
}
export const requestGameMoveWithRoomBudget = (game: AiGameId, state: GameState, room: RoomSnapshot | null, requester: typeof requestGameMove = requestGameMove) => {
  const forced = forcedAiOpeningMove(game, state);
  return forced ? Promise.resolve(forced) : requester(game, state, aiBudgetMs(room));
};
export const roomMessageTransition = (currentGame: GameId, currentState: GameState, room: RoomSnapshot) => ({ game: gameId(room.game), state: currentState });
export function voteTimerPresentation(state: GameState, now: number) {
  if (!state.vote || state.vote.effectsSuppressed) return { remaining: 0, visible: false, intensity: 0, periodMs: 1_000 };
  const remaining = Math.max(0, Math.ceil((state.vote.deadline - now) / 1_000));
  return { remaining, visible: remaining > 0 && remaining <= 5, intensity: .12, periodMs: remaining <= 3 ? 250 : 1_000 };
}
export const returnToLobby = (send: (command: RoomCommand) => void) => send({ command: 'return-lobby' });
export function leaveForTitle(send: (command: RoomCommand) => void, close: () => void, showTitle: () => void) {
  send({ command: 'leave-room' });
  close();
  showTitle();
}
export function waitForAiMoveGate(startedAt: number, signal?: AbortSignal, budgetMs = AI_MOVE_DELAY_MS): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted) { resolve(false); return; }
    const timer = globalThis.setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve(true); }, Math.max(0, startedAt + budgetMs - Date.now()));
    const cancel = () => { globalThis.clearTimeout(timer); resolve(false); };
    signal?.addEventListener('abort', cancel, { once: true });
  });
}
export async function withAiMoveGate(request: Promise<GameMove | null>, startedAt: number, budgetMs: number, signal: AbortSignal, present: (active: boolean) => void): Promise<[GameMove | null, boolean]> {
  present(true);
  try { const current = await waitForAiMoveGate(startedAt, signal, budgetMs); return [current ? await request : null, current]; }
  finally { present(false); }
}
function relayUrl(code: string): string {
  const base = import.meta.env.VITE_RELAY_URL ?? `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
  return `${base.replace(/\/$/, '')}/room/${code}`;
}
const reservationUrl = (code: string) => relayUrl(code).replace(/^ws/, 'http');
export function App() {
  const [screen, setScreen] = useState<Screen>('name');
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [roomInput, setRoomInput] = useState('');
  const [roomError, setRoomError] = useState('');
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [query, setQuery] = useState('');
  const [peopleFilter, setPeopleFilter] = useState<PeopleFilter>('all');
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [mode, setMode] = useState<PlayMode>('local');
  const [selectedGame, setSelectedGame] = useState<GameId>('samok'), [boardSize, setBoardSize] = useState<BoardSize>(13);
  const [state, setState] = useState<GameState>(() => samok.init());
  const [connection, setConnection] = useState('준비');
  const [localSeat, setLocalSeat] = useState<Seat | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [authority, setAuthority] = useState(false);
  const [aiThinkingVisible, setAiThinkingVisible] = useState(false);
  const [rouletteMove, setRouletteMove] = useState<GameMoveKey | null>(null);
  const [restartNotice, setRestartNotice] = useState('');
  const [opening, setOpening] = useState<FirstPlayerCoin | null>(null);
  const [openingChoice, setOpeningChoice] = useState<FirstPlayerChoice | null>(null);
  const [openingFading, setOpeningFading] = useState(false);
  const [yachtEvents, setYachtEvents] = useState<YachtInputEvent[] | null>(() => loadYachtEvents(typeof sessionStorage === 'undefined' ? undefined : sessionStorage));
  const [yachtPlayers, setYachtPlayers] = useState(2), [yachtOpening, setYachtOpening] = useState<YachtDiceOpening | null>(null), [yachtSheetOpen, setYachtSheetOpen] = useState(false);
  const [fleetState, setFleetState] = useState<FleetState | null>(null), [variantPlayers, setVariantPlayers] = useState(3);
  const [clock, setClock] = useState(() => Date.now());
  const [preview, setPreview] = useState<MovePreview | null>(null);
  const [localScoringSeat, setLocalScoringSeat] = useState<Seat>(1);
  const [lastTurn, setLastTurn] = useState<LastTurnView>({ game: 'samok', moves: 0, cells: [] });
  const transportRef = useRef<Transport<GameMessage> | null>(null);
  const clientId = useRef<string | null>(null);
  const localSeatRef = useRef<Seat | null>(null);
  const roomRef = useRef<RoomSnapshot | null>(null);
  const selectedGameRef = useRef<GameId>('samok'), previousAccepted = useRef<{ game: GameId; state: GameState } | null>(null);
  const isAuthority = useRef(false);
  const aiThinking = useRef(false);
  const aiRequest = useRef(0);
  const openingTimer = useRef<number | null>(null);
  const openingDestination = useRef<'play' | 'yacht'>('play');
  const historyReady = useRef(false), skipPopTarget = useRef<AppHistoryRoute | null>(null);
  const visibleGames = useMemo(() => filterGames(query, peopleFilter, tagFilters), [peopleFilter, query, tagFilters]);
  const isHost = room ? isRoomHost(room, selfId) : false;
  function bindTransport(transport: Transport<GameMessage>, nextMode: PlayMode) {
    transport.onMessage((message) => {
      if (message.type === 'identity') {
        const seat = identitySeat(message);
        clientId.current = message.id;
        localSeatRef.current = seat;
        setSelfId(message.id);
        setLocalSeat(seat);
        isAuthority.current = message.id === message.authority;
        setAuthority(isAuthority.current);
      }
      if (message.type === 'authority') {
        isAuthority.current = clientId.current === message.authority;
        setAuthority(isAuthority.current);
      }
      if (message.type === 'room') {
        roomRef.current = message.room;
        setRoom(message.room);
        setBoardSize(message.room.settings.boardSize ?? 13);
        if (isBoardGameId(message.room.game)) { const transition = roomMessageTransition(selectedGameRef.current, state, message.room); selectedGameRef.current = transition.game; setSelectedGame(transition.game); }
        setScreen(message.room.phase === 'play' && (message.room.game === 'yacht' || message.room.game === 'fleet' || message.room.game === 'fleet-variant') ? message.room.game === 'yacht' ? 'yacht' : 'fleet' : roomScreen(message.room, clientId.current));
      }
      if (message.type === 'room-error') setConnection(message.message);
      if (message.type === 'action' && isFleetAction(message.action)) {
        if (nextMode === 'remote' && isAuthority.current && message.actor) setFleetState((current) => {
          if (!current) return current;
          const next = reduceFleet(current, message.actor!.id, message.action as FleetAction);
          if (next !== current) queueMicrotask(() => transport.send({ type: 'snapshot', game: next.mode === 'variant' ? 'fleet-variant' : 'fleet', state: next }));
          return next;
        });
        return;
      }
      if (message.type === 'action' && isYachtAction(message.action)) {
        if (nextMode === 'remote' && isAuthority.current && message.actor) setYachtEvents((current) => {
          if (!current) return current;
          const next = appendYachtInput(current, message.actor!.id, message.action as YachtTurnAction);
          if (next !== current) queueMicrotask(() => transport.send({ type: 'snapshot', game: 'yacht', state: yachtPersisted(next) }));
          return next;
        });
        return;
      }
      if (message.type === 'action') { const boardAction = message.action as GameWireAction; setState((current) => {
        let next = current;
        const game = selectedGameRef.current;
        if (nextMode !== 'remote' && boardAction.type !== 'vote') {
          next = reduceGame(game, current, boardAction);
          if (boardAction.type === 'restart' && completedGameRestart(game, current, next)) {
            queueMicrotask(() => beginOpening(game, current.board.length as BoardSize, nextMode));
            return current;
          }
        }
        else if (isAuthority.current && game === 'baduk' && (boardAction.type === 'pass' || boardAction.type === 'toggle-dead' || boardAction.type === 'submit-score') && message.actor) next = applyAuthorityGameAction(game, current, boardAction, message.actor, true);
        else if (isAuthority.current && boardAction.type === 'vote' && message.actor) next = reduceAuthorityVote(current, boardAction.move, message.actor, roomVoteMembers(roomRef.current, current.turn), true, Date.now(), Math.random, voteRulesForGame(game));
        else if (isAuthority.current && boardAction.type === 'restart') {
          next = applyAuthorityGameRematch(game, current, message.actor, roomRef.current, true);
          if (completedGameRestart(game, current, next)) {
            if (firstPlayerMethodFor(nextMode, roomRef.current, game) === 'choice') {
              queueMicrotask(() => beginOpening(game, roomRef.current?.settings.boardSize ?? 13, nextMode, current));
              return current;
            }
            const nextOpening = createFirstPlayerCoin();
            next = initialGameForOpening(game, nextOpening.firstPlayer, roomRef.current?.settings.boardSize ?? 13);
            queueMicrotask(() => transport.send({ type: 'snapshot', game, state: next, opening: nextOpening }));
            return next;
          }
        }
        if (nextMode === 'remote' && isAuthority.current && next !== current) {
          const source = message.actor ? { actor: message.actor, action: boardAction } : undefined;
          queueMicrotask(() => transport.send({ type: 'snapshot', game, state: next, source }));
        }
        return next;
      }); }
      if (message.type === 'snapshot') {
        if (isFleetState(message.state)) { setFleetState(message.state); setScreen('fleet'); return; }
        if (isYachtPersisted(message.state)) {
          setYachtEvents([...message.state.events]);
          setYachtSheetOpen(false);
          if (message.opening) showOpening(message.opening, 'yacht');
          else if (message.yachtOpening) showYachtDiceOpening(message.yachtOpening);
          else setScreen('yacht');
          return;
        }
        const snapshotGame = message.game ?? selectedGameRef.current;
        if (!isBoardGameId(snapshotGame)) return;
        selectedGameRef.current = snapshotGame; setSelectedGame(snapshotGame);
        setRestartNotice(restartNoticeFor(message.state, message.source, clientId.current, localSeatRef.current));
        setState(message.state);
        if (message.opening) showOpening(message.opening);
        else if (message.openingChoice) showOpeningChoice(message.openingChoice.game, message.openingChoice.size, nextMode === 'remote');
        else if (message.startsGame) { setOpeningChoice(null); setScreen('play'); }
      }
    });
    transport.onPeerChange((count) => setConnection(`${count}명 연결`));
  }
  function closeTransport() {
    transportRef.current?.close();
    transportRef.current = null;
    roomRef.current = null;
    setRoom(null);
    setSelfId(null);
    setAuthority(false);
  }
  function chooseLocal() {
    closeTransport();
    setMode('local');
    setScreen('games');
  }
  async function enterRemote(code: string) {
    setMode('remote');
    setRoomCode(code);
    setRoomError('');
    setConnection('연결 중');
    const key = await deviceReconnectKey();
    const existing = transportRef.current;
    const transport = reuseRemoteTransport(existing, () => new WebSocketTransport(relayUrl(code), key, name.trim()));
    if (!existing) {
      transportRef.current = transport;
      bindTransport(transport, 'remote');
      await transport.connect();
    }
    setConnection(`방 ${code}`);
    setScreen('lobby');
  }
  function joinRoom() {
    const normalized = normalizeRoomCode(roomInput);
    if (!normalized) { setRoomError('영문 3자와 숫자 2자를 입력하세요. I, L, O는 쓰지 않습니다.'); return; }
    void enterRemote(normalized).catch((error) => setRoomError(error instanceof Error ? error.message : '입장하지 못했습니다.'));
  }
  async function createRoom() {
    setCreatingRoom(true);
    setRoomError('');
    try {
      const code = await reserveRoomCode((candidate) => requestReservation(
        reservationUrl(candidate),
        (url, init) => fetch(url, init),
        (ms) => new Promise((resolve) => { window.setTimeout(resolve, ms); }),
      ));
      await enterRemote(code);
    } catch (error) { setRoomError(error instanceof Error ? error.message : '방을 만들지 못했습니다.'); }
    finally { setCreatingRoom(false); }
  }
  async function startLocal(nextMode: PlayMode, game: CatalogGameId, size: BoardSize = boardSize) {
    if (!isBoardGameId(game)) return;
    closeTransport();
    const transport: Transport<GameMessage> = new LoopbackTransport();
    bindTransport(transport, nextMode);
    transportRef.current = transport;
    setMode(nextMode);
    selectedGameRef.current = game;
    setSelectedGame(game);
    setLocalSeat(null);
    setRestartNotice('');
    await transport.connect();
    setConnection('이 기기 연결');
    beginOpening(game, size, nextMode);
  }
  function publishYachtStart(participants: readonly YachtParticipant[], shared: boolean) {
    let ordered = [...participants], coin: FirstPlayerCoin | undefined, diceOpening: YachtDiceOpening | undefined;
    if (participants.length === 2) { coin = createFirstPlayerCoin(); ordered = coin.firstPlayer === 1 ? ordered : [ordered[1]!, ordered[0]!]; }
    else if (participants.length > 2) { diceOpening = createYachtDiceOpening(participants); ordered = [...diceOpening.order]; }
    const events = createYachtEventLog(participants, ordered.map(({ id }) => id));
    setYachtEvents(events);
    setYachtSheetOpen(false);
    if (shared) send({ type: 'snapshot', game: 'yacht', state: yachtPersisted(events), opening: coin, yachtOpening: diceOpening, startsGame: true });
    else { saveYachtEvents(typeof sessionStorage === 'undefined' ? undefined : sessionStorage, events); if (coin) showOpening(coin, 'yacht'); else if (diceOpening) showYachtDiceOpening(diceOpening); else setScreen('yacht'); }
  }
  function startLocalYacht() {
    closeTransport(); setMode('local'); setConnection('이 기기 연결'); setSelfId(null); setLocalSeat(null);
    publishYachtStart(Array.from({ length: yachtPlayers }, (_, index) => ({ id: `local-${index + 1}`, name: index === 0 ? name.trim() : `${index + 1}P` })), false);
  }
  function publishFleetStart(participants: readonly { id: string; name: string }[], shared: boolean) {
    const next = createFleetState(participants); setFleetState(next);
    if (shared) send({ type: 'snapshot', game: 'fleet', state: next, startsGame: true }); else setScreen('fleet');
  }
  function startLocalFleet() {
    closeTransport(); setMode('local'); setConnection('이 기기 연결'); setSelfId(null); setLocalSeat(null);
    publishFleetStart([{ id: 'local-1', name: name.trim() }, { id: 'local-2', name: '2P' }], false);
  }
  function publishVariantFleetStart(participants: readonly { id: string; name: string }[], shared: boolean) {
    const next = createVariantFleetState(participants); setFleetState(next);
    if (shared) send({ type: 'snapshot', game: 'fleet-variant', state: next, startsGame: true }); else setScreen('fleet');
  }
  function startLocalVariantFleet() {
    closeTransport(); setMode('local'); setConnection('이 기기 연결'); setSelfId(null); setLocalSeat(null);
    publishVariantFleetStart(Array.from({ length: variantPlayers }, (_, index) => ({ id: `local-${index + 1}`, name: index === 0 ? name.trim() : `${index + 1}P` })), false);
  }
  function beginOpening(game: GameId, size: BoardSize, nextMode: PlayMode, current: GameState = initGame(game, size)) {
    if (firstPlayerMethodFor(nextMode, roomRef.current, game) === 'choice') {
      if (nextMode === 'remote') send({ type: 'snapshot', game, state: current, openingChoice: { game, size } });
      else showOpeningChoice(game, size, false);
      return;
    }
    const nextOpening = createFirstPlayerCoin();
    const nextState = initialGameForOpening(game, nextOpening.firstPlayer, size);
    setState(nextState);
    if (nextMode === 'remote') send({ type: 'snapshot', game, state: nextState, opening: nextOpening });
    else showOpening(nextOpening);
  }
  function showOpeningChoice(game: GameId, size: BoardSize, shared: boolean) {
    if (openingTimer.current !== null) window.clearTimeout(openingTimer.current);
    openingDestination.current = 'play';
    setOpening(null);
    setOpeningChoice({ game, size, shared });
    setScreen('opening');
  }
  function chooseFirstPlayer(firstPlayer: Seat) {
    if (!openingChoice) return;
    const next = initialGameForOpening(openingChoice.game, firstPlayer, openingChoice.size);
    setState(next);
    setOpeningChoice(null);
    setScreen('play');
    if (openingChoice.shared) send({ type: 'snapshot', game: openingChoice.game, state: next, startsGame: true });
  }
  function showOpening(nextOpening: FirstPlayerCoin, destination: 'play' | 'yacht' = 'play') {
    if (openingTimer.current !== null) window.clearTimeout(openingTimer.current);
    openingDestination.current = destination;
    setOpeningFading(false);
    setYachtOpening(null);
    setOpeningChoice(null);
    setOpening(nextOpening);
    setScreen('opening');
    if (destination === 'yacht') scheduleYachtOpeningTransition(window.setTimeout.bind(window), (timer) => { openingTimer.current = timer; }, () => setOpeningFading(true), () => setScreen('yacht'));
    else openingTimer.current = window.setTimeout(() => { setScreen(openingDestination.current); openingTimer.current = null; }, COIN_TOSS_DURATION_MS);
  }
  function showYachtDiceOpening(nextOpening: YachtDiceOpening) {
    if (openingTimer.current !== null) window.clearTimeout(openingTimer.current);
    openingDestination.current = 'yacht';
    setOpeningFading(false);
    setOpening(null); setOpeningChoice(null); setYachtOpening(nextOpening); setScreen('opening');
    scheduleYachtOpeningTransition(window.setTimeout.bind(window), (timer) => { openingTimer.current = timer; }, () => setOpeningFading(true), () => setScreen('yacht'));
  }
  function send(message: GameMessage) {
    try { transportRef.current?.send(message); }
    catch (error) { setConnection(error instanceof Error ? error.message : '전송 실패'); }
  }
  function actBaduk(action: BadukAction, actor: Seat) {
    if (mode === 'remote') { send({ type: 'action', action }); return; }
    setState((current) => selectedGameRef.current === 'baduk' ? reduceBaduk(current as BadukState, action, actor) : current);
  }
  function actYacht(action: YachtTurnAction) {
    if (mode === 'remote') { send({ type: 'action', action }); return; }
    setYachtEvents((current) => { if (!current) return current; const actor = replayYachtEvents(current).currentParticipantId, next = appendYachtInput(current, actor, action); if (next !== current) saveYachtEvents(typeof sessionStorage === 'undefined' ? undefined : sessionStorage, next); return next; });
  }
  function undoYacht() { if (mode === 'remote') return; setYachtEvents((current) => { if (!current) return current; const next = undoYachtInput(current); saveYachtEvents(typeof sessionStorage === 'undefined' ? undefined : sessionStorage, next); return next; }); }
  const sendSharedGameSnapshot = (snapshot: ReturnType<typeof createSharedGameSelection> | ReturnType<typeof createSharedGameStart>) => { selectedGameRef.current = snapshot.game; setSelectedGame(snapshot.game); setState(snapshot.state); send(snapshot); };
  const selectSharedGame = (game: GameId, size: BoardSize) => sendSharedGameSnapshot(createSharedGameSelection(game, size));
  const initializeSharedGame = (game: CatalogGameId, size: BoardSize) => { const participants = [...roomRef.current!.participants].sort((a, b) => a.slot - b.slot).map(({ id, name }) => ({ id, name })); if (game === 'yacht') publishYachtStart(participants.slice(0, 4), true); else if (game === 'fleet') publishFleetStart(participants.slice(0, 2), true); else if (game === 'fleet-variant') publishVariantFleetStart(participants, true); else if (firstPlayerMethodFor('remote', roomRef.current, game) === 'choice') beginOpening(game, size, 'remote'); else sendSharedGameSnapshot(createSharedGameStart(game, createFirstPlayerCoin, size)); };
  const sendRoom = (command: RoomCommand) => { send({ type: 'room-command', ...command }); if (command.command === 'start' && isAuthority.current) initializeSharedGame(catalogGameId(roomRef.current?.game ?? selectedGameRef.current), roomRef.current?.settings.boardSize ?? 13); };
  function applyBrowserBack(transition: AppBackTransition) {
    setYachtSheetOpen(transition.sheetOpen);
    if (transition.command) sendRoom(transition.command);
    if (transition.close) closeTransport();
    setScreen(transition.screen);
  }
  function showTitle() {
    const route = appHistoryRoute(screen, mode, openingDestination.current, yachtSheetOpen);
    if (mode === 'remote' && route && route !== 'name') leaveForTitle(sendRoom, closeTransport, () => setScreen('name'));
    else { closeTransport(); setScreen('name'); }
    setYachtSheetOpen(false);
  }
  useEffect(() => {
    const next = appHistoryRoute(screen, mode, openingDestination.current, yachtSheetOpen);
    if (!next) return;
    if (!historyReady.current) { window.history.replaceState(appHistoryState(next), ''); historyReady.current = true; return; }
    const plan = planHistorySync(appHistoryRouteFrom(window.history.state), next, mode);
    if (plan.type === 'replace') window.history.replaceState(appHistoryState(plan.route), '');
    else if (plan.type === 'push') plan.routes.forEach((route) => window.history.pushState(appHistoryState(route), ''));
    else if (plan.type === 'go') { skipPopTarget.current = plan.route; window.history.go(plan.delta); }
  }, [mode, screen, yachtSheetOpen]);
  useEffect(() => bindAppPopState(window, () => ({ route: appHistoryRoute(screen, mode, openingDestination.current, yachtSheetOpen), mode, skip: skipPopTarget.current }), () => { skipPopTarget.current = null; }, applyBrowserBack), [mode, screen, yachtSheetOpen]);
  useEffect(() => { setLastTurn((current) => nextLastTurnView(selectedGame, previousAccepted.current, state, current)); previousAccepted.current = { game: selectedGame, state }; }, [selectedGame, state]);
  useEffect(() => {
    if (screen === 'games') setMode((current) => gameListModeAfterPlay(current));
  }, [screen]);
  useEffect(() => {
    if (screen !== 'play' || !isAiGameId(selectedGame) || !shouldRequestAiMove(mode, room, authority, selectedGame) || state.turn !== 2 || terminalGame(selectedGame, state).ended || aiThinking.current) return;
    const aiGame = selectedGame;
    const requestId = ++aiRequest.current;
    const controller = new AbortController();
    const startedAt = Date.now();
    aiThinking.current = true;
    const budget = aiBudgetMs(room);
    void withAiMoveGate(requestGameMoveWithRoomBudget(aiGame, state, room), startedAt, budget, controller.signal, (active) => { if (requestId === aiRequest.current) setAiThinkingVisible(active); }).then(([move, current]) => {
      if (!current || requestId !== aiRequest.current) return;
      if (move !== null && mode === 'remote') setState((current) => {
        const next = isAuthority.current ? reduceGame(aiGame, current, actionForMove(aiGame, move)) : current;
        if (next !== current) queueMicrotask(() => send({ type: 'snapshot', game: aiGame, state: next }));
        return next;
      });
      else if (move !== null) send({ type: 'action', action: actionForMove(aiGame, move) });
    }).finally(() => { if (requestId === aiRequest.current) aiThinking.current = false; });
    return () => { aiRequest.current += 1; controller.abort(); aiThinking.current = false; setAiThinkingVisible(false); };
  }, [authority, mode, room, screen, selectedGame, state]);
  useEffect(() => {
    if (mode !== 'remote' || screen !== 'play' || !authority) return;
    const deadlines = [authorityVoteDeadline(state, authority), authorityResolvedVoteDeadline(state, authority)].filter((value): value is number => value !== null), rules = voteRulesForGame(selectedGame);
    if (!deadlines.length) return;
    const deadline = Math.min(...deadlines);
    const timer = window.setTimeout(() => setState((current) => {
      if (!isAuthority.current) return current;
      const settled = settleTeamVote(current, roomVoteMembers(roomRef.current, current.turn), Date.now(), Math.random, rules);
      const next = commitResolvedTeamVote(settled, Date.now(), rules);
      if (next !== current) queueMicrotask(() => send({ type: 'snapshot', game: selectedGame, state: next }));
      return next;
    }), Math.max(0, deadline - Date.now()));
    return () => window.clearTimeout(timer);
  }, [authority, mode, room, screen, selectedGame, state]);
  useEffect(() => {
    if (mode !== 'remote' || screen !== 'play' || !state.vote || state.vote.effectsSuppressed) return;
    const update = () => setClock(Date.now());
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [mode, screen, state.vote?.deadline, state.vote?.effectsSuppressed]);
  useEffect(() => {
    const plan = roulettePlan(state.resolvedVote);
    if (!plan.length) { setRouletteMove(null); return; }
    const age = Math.max(0, Date.now() - state.resolvedVote!.settledAt);
    let elapsed = 0;
    const timers: number[] = [];
    for (const step of plan) {
      if (age >= elapsed) setRouletteMove(step.move);
      else timers.push(window.setTimeout(() => setRouletteMove(step.move), elapsed - age));
      elapsed += step.dwellMs;
    }
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [state.resolvedVote]);
  useEffect(() => () => { transportRef.current?.close(); if (openingTimer.current !== null) window.clearTimeout(openingTimer.current); }, []);
  const badukState = selectedGame === 'baduk' ? state as BadukState : null, badukScoring = badukState?.phase === 'scoring', scoringSeat = mode === 'remote' ? localSeat : localScoringSeat;
  const outcome = badukState ? badukState.phase === 'finished' ? badukState.result : badukScoring ? '종국 합의' : `${badukColorForSeat(badukState, badukState.turn)} 차례` : state.winner ? `${state.winner}번 승리` : state.draw ? '무승부' : `${state.turn}번 차례`;
  const boardDisabled = Boolean(state.resolvedVote) || (badukScoring ? scoringSeat === null : mode === 'remote' ? terminalGame(selectedGame, state).ended || localSeat !== state.turn : terminalGame(selectedGame, state).ended || (mode === 'ai' && state.turn === 2)), confirmedPreview = canConfirmMovePreview(selectedGame, state, preview, boardDisabled) ? preview : null, playStatus = aiThinkingVisible ? 'AI 생각중...' : playStatusFor(false, restartNotice, mode, localSeat), seatStatus = mode === 'remote' && !aiThinkingVisible && !restartNotice, lastTurnCells = lastTurn.game === selectedGame && lastTurn.moves === state.moves ? lastTurn.cells : [], badukPreview = badukState && badukScoring && scoringSeat ? badukPreviewFor(badukState, scoringSeat) : null;
  const rematch = rematchProgress(state as GameState & RematchState, roomRematchMembers(room), selfId);
  const voteTimer = voteTimerPresentation(state, clock);
  return <main class="app-shell">
    <header class="topbar"><button class="brand" onClick={showTitle}>Nollawa party games</button><span class="build-hash" aria-label={`빌드 ${__BUILD_HASH__}`}>빌드 {__BUILD_HASH__}</span></header>
    {screen === 'name' && <section class="panel narrow" aria-labelledby="name-title"><p class="eyebrow">친구와 즐기는 파티게임</p><h1 id="name-title">이름을 알려 주세요</h1><label>표시 이름<input value={name} maxLength={16} autoComplete="nickname" onInput={(event) => setName(event.currentTarget.value)} /></label><button class="primary" disabled={!name.trim()} onClick={() => setScreen('room')}>계속</button></section>}
    {screen === 'room' && <section class="panel" aria-labelledby="room-title"><p class="eyebrow">반가워요, {name}</p><h1 id="room-title">어디서 플레이할까요?</h1><div class="choice-grid">
      <button class="choice" onClick={chooseLocal}><strong>{MAIN_DESTINATIONS[0][0]}</strong><span>한 화면을 번갈아 사용해요</span></button>
      <div class="choice join-box"><strong>{MAIN_DESTINATIONS[1][0]}</strong><label>방 코드<input value={roomInput} placeholder="ABC-67" autoCapitalize="characters" onInput={(event) => setRoomInput(event.currentTarget.value)} /></label><button onClick={joinRoom}>입장</button></div>
      <button class="choice" disabled={creatingRoom} onClick={() => void createRoom()}><strong>{creatingRoom ? '빈 방 확인 중' : MAIN_DESTINATIONS[2][0]}</strong><span>새 코드를 친구에게 알려 주세요</span></button>
    </div>{roomError && <p class="error" role="alert">{roomError}</p>}</section>}
    {screen === 'lobby' && room && <RoomLobby room={room} selfId={selfId} send={sendRoom} openGames={() => setScreen('games')} />}
    {screen === 'lobby' && !room && <section class="panel"><h1>{roomCode}</h1><p>{connection}</p></section>}
    {screen === 'games' && <section class="panel" aria-labelledby="games-title"><p class="eyebrow">{mode === 'remote' ? `방 ${roomCode}` : '이 기기'}</p><h1 id="games-title">게임을 골라 주세요</h1>{mode === 'remote' && <button onClick={() => { sendRoom({ command: 'set-activity', activity: 'lobby' }); setScreen('lobby'); }}>방 로비</button>}<label>게임 검색<input type="search" value={query} onInput={(event) => setQuery(event.currentTarget.value)} /></label><div class="filters" aria-label="게임 필터"><div>{(['all', '1', '2', '3-4'] as const).map((value) => <button key={value} class={peopleFilter === value ? 'selected' : ''} aria-pressed={peopleFilter === value} onClick={() => setPeopleFilter(value)}>{value === 'all' ? '전체' : `${value}인`}</button>)}</div><div>{['봇 있음', '대전', '5분 이내'].map((tag) => <button key={tag} class={tagFilters.includes(tag) ? 'selected' : ''} aria-pressed={tagFilters.includes(tag)} onClick={() => setTagFilters((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag])}>{tag}</button>)}</div></div><div class="game-list">
      {visibleGames.map((game) => <article class="game-card" key={game.name}><div><h2>{game.name}</h2><p class="people">{game.people} · {game.time}</p><div class="tags">{game.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>{mode !== 'remote' && hasBoardSize(game.id) && <label>판 크기<select value={boardSizesFor(game.id).includes(boardSize) ? boardSize : 13} onChange={(event) => setBoardSize(Number(event.currentTarget.value) as BoardSize)}>{boardSizesFor(game.id).map((size) => <option value={size} key={size}>{size}×{size}</option>)}</select></label>}{mode !== 'remote' && game.id === 'yacht' && <label>참가자 수<select value={yachtPlayers} onChange={(event) => setYachtPlayers(Number(event.currentTarget.value))}>{[1, 2, 3, 4].map((count) => <option value={count} key={count}>{count}명</option>)}</select></label>}{mode !== 'remote' && game.id === 'fleet-variant' && <label>참가자 수<select value={variantPlayers} onChange={(event) => setVariantPlayers(Number(event.currentTarget.value))}>{[2, 3, 4, 5, 6].map((count) => <option value={count} key={count}>{count}명</option>)}</select></label>}</div><div class="game-actions">
        {mode === 'remote' ? <button class="primary" disabled={!isHost} onClick={() => { sendRoom({ command: 'select-game', game: game.id }); if (!isAiGameId(game.id)) sendRoom({ command: 'set-ai-opponent', enabled: false }); if (isBoardGameId(game.id)) selectSharedGame(game.id, boardSizesFor(game.id).includes(room?.settings.boardSize ?? 13) ? room?.settings.boardSize ?? 13 : 13); setScreen('lobby'); }}>게임 선택</button> : game.id === 'yacht' ? <><button class="primary" onClick={startLocalYacht}>{yachtPlayers}명이 시작</button>{yachtEvents && <button onClick={() => setScreen('yacht')}>저장된 경기 열기</button>}</> : game.id === 'fleet' ? <button class="primary" onClick={startLocalFleet}>두 사람이 시작</button> : game.id === 'fleet-variant' ? <button class="primary" onClick={startLocalVariantFleet}>{variantPlayers}명이 시작</button> : <button class="primary" onClick={() => void startLocal(mode, game.id, boardSizesFor(game.id).includes(boardSize) ? boardSize : 13)}>두 사람이 시작</button>}
        {isAiGameId(game.id) && <>{mode === 'local' && <button onClick={() => void startLocal('ai', game.id, boardSize)}>AI와 시작</button>}</>}
      </div></article>)}
      <article class="game-card effects-entry"><div><h2>연출 테스트</h2><p class="people">동전 · 주사위 · 덱 섞기</p><div class="tags"><span>E1–E5</span></div></div><div class="game-actions"><button class="primary" onClick={() => setScreen('effects')}>테스트 열기</button></div></article>
    </div></section>}
    {screen === 'effects' && <EffectsTestPage onBack={() => setScreen('games')} />}
    {screen === 'opening' && openingChoice && <section class="first-player-choice" aria-labelledby="opening-choice-title"><div class="first-player-choice-card"><h1 id="opening-choice-title">선공을 골라 주세요</h1><div>{firstPlayerChoiceLabels(openingChoice.game).map((label, index) => <button class="primary" key={label} disabled={openingChoice.shared && !authority} onClick={() => chooseFirstPlayer((index + 1) as Seat)}>{label}</button>)}</div>{openingChoice.shared && !authority && <p>방장이 선공을 고르는 중입니다.</p>}</div></section>}
    {screen === 'opening' && opening && <section class={`panel narrow opening-coin${openingDestination.current === 'yacht' ? ` opening-result${openingFading ? ' opening-fade' : ''}` : ''}`} aria-labelledby="opening-title"><p class="eyebrow">{connection}</p><h1 id="opening-title">선공 결정</h1><CoinResults outcomes={opening.outcomes} replayKey={opening.replayKey} /><p>{opening.firstPlayer}번이 먼저 시작합니다</p></section>}
    {screen === 'opening' && yachtOpening && <section class={`panel opening-coin opening-result${openingFading ? ' opening-fade' : ''}`} aria-labelledby="yacht-opening-title"><p class="eyebrow">참가자마다 주사위 한 개</p><h1 id="yacht-opening-title">차례 순서 결정</h1>{yachtOpening.rounds.map((round, index) => <div key={index}><p>{index + 1}차 · 동점 참가자만 다시 굴림</p><DiceResults outcomes={Object.values(round)} replayKey={yachtOpening.replayKey + index} /></div>)}<p>{yachtOpening.order.map(({ name }) => name).join(' → ')}</p></section>}
    {screen === 'yacht' && yachtEvents && <YachtGameRoute events={yachtEvents} mode={mode} selfId={selfId} sheetOpen={yachtSheetOpen} onSheetOpenChange={setYachtSheetOpen} onAction={actYacht} onUndo={undoYacht} onExit={() => { setYachtSheetOpen(false); mode === 'remote' ? returnToLobby(sendRoom) : setScreen('games'); }} />}
    {screen === 'fleet' && fleetState && <FleetGame state={fleetState} viewerId={mode === 'remote' ? selfId : fleetActorId(fleetState) ?? fleetState.winnerId} onAction={(action) => mode === 'remote' ? send({ type: 'action', action }) : setFleetState((current) => current ? reduceFleet(current, fleetActorId(current) ?? '', action) : current)} onExit={() => mode === 'remote' ? returnToLobby(sendRoom) : setScreen('games')} />}
    {screen === 'play' && <section class="play-layout" aria-labelledby="play-title"><div class="game-status"><div><p class="eyebrow">{connection}</p><h1 id="play-title">{outcome}</h1><div class="play-status-slot" role="status" aria-live="polite"><p class={`${seatStatus ? `seat-badge ${localSeat ? `player-${localSeat}` : ''}` : restartNotice ? 'restart-notice' : ''}`} aria-hidden={!playStatus}>{playStatus || '\u00a0'}</p></div></div>{mode === 'remote' ? <div><button onClick={() => returnToLobby(sendRoom)}>로비로 돌아가기</button><button onClick={showTitle}>타이틀로 나가기</button></div> : <button onClick={() => setScreen('games')}>게임 목록</button>}</div>
      <BoardGame game={selectedGame} state={state} selfId={mode === 'remote' ? selfId : null} seat={localSeat} scoringSeat={badukScoring ? scoringSeat : null} rouletteMove={rouletteMove} preview={confirmedPreview?.move ?? null} lastTurn={lastTurnCells} disabled={boardDisabled} onSelect={(move) => setPreview(createMovePreview(selectedGame, state, move))} onDeadToggle={(move) => { if (scoringSeat) actBaduk({ type: 'toggle-dead', ...move }, scoringSeat); }} />
      {!badukScoring && <button class="primary confirm-move" disabled={!confirmedPreview} onClick={() => { if (!confirmedPreview) return; send({ type: 'action', action: confirmedActionFor(mode, selectedGame, confirmedPreview.move) }); setPreview(null); }}>확인</button>}
      {badukState?.phase === 'play' && <button class="baduk-pass" disabled={mode === 'remote' && localSeat !== badukState.turn} onClick={() => actBaduk({ type: 'pass' }, badukState.turn)}>쉼</button>}
      {badukScoring && scoringSeat && badukPreview && <section class="baduk-scoring" aria-label="바둑 종국 합의"><div class="baduk-score-seats">{mode === 'local' ? ([1, 2] as const).map((seat) => <button class={localScoringSeat === seat ? 'selected' : ''} aria-pressed={localScoringSeat === seat} onClick={() => setLocalScoringSeat(seat)}>{badukColorForSeat(badukState, seat)} 계가</button>) : <strong>내 계가 · {badukColorForSeat(badukState, scoringSeat)}</strong>}</div><p>미리보기 · 흑 {badukPreview.black}집 / 백 {badukPreview.white}집 (덤 6.5) · 공배 {badukPreview.neutral}</p><p>잡은 돌 · 흑 {badukPreview.prisoners[badukState.starter]} / 백 {badukPreview.prisoners[badukState.starter === 1 ? 2 : 1]}</p><button class="primary" disabled={Boolean(badukState.submissions[scoringSeat])} onClick={() => actBaduk({ type: 'submit-score' }, scoringSeat)}>{badukState.submissions[scoringSeat] ? '제출됨' : '죽은 돌 제출'}</button></section>}
      {badukScoring && <p class="baduk-scoring-hint">죽은 돌 덩어리를 탭해 표시한 뒤 양쪽이 제출하세요.</p>}{!badukScoring && <p class="hint">자리를 선택한 뒤 확인하세요. 키보드는 Enter 또는 Space를 씁니다. ● 흑돌 · ■ 백돌</p>}{terminalGame(selectedGame, state).ended && <div class="rematch"><div>{mode === 'remote' && room && <><p>{rematch.ready}/{rematch.total} 다음 판 준비</p><p>아직: {rematch.pendingNames.join(', ')}</p></>}</div><button class="primary restart" disabled={mode === 'remote' && (localSeat === null || rematch.selfReady)} onClick={() => send({ type: 'action', action: restartAction() })}>다음 판</button></div>}</section>}
    {screen === 'play' && voteTimer.visible && <Vignette intensity={voteTimer.intensity} periodMs={voteTimer.periodMs} />}
    {screen === 'play' && <Countdown remaining={voteTimer.remaining} visible={voteTimer.visible} />}
    <UpdateBanner />
  </main>;
}
function UpdateBanner() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!refreshing) { refreshing = true; location.reload(); } });
    void navigator.serviceWorker.register('./sw.js').then((value) => {
      if (value.waiting) setRegistration(value);
      value.addEventListener('updatefound', () => value.installing?.addEventListener('statechange', () => { if (value.waiting && navigator.serviceWorker.controller) setRegistration(value); }));
    });
  }, []);
  if (!registration) return null;
  return <aside class="update-banner" role="status"><span>새 버전을 받을 수 있습니다.</span><button onClick={() => registration.waiting?.postMessage({ type: 'ACTIVATE_UPDATE' })}>확인 후 업데이트</button></aside>;
}

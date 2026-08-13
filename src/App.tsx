import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { requestGameMove } from './ai/game-client';
import { BoardGame } from './components/BoardGame';
import { Countdown, Vignette } from './components/TableEffects';
import { reduceRematchConsent, reduceSharedRematch, rematchProgress, type RematchMember, type RematchState } from './game/rematch-consent';
import { actionForMove, GAME_CATALOG, gameId, initGame, reduceGame, restartAction, terminalGame, type GameAction, type GameId, type GameState } from './game/catalog';
import { samok, type SamokAction, type SamokState, type Seat } from './game/samok';
import { authorityResolvedVoteDeadline, authorityVoteDeadline, commitResolvedTeamVote, reduceAuthorityVote, roulettePlan, settleTeamVote, type VoteMember } from './game/team-vote';
import { normalizeRoomCode, requestReservation, reserveRoomCode } from './lobby/room-code';
import { RoomLobby } from './lobby/RoomLobby';
import { isRoomHost, MAIN_DESTINATIONS, reuseRemoteTransport, roomScreen, teamForSlot, type RoomCommand, type RoomSnapshot } from './lobby/room-state';
import { deviceReconnectKey, LoopbackTransport, WebSocketTransport, type Transport } from './transport/transport';
type Screen = 'name' | 'room' | 'lobby' | 'games' | 'play';
type PlayMode = 'local' | 'ai' | 'remote';
interface ActionActor { id: string; seat: Seat | null }
interface AcceptedActionSource { actor: ActionActor; action: GameAction }
type GameMessage =
  | { type: 'action'; action: GameAction; actor?: ActionActor }
  | { type: 'snapshot'; state: GameState; source?: AcceptedActionSource }
  | { type: 'identity'; id: string; authority: string; seat: Seat | null }
  | { type: 'authority'; authority: string | null }
  | { type: 'room'; room: RoomSnapshot }
  | ({ type: 'room-command' } & RoomCommand)
  | { type: 'room-error'; message: string };
export type PeopleFilter = 'all' | '1' | '2' | '3-4';
export function filterGames(query: string, people: PeopleFilter, tags: readonly string[]) { const needle = query.trim().toLowerCase(); return GAME_CATALOG.filter((game) => (people === 'all' || game.people.startsWith(people)) && tags.every((tag) => game.tags.includes(tag as never)) && `${game.name} ${game.tags.join(' ')}`.toLowerCase().includes(needle)); }
export function restartNoticeFor(state: SamokState, source: AcceptedActionSource | undefined, clientId: string | null, seat: Seat | null): string {
  return source?.action.type === 'restart' && !samok.terminal(state).ended && state.moves === 0 && seat !== null && source.actor.id !== clientId ? '상대가 새 판을 시작했습니다' : '';
}
export const identitySeat = (message: Extract<GameMessage, { type: 'identity' }>): Seat | null => message.seat;
export const remoteSeatLabel = (seat: Seat | null): string => seat ? `내 팀 ${seat}` : '관전 중 · 좌석 없음';
export const remoteBoardDisabled = (state: SamokState, seat: Seat | null): boolean => samok.terminal(state).ended || seat !== state.turn;
export const roomVoteMembers = (room: RoomSnapshot | null, turn: Seat): VoteMember[] => room?.participants.filter((person) => room.settings.aiOpponent ? turn === 1 : teamForSlot(person.slot) === turn).map((person) => ({ id: person.id, team: turn })) ?? [];
export const roomRematchMembers = (room: RoomSnapshot | null): RematchMember[] => room?.participants.map(({ id, name }) => ({ id, name })) ?? [];
export const remoteRematchPresentation = (state: SamokState, room: RoomSnapshot | null, selfId: string | null) => rematchProgress(state, roomRematchMembers(room), selfId);
export const applyAuthorityRematch = (state: SamokState, actor: ActionActor | undefined, room: RoomSnapshot | null, authority: boolean): SamokState => authority && actor ? reduceRematchConsent(state, actor.id, roomRematchMembers(room)) : state;
export const shouldRequestAiMove = (mode: PlayMode, room: RoomSnapshot | null, authority: boolean): boolean => mode === 'ai' || (mode === 'remote' && room?.settings.aiOpponent === true && authority);
export const applyAuthorityAiMove = (state: SamokState, column: number, authority: boolean): SamokState => authority ? samok.reduce(state, { type: 'drop', column }) : state;
export const applyAuthorityGameAction = (game: GameId, state: GameState, action: GameAction, actor: ActionActor | undefined, authority: boolean): GameState => authority && actor && (action.type === 'restart' || actor.seat === state.turn) ? reduceGame(game, state, action) : state;
export const applyAuthorityGameRematch = (game: GameId, state: GameState, actor: ActionActor | undefined, room: RoomSnapshot | null, authority: boolean): GameState => authority && actor ? reduceSharedRematch(state as GameState & RematchState, actor.id, roomRematchMembers(room), terminalGame(game, state).ended, (current) => reduceGame(game, current, restartAction()) as GameState & RematchState) : state;
export const AI_MOVE_DELAY_MS = 1_000;
export function voteTimerPresentation(state: SamokState, now: number) {
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
export function waitForAiMoveGate(startedAt: number, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted) { resolve(false); return; }
    const timer = globalThis.setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve(true); }, Math.max(0, startedAt + AI_MOVE_DELAY_MS - Date.now()));
    const cancel = () => { globalThis.clearTimeout(timer); resolve(false); };
    signal?.addEventListener('abort', cancel, { once: true });
  });
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
  const [selectedGame, setSelectedGame] = useState<GameId>('samok');
  const [state, setState] = useState<GameState>(() => samok.init());
  const [connection, setConnection] = useState('준비');
  const [localSeat, setLocalSeat] = useState<Seat | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [authority, setAuthority] = useState(false);
  const [rouletteColumn, setRouletteColumn] = useState<number | null>(null);
  const [restartNotice, setRestartNotice] = useState('');
  const [clock, setClock] = useState(() => Date.now());
  const transportRef = useRef<Transport<GameMessage> | null>(null);
  const clientId = useRef<string | null>(null);
  const localSeatRef = useRef<Seat | null>(null);
  const roomRef = useRef<RoomSnapshot | null>(null);
  const selectedGameRef = useRef<GameId>('samok');
  const isAuthority = useRef(false);
  const aiThinking = useRef(false);
  const aiRequest = useRef(0);
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
        const enteringPlay = roomRef.current?.phase !== 'play' && message.room.phase === 'play';
        roomRef.current = message.room;
        setRoom(message.room);
        const nextGame = gameId(message.room.game); if (selectedGameRef.current !== nextGame || enteringPlay) { selectedGameRef.current = nextGame; setSelectedGame(nextGame); setState(initGame(nextGame)); }
        setScreen(roomScreen(message.room, clientId.current));
      }
      if (message.type === 'room-error') setConnection(message.message);
      if (message.type === 'action') setState((current) => {
        let next = current;
        const game = selectedGameRef.current;
        if (nextMode !== 'remote') next = reduceGame(game, current, message.action);
        else if (game === 'samok' && isAuthority.current && message.action.type === 'vote' && message.actor) next = reduceAuthorityVote(current as SamokState, message.action.column, message.actor, roomVoteMembers(roomRef.current, current.turn), true, Date.now(), Math.random);
        else if (game === 'samok' && isAuthority.current && message.action.type === 'restart') next = applyAuthorityRematch(current as SamokState, message.actor, roomRef.current, true);
        else if (game !== 'samok' && message.action.type === 'restart') next = applyAuthorityGameRematch(game, current, message.actor, roomRef.current, isAuthority.current);
        else if (game !== 'samok') next = applyAuthorityGameAction(game, current, message.action, message.actor, isAuthority.current);
        if (nextMode === 'remote' && isAuthority.current && next !== current) {
          const source = message.actor ? { actor: message.actor, action: message.action } : undefined;
          queueMicrotask(() => transport.send({ type: 'snapshot', state: next, source }));
        }
        return next;
      });
      if (message.type === 'snapshot') {
        setRestartNotice(selectedGameRef.current === 'samok' ? restartNoticeFor(message.state as SamokState, message.source as AcceptedActionSource & { action: SamokAction }, clientId.current, localSeatRef.current) : '');
        setState(message.state);
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
  async function startLocal(nextMode: PlayMode, game: GameId) {
    closeTransport();
    const transport: Transport<GameMessage> = new LoopbackTransport();
    bindTransport(transport, nextMode);
    transportRef.current = transport;
    setMode(nextMode);
    selectedGameRef.current = game;
    setSelectedGame(game);
    setState(initGame(game));
    setLocalSeat(null);
    setRestartNotice('');
    setScreen('play');
    await transport.connect();
    setConnection('이 기기 연결');
  }
  function send(message: GameMessage) {
    try { transportRef.current?.send(message); }
    catch (error) { setConnection(error instanceof Error ? error.message : '전송 실패'); }
  }
  const sendRoom = (command: RoomCommand) => send({ type: 'room-command', ...command });
  useEffect(() => {
    if (screen !== 'play' || !shouldRequestAiMove(mode, room, authority) || state.turn !== 2 || terminalGame(selectedGame, state).ended || aiThinking.current) return;
    const requestId = ++aiRequest.current;
    const controller = new AbortController();
    const startedAt = Date.now();
    aiThinking.current = true;
    void Promise.all([requestGameMove(selectedGame, state, 1_000), waitForAiMoveGate(startedAt, controller.signal)]).then(([move, current]) => {
      if (!current || requestId !== aiRequest.current) return;
      if (move !== null && mode === 'remote') setState((current) => {
        const next = isAuthority.current ? reduceGame(selectedGame, current, actionForMove(selectedGame, move)) : current;
        if (next !== current) queueMicrotask(() => send({ type: 'snapshot', state: next }));
        return next;
      });
      else if (move !== null) send({ type: 'action', action: actionForMove(selectedGame, move) });
    }).finally(() => { if (requestId === aiRequest.current) aiThinking.current = false; });
    return () => { aiRequest.current += 1; controller.abort(); aiThinking.current = false; };
  }, [authority, mode, room, screen, selectedGame, state]);
  useEffect(() => {
    if (selectedGame !== 'samok' || mode !== 'remote' || screen !== 'play' || !authority) return;
    const samokState = state as SamokState, deadlines = [authorityVoteDeadline(samokState, authority), authorityResolvedVoteDeadline(samokState, authority)].filter((value): value is number => value !== null);
    if (!deadlines.length) return;
    const deadline = Math.min(...deadlines);
    const timer = window.setTimeout(() => setState((current) => {
      if (!isAuthority.current) return current;
      const settled = settleTeamVote(current as SamokState, roomVoteMembers(roomRef.current, current.turn), Date.now(), Math.random);
      const next = commitResolvedTeamVote(settled, Date.now());
      if (next !== current) queueMicrotask(() => send({ type: 'snapshot', state: next }));
      return next;
    }), Math.max(0, deadline - Date.now()));
    return () => window.clearTimeout(timer);
  }, [authority, mode, room, screen, selectedGame, state]);
  useEffect(() => {
    const samokState = state as SamokState; if (selectedGame !== 'samok' || mode !== 'remote' || screen !== 'play' || !samokState.vote || samokState.vote.effectsSuppressed) return;
    const update = () => setClock(Date.now());
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [mode, screen, selectedGame, (state as SamokState).vote?.deadline, (state as SamokState).vote?.effectsSuppressed]);
  useEffect(() => {
    const samokState = state as SamokState, plan = selectedGame === 'samok' ? roulettePlan(samokState.resolvedVote) : [];
    if (!plan.length) { setRouletteColumn(null); return; }
    const age = Math.max(0, Date.now() - samokState.resolvedVote!.settledAt);
    let elapsed = 0;
    const timers: number[] = [];
    for (const step of plan) {
      if (age >= elapsed) setRouletteColumn(step.column);
      else timers.push(window.setTimeout(() => setRouletteColumn(step.column), elapsed - age));
      elapsed += step.dwellMs;
    }
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [selectedGame, (state as SamokState).resolvedVote]);
  useEffect(() => () => transportRef.current?.close(), []);
  const outcome = state.winner ? `${state.winner}번 승리` : state.draw ? '무승부' : `${state.turn}번 차례`;
  const rematch = rematchProgress(state as GameState & RematchState, roomRematchMembers(room), selfId);
  const voteTimer = selectedGame === 'samok' ? voteTimerPresentation(state as SamokState, clock) : { remaining: 0, visible: false, intensity: 0, periodMs: 1_000 };
  return <main class="app-shell">
    <header class="topbar"><button class="brand" onClick={() => { closeTransport(); setScreen('name'); }}>Nollawa party games</button><span class="build-hash" aria-label={`빌드 ${__BUILD_HASH__}`}>빌드 {__BUILD_HASH__}</span></header>
    {screen === 'name' && <section class="panel narrow" aria-labelledby="name-title"><p class="eyebrow">네 줄을 먼저 이어 보세요</p><h1 id="name-title">이름을 알려 주세요</h1><label>표시 이름<input value={name} maxLength={16} autoComplete="nickname" onInput={(event) => setName(event.currentTarget.value)} /></label><button class="primary" disabled={!name.trim()} onClick={() => setScreen('room')}>계속</button></section>}
    {screen === 'room' && <section class="panel" aria-labelledby="room-title"><p class="eyebrow">반가워요, {name}</p><h1 id="room-title">어디서 플레이할까요?</h1><div class="choice-grid">
      <button class="choice" onClick={chooseLocal}><strong>{MAIN_DESTINATIONS[0][0]}</strong><span>한 화면을 번갈아 사용해요</span></button>
      <div class="choice join-box"><strong>{MAIN_DESTINATIONS[1][0]}</strong><label>방 코드<input value={roomInput} placeholder="ABC-67" autoCapitalize="characters" onInput={(event) => setRoomInput(event.currentTarget.value)} /></label><button onClick={joinRoom}>입장</button></div>
      <button class="choice" disabled={creatingRoom} onClick={() => void createRoom()}><strong>{creatingRoom ? '빈 방 확인 중' : MAIN_DESTINATIONS[2][0]}</strong><span>새 코드를 친구에게 알려 주세요</span></button>
    </div>{roomError && <p class="error" role="alert">{roomError}</p>}</section>}
    {screen === 'lobby' && room && <RoomLobby room={room} selfId={selfId} send={sendRoom} openGames={() => setScreen('games')} />}
    {screen === 'lobby' && !room && <section class="panel"><h1>{roomCode}</h1><p>{connection}</p></section>}
    {screen === 'games' && <section class="panel" aria-labelledby="games-title"><p class="eyebrow">{mode === 'remote' ? `방 ${roomCode}` : '이 기기'}</p><h1 id="games-title">게임을 골라 주세요</h1>{mode === 'remote' && <button onClick={() => setScreen('lobby')}>방 로비</button>}<label>게임 검색<input type="search" value={query} onInput={(event) => setQuery(event.currentTarget.value)} /></label><div class="filters" aria-label="게임 필터"><div>{(['all', '1', '2', '3-4'] as const).map((value) => <button key={value} class={peopleFilter === value ? 'selected' : ''} aria-pressed={peopleFilter === value} onClick={() => setPeopleFilter(value)}>{value === 'all' ? '전체' : `${value}인`}</button>)}</div><div>{['봇 있음', '대전', '5분 이내'].map((tag) => <button key={tag} class={tagFilters.includes(tag) ? 'selected' : ''} aria-pressed={tagFilters.includes(tag)} onClick={() => setTagFilters((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag])}>{tag}</button>)}</div></div><div class="game-list">
      {visibleGames.map((game) => <article class="game-card" key={game.name}><div><h2>{game.name}</h2><p class="people">{game.people} · {game.time}</p><div class="tags">{game.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div><div class="game-actions">
        {mode === 'remote' ? <button class="primary" disabled={!isHost} onClick={() => { sendRoom({ command: 'select-game', game: game.id }); setScreen('lobby'); }}>게임 선택</button> : <button class="primary" onClick={() => void startLocal(mode, game.id)}>두 사람이 시작</button>}
        {mode === 'local' && <button onClick={() => void startLocal('ai', game.id)}>AI와 시작</button>}
      </div></article>)}
    </div></section>}
    {screen === 'play' && <section class="play-layout" aria-labelledby="play-title"><div class="game-status"><div><p class="eyebrow">{connection}</p><h1 id="play-title">{outcome}</h1>{mode === 'remote' && <p class={`seat-badge ${localSeat ? `player-${localSeat}` : ''}`}>{remoteSeatLabel(localSeat)}</p>}{restartNotice && <p class="restart-notice" role="status">{restartNotice}</p>}</div>{mode === 'remote' ? <div><button onClick={() => returnToLobby(sendRoom)}>로비로 돌아가기</button><button onClick={() => leaveForTitle(sendRoom, closeTransport, () => setScreen('name'))}>타이틀로 나가기</button></div> : <button onClick={() => setScreen('games')}>게임 목록</button>}</div><BoardGame game={selectedGame} state={state} selfId={mode === 'remote' ? selfId : null} seat={localSeat} rouletteColumn={rouletteColumn} disabled={(mode === 'remote' && (terminalGame(selectedGame, state).ended || localSeat !== state.turn)) || (mode !== 'remote' && (terminalGame(selectedGame, state).ended || (mode === 'ai' && state.turn === 2)))} onMove={(move) => send({ type: 'action', action: selectedGame === 'samok' && mode === 'remote' ? { type: 'vote', column: move as number } : actionForMove(selectedGame, move) })} />{selectedGame === 'omok' && 'swapAvailable' in state && state.swapAvailable && <button onClick={() => send({ type: 'action', action: { type: 'swap' } })}>돌 바꾸기</button>}<p class="hint">판을 누르거나 키보드로 선택하세요. ● 1번 · ■ 2번</p>{terminalGame(selectedGame, state).ended && <div class="rematch"><div>{mode === 'remote' && room && <><p>{rematch.ready}/{rematch.total} 다음 판 준비</p><p>아직: {rematch.pendingNames.join(', ')}</p></>}</div><button class="primary restart" disabled={mode === 'remote' && (localSeat === null || rematch.selfReady)} onClick={() => send({ type: 'action', action: restartAction() })}>다음 판</button></div>}</section>}
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

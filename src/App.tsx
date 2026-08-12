import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { requestSamokMove } from './ai/samok-client';
import { Board } from './components/Board';
import { applyRemoteAction, samok, type SamokAction, type SamokState, type Seat } from './game/samok';
import { authorityVoteDeadline, reduceAuthorityVote, roulettePlan, settleTeamVote, type VoteMember } from './game/team-vote';
import { normalizeRoomCode, reserveRoomCode } from './lobby/room-code';
import { RoomLobby } from './lobby/RoomLobby';
import { isRoomHost, MAIN_DESTINATIONS, reuseRemoteTransport, teamForSlot, type RoomCommand, type RoomSnapshot } from './lobby/room-state';
import { deviceReconnectKey, LoopbackTransport, WebSocketTransport, type Transport } from './transport/transport';

type Screen = 'name' | 'room' | 'lobby' | 'games' | 'play';
type PlayMode = 'local' | 'ai' | 'remote';
interface ActionActor { id: string; seat: Seat | null }
interface AcceptedActionSource { actor: ActionActor; action: SamokAction }
type GameMessage =
  | { type: 'action'; action: SamokAction; actor?: ActionActor }
  | { type: 'snapshot'; state: SamokState; source?: AcceptedActionSource }
  | { type: 'identity'; id: string; authority: string; seat: Seat | null }
  | { type: 'authority'; authority: string | null }
  | { type: 'room'; room: RoomSnapshot }
  | ({ type: 'room-command' } & RoomCommand)
  | { type: 'room-error'; message: string };
const GAMES = [{ id: 'samok', name: '사목', people: '2명', tags: ['공용', '멀티', 'AI'], capacity: 2 }];

export function restartNoticeFor(source: AcceptedActionSource | undefined, clientId: string | null, seat: Seat | null): string {
  return source?.action.type === 'restart' && seat !== null && source.actor.id !== clientId ? '상대가 새 판을 시작했습니다' : '';
}
export const identitySeat = (message: Extract<GameMessage, { type: 'identity' }>): Seat | null => message.seat;
export const remoteSeatLabel = (seat: Seat | null): string => seat ? `내 팀 ${seat}` : '관전 중 · 좌석 없음';
export const remoteBoardDisabled = (state: SamokState, seat: Seat | null): boolean => samok.terminal(state).ended || seat !== state.turn;
export const roomVoteMembers = (room: RoomSnapshot | null, turn: Seat): VoteMember[] => room?.participants.filter((person) => teamForSlot(person.slot) === turn).map((person) => ({ id: person.id, team: turn })) ?? [];

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
  const [mode, setMode] = useState<PlayMode>('local');
  const [state, setState] = useState(() => samok.init());
  const [connection, setConnection] = useState('준비');
  const [localSeat, setLocalSeat] = useState<Seat | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [authority, setAuthority] = useState(false);
  const [rouletteColumn, setRouletteColumn] = useState<number | null>(null);
  const [restartNotice, setRestartNotice] = useState('');
  const transportRef = useRef<Transport<GameMessage> | null>(null);
  const clientId = useRef<string | null>(null);
  const localSeatRef = useRef<Seat | null>(null);
  const roomRef = useRef<RoomSnapshot | null>(null);
  const isAuthority = useRef(false);
  const aiThinking = useRef(false);
  const visibleGames = useMemo(() => GAMES.filter((game) => `${game.name} ${game.people} ${game.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())), [query]);
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
        if (message.room.phase === 'play') setScreen('play');
      }
      if (message.type === 'room-error') setConnection(message.message);
      if (message.type === 'action') setState((current) => {
        let next = current;
        if (nextMode !== 'remote') next = samok.reduce(current, message.action);
        else if (isAuthority.current && message.action.type === 'vote' && message.actor) next = reduceAuthorityVote(current, message.action.column, message.actor, roomVoteMembers(roomRef.current, current.turn), true, Date.now(), Math.random);
        else if (isAuthority.current && message.action.type === 'restart') next = applyRemoteAction(current, message.action, message.actor?.seat ?? null);
        if (nextMode === 'remote' && isAuthority.current && next !== current) {
          const source = message.actor ? { actor: message.actor, action: message.action } : undefined;
          queueMicrotask(() => transport.send({ type: 'snapshot', state: next, source }));
        }
        return next;
      });
      if (message.type === 'snapshot') {
        setRestartNotice(restartNoticeFor(message.source, clientId.current, localSeatRef.current));
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
      const code = await reserveRoomCode(async (candidate) => {
        const response = await fetch(reservationUrl(candidate), { method: 'POST' });
        if (response.status === 409) return false;
        if (!response.ok) throw new Error('방 코드를 확인하지 못했습니다. 다시 시도해 주세요.');
        return true;
      });
      await enterRemote(code);
    } catch (error) { setRoomError(error instanceof Error ? error.message : '방을 만들지 못했습니다.'); }
    finally { setCreatingRoom(false); }
  }

  async function startLocal(nextMode: PlayMode) {
    closeTransport();
    const transport: Transport<GameMessage> = new LoopbackTransport();
    bindTransport(transport, nextMode);
    transportRef.current = transport;
    setMode(nextMode);
    setState(samok.init());
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
    if (screen !== 'play' || mode !== 'ai' || state.turn !== 2 || samok.terminal(state).ended || aiThinking.current) return;
    aiThinking.current = true;
    void requestSamokMove(state).then((column) => {
      if (column !== null) send({ type: 'action', action: { type: 'drop', column } });
      aiThinking.current = false;
    });
  }, [mode, screen, state]);
  useEffect(() => {
    if (mode !== 'remote' || screen !== 'play' || !authority) return;
    const deadline = authorityVoteDeadline(state, authority);
    if (deadline === null) return;
    const timer = window.setTimeout(() => setState((current) => {
      if (!isAuthority.current) return current;
      const next = settleTeamVote(current, roomVoteMembers(roomRef.current, current.turn), Date.now(), Math.random);
      if (next !== current) queueMicrotask(() => send({ type: 'snapshot', state: next }));
      return next;
    }), Math.max(0, deadline - Date.now()));
    return () => window.clearTimeout(timer);
  }, [authority, mode, room, screen, state]);
  useEffect(() => {
    const plan = roulettePlan(state.resolvedVote);
    if (!plan.length) { setRouletteColumn(null); return; }
    let elapsed = 0;
    const timers = plan.map((step) => {
      const timer = window.setTimeout(() => setRouletteColumn(step.column), elapsed);
      elapsed += step.dwellMs;
      return timer;
    });
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [state.resolvedVote]);
  useEffect(() => () => transportRef.current?.close(), []);

  const outcome = state.winner ? `${state.winner}번 승리` : state.draw ? '무승부' : `${state.turn}번 차례`;
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

    {screen === 'games' && <section class="panel" aria-labelledby="games-title"><p class="eyebrow">{mode === 'remote' ? `방 ${roomCode}` : '이 기기'}</p><h1 id="games-title">게임을 골라 주세요</h1>{mode === 'remote' && <button onClick={() => setScreen('lobby')}>방 로비</button>}<label>게임 검색<input type="search" value={query} onInput={(event) => setQuery(event.currentTarget.value)} /></label><div class="game-list">
      {visibleGames.map((game) => <article class="game-card" key={game.name}><div><h2>{game.name}</h2><p class="people">{game.people} 전용 · 최대 {game.capacity}명</p><div class="tags">{game.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div><div class="game-actions">
        {mode === 'remote' ? <button class="primary" disabled={!isHost} onClick={() => { sendRoom({ command: 'select-game', game: game.id }); setScreen('lobby'); }}>게임 선택</button> : <button class="primary" onClick={() => void startLocal(mode)}>두 사람이 시작</button>}
        {mode === 'local' && <button onClick={() => void startLocal('ai')}>AI와 시작</button>}
      </div></article>)}
    </div></section>}

    {screen === 'play' && <section class="play-layout" aria-labelledby="play-title"><div class="game-status"><div><p class="eyebrow">{connection}</p><h1 id="play-title">{outcome}</h1>{mode === 'remote' && <p class={`seat-badge ${localSeat ? `player-${localSeat}` : ''}`}>{remoteSeatLabel(localSeat)}</p>}{restartNotice && <p class="restart-notice" role="status">{restartNotice}</p>}</div><button onClick={() => setScreen(mode === 'remote' ? 'lobby' : 'games')}>{mode === 'remote' ? '방 로비' : '게임 목록'}</button></div><Board state={state} selfId={mode === 'remote' ? selfId : null} seat={localSeat} rouletteColumn={rouletteColumn} disabled={(mode === 'remote' && remoteBoardDisabled(state, localSeat)) || (mode !== 'remote' && (samok.terminal(state).ended || (mode === 'ai' && state.turn === 2)))} onDrop={(column) => send({ type: 'action', action: { type: mode === 'remote' ? 'vote' : 'drop', column } })} /><p class="hint">열을 누르거나 키보드로 선택하세요. ● 1번 · ■ 2번</p>{samok.terminal(state).ended && <button class="primary restart" disabled={mode === 'remote' && localSeat === null} onClick={() => send({ type: 'action', action: { type: 'restart' } })}>다시 시작</button>}</section>}
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

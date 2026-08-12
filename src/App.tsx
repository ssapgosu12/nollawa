import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { requestSamokMove } from './ai/samok-client';
import { Board } from './components/Board';
import { applyRemoteAction, samok, type SamokAction, type SamokState, type Seat } from './game/samok';
import { normalizeRoomCode, reserveRoomCode } from './lobby/room-code';
import { LoopbackTransport, WebSocketTransport, type Transport } from './transport/transport';

type Screen = 'name' | 'room' | 'games' | 'play';
type PlayMode = 'local' | 'ai' | 'remote';
interface ActionActor { id: string; seat: Seat | null }
interface AcceptedActionSource { actor: ActionActor; action: SamokAction }
type GameMessage =
  | { type: 'action'; action: SamokAction; actor?: ActionActor }
  | { type: 'snapshot'; state: SamokState; source?: AcceptedActionSource }
  | { type: 'identity'; id: string; authority: string; seat: Seat | null }
  | { type: 'authority'; authority: string | null };
const GAMES = [{ name: '사목', people: '2명', tags: ['공용', '멀티', 'AI'], capacity: 2 }];

export function restartNoticeFor(source: AcceptedActionSource | undefined, clientId: string | null, seat: Seat | null): string {
  return source?.action.type === 'restart' && seat !== null && source.actor.id !== clientId
    ? '상대가 새 판을 시작했습니다'
    : '';
}

function relayUrl(code: string): string {
  const base = import.meta.env.VITE_RELAY_URL ?? `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
  return `${base.replace(/\/$/, '')}/room/${code}`;
}

function reservationUrl(code: string): string {
  return relayUrl(code).replace(/^ws/, 'http');
}

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
  const [restartNotice, setRestartNotice] = useState('');
  const transportRef = useRef<Transport<GameMessage> | null>(null);
  const clientId = useRef<string | null>(null);
  const localSeatRef = useRef<Seat | null>(null);
  const isAuthority = useRef(false);
  const aiThinking = useRef(false);
  const visibleGames = useMemo(() => GAMES.filter((game) => (
    `${game.name} ${game.people} ${game.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())
  )), [query]);

  function chooseRoom(nextMode: PlayMode, code = '') {
    setMode(nextMode);
    setRoomCode(code);
    setRoomError('');
    setScreen('games');
  }

  function joinRoom() {
    const normalized = normalizeRoomCode(roomInput);
    if (!normalized) {
      setRoomError('영문 3자와 숫자 2자를 입력하세요. I, L, O는 쓰지 않습니다.');
      return;
    }
    chooseRoom('remote', normalized);
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
      chooseRoom('remote', code);
    } catch (error) {
      setRoomError(error instanceof Error ? error.message : '방을 만들지 못했습니다.');
    } finally {
      setCreatingRoom(false);
    }
  }

  async function startGame(nextMode: PlayMode) {
    transportRef.current?.close();
    const transport: Transport<GameMessage> = nextMode === 'remote'
      ? new WebSocketTransport(relayUrl(roomCode))
      : new LoopbackTransport();
    transport.onMessage((message) => {
      if (message.type === 'identity') {
        clientId.current = message.id;
        localSeatRef.current = message.seat;
        setLocalSeat(message.seat);
        isAuthority.current = message.id === message.authority;
      }
      if (message.type === 'authority') isAuthority.current = clientId.current === message.authority;
      if (message.type === 'action') setState((current) => {
        const next = nextMode === 'remote'
          ? applyRemoteAction(current, message.action, message.actor?.seat ?? null)
          : samok.reduce(current, message.action);
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
    transportRef.current = transport;
    clientId.current = null;
    localSeatRef.current = null;
    isAuthority.current = false;
    setMode(nextMode);
    setState(samok.init());
    setLocalSeat(null);
    setRestartNotice('');
    setScreen('play');
    setConnection('연결 중');
    try {
      await transport.connect();
      setConnection(nextMode === 'remote' ? `방 ${roomCode}` : '이 기기 연결');
    } catch (error) {
      setConnection(error instanceof Error ? error.message : '연결 실패');
    }
  }

  function sendDrop(column: number) {
    try {
      transportRef.current?.send({ type: 'action', action: { type: 'drop', column } });
    } catch (error) {
      setConnection(error instanceof Error ? error.message : '전송 실패');
    }
  }

  function sendRestart() {
    try {
      transportRef.current?.send({ type: 'action', action: { type: 'restart' } });
    } catch (error) {
      setConnection(error instanceof Error ? error.message : '전송 실패');
    }
  }

  useEffect(() => {
    if (screen !== 'play' || mode !== 'ai' || state.turn !== 2 || samok.terminal(state).ended || aiThinking.current) return;
    aiThinking.current = true;
    void requestSamokMove(state).then((column) => {
      if (column !== null) transportRef.current?.send({ type: 'action', action: { type: 'drop', column } });
      aiThinking.current = false;
    });
  }, [mode, screen, state]);

  useEffect(() => () => transportRef.current?.close(), []);

  const outcome = state.winner ? `${state.winner}번 승리` : state.draw ? '무승부' : `${state.turn}번 차례`;
  return (
    <main class="app-shell">
      <header class="topbar">
        <button class="brand" onClick={() => setScreen('name')}>Nollawa party games</button>
        <span class="build-hash" aria-label={`빌드 ${__BUILD_HASH__}`}>빌드 {__BUILD_HASH__}</span>
      </header>

      {screen === 'name' && <section class="panel narrow" aria-labelledby="name-title">
        <p class="eyebrow">네 줄을 먼저 이어 보세요</p>
        <h1 id="name-title">이름을 알려 주세요</h1>
        <label>표시 이름<input value={name} maxLength={16} autoComplete="nickname" onInput={(event) => setName(event.currentTarget.value)} /></label>
        <button class="primary" disabled={!name.trim()} onClick={() => setScreen('room')}>계속</button>
      </section>}

      {screen === 'room' && <section class="panel" aria-labelledby="room-title">
        <p class="eyebrow">반가워요, {name}</p><h1 id="room-title">어디서 플레이할까요?</h1>
        <div class="choice-grid">
          <button class="choice" disabled={creatingRoom} onClick={() => void createRoom()}><strong>{creatingRoom ? '빈 방 확인 중' : '방 만들기'}</strong><span>새 코드를 친구에게 알려 주세요</span></button>
          <div class="choice join-box"><strong>코드로 입장</strong><label>방 코드<input value={roomInput} placeholder="ABC-67" onInput={(event) => setRoomInput(event.currentTarget.value)} /></label><button onClick={joinRoom}>입장</button></div>
          <button class="choice" onClick={() => chooseRoom('local')}><strong>이 기기에서 플레이</strong><span>한 화면을 번갈아 사용해요</span></button>
        </div>
        {roomError && <p class="error" role="alert">{roomError}</p>}
      </section>}

      {screen === 'games' && <section class="panel" aria-labelledby="games-title">
        <p class="eyebrow">{mode === 'remote' ? `방 ${roomCode}` : '이 기기'}</p><h1 id="games-title">게임을 골라 주세요</h1>
        <label>게임 검색<input type="search" value={query} onInput={(event) => setQuery(event.currentTarget.value)} /></label>
        <div class="game-list">
          {visibleGames.map((game) => <article class="game-card" key={game.name}>
            <div><h2>{game.name}</h2><p class="people">{game.people} 전용 · 최대 {game.capacity}명</p><div class="tags">{game.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div>
            <div class="game-actions">
              <button class="primary" onClick={() => startGame(mode)}>{mode === 'remote' ? '방에서 시작' : '두 사람이 시작'}</button>
              {mode === 'local' && <button onClick={() => startGame('ai')}>AI와 시작</button>}
            </div>
          </article>)}
          {!visibleGames.length && <p>조건에 맞는 게임이 없습니다.</p>}
        </div>
      </section>}

      {screen === 'play' && <section class="play-layout" aria-labelledby="play-title">
        <div class="game-status"><div><p class="eyebrow">{connection}</p><h1 id="play-title">{outcome}</h1>{mode === 'remote' && <p class={`seat-badge ${localSeat ? `player-${localSeat}` : ''}`}>{localSeat ? `내 좌석 ${localSeat}번` : '관전 중 · 좌석 없음'}</p>}{restartNotice && <p class="restart-notice" role="status">{restartNotice}</p>}</div><button onClick={() => setScreen('games')}>게임 목록</button></div>
        <Board state={state} disabled={samok.terminal(state).ended || (mode === 'ai' && state.turn === 2) || (mode === 'remote' && localSeat !== state.turn)} onDrop={sendDrop} />
        <p class="hint">열을 누르거나 키보드로 선택하세요. ● 1번 · ■ 2번</p>
        {samok.terminal(state).ended && <button class="primary restart" disabled={mode === 'remote' && localSeat === null} onClick={sendRestart}>다시 시작</button>}
      </section>}
      <UpdateBanner />
    </main>
  );
}

function UpdateBanner() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        location.reload();
      }
    });
    void navigator.serviceWorker.register('./sw.js').then((value) => {
      if (value.waiting) setRegistration(value);
      value.addEventListener('updatefound', () => value.installing?.addEventListener('statechange', () => {
        if (value.waiting && navigator.serviceWorker.controller) setRegistration(value);
      }));
    });
  }, []);
  if (!registration) return null;
  return <aside class="update-banner" role="status"><span>새 버전을 받을 수 있습니다.</span><button onClick={() => registration.waiting?.postMessage({ type: 'ACTIVATE_UPDATE' })}>확인 후 업데이트</button></aside>;
}

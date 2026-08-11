import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { requestSamokMove } from './ai/samok-client';
import { Board } from './components/Board';
import { samok, type SamokAction, type SamokState } from './game/samok';
import { createRoomCode, normalizeRoomCode } from './lobby/room-code';
import { LoopbackTransport, WebSocketTransport, type Transport } from './transport/transport';

type Screen = 'name' | 'room' | 'games' | 'play';
type PlayMode = 'local' | 'ai' | 'remote';
type GameMessage =
  | { type: 'action'; action: SamokAction }
  | { type: 'snapshot'; state: SamokState }
  | { type: 'identity'; id: string; authority: string }
  | { type: 'authority'; authority: string | null };
const GAMES = [{ name: '사목', people: '2명', tags: ['공용', '멀티', 'AI'], capacity: 2 }];

function relayUrl(code: string): string {
  const base = import.meta.env.VITE_RELAY_URL ?? `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
  return `${base.replace(/\/$/, '')}/room/${code}`;
}

export function App() {
  const [screen, setScreen] = useState<Screen>('name');
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [roomInput, setRoomInput] = useState('');
  const [roomError, setRoomError] = useState('');
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<PlayMode>('local');
  const [state, setState] = useState(() => samok.init());
  const [connection, setConnection] = useState('준비');
  const transportRef = useRef<Transport<GameMessage> | null>(null);
  const clientId = useRef<string | null>(null);
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

  async function startGame(nextMode: PlayMode) {
    transportRef.current?.close();
    const transport: Transport<GameMessage> = nextMode === 'remote'
      ? new WebSocketTransport(relayUrl(roomCode))
      : new LoopbackTransport();
    transport.onMessage((message) => {
      if (message.type === 'identity') {
        clientId.current = message.id;
        isAuthority.current = message.id === message.authority;
      }
      if (message.type === 'authority') isAuthority.current = clientId.current === message.authority;
      if (message.type === 'action') setState((current) => {
        const next = samok.reduce(current, message.action);
        if (nextMode === 'remote' && isAuthority.current && next !== current) {
          queueMicrotask(() => transport.send({ type: 'snapshot', state: next }));
        }
        return next;
      });
      if (message.type === 'snapshot') setState(message.state);
    });
    transport.onPeerChange((count) => setConnection(`${count}명 연결`));
    transportRef.current = transport;
    setMode(nextMode);
    setState(samok.init());
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
        <button class="brand" onClick={() => setScreen('name')}>사목 놀이터</button>
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
          <button class="choice" onClick={() => chooseRoom('remote', createRoomCode())}><strong>방 만들기</strong><span>새 코드를 친구에게 알려 주세요</span></button>
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
        <div class="game-status"><div><p class="eyebrow">{connection}</p><h1 id="play-title">{outcome}</h1></div><button onClick={() => setScreen('games')}>게임 목록</button></div>
        <Board state={state} disabled={samok.terminal(state).ended || (mode === 'ai' && state.turn === 2)} onDrop={sendDrop} />
        <p class="hint">열을 누르거나 키보드로 선택하세요. ● 1번 · ■ 2번</p>
        {samok.terminal(state).ended && <button class="primary restart" onClick={() => setState(samok.init())}>다시 시작</button>}
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

import type { RoomCommand, RoomSnapshot } from './room-state';
import { isRoomHost, lobbyAction, participantStatusLabel, readyLabel, roomSlots, teamForSlot } from './room-state';
import { BOARD_SIZES, GAME_CATALOG, catalogGameId, hasBoardSize, type BoardSize } from '../game/catalog';
interface Props {
  room: RoomSnapshot;
  selfId: string | null;
  send: (command: RoomCommand) => void;
  openGames: () => void;
}
export function RoomLobby({ room, selfId, send, openGames }: Props) {
  const host = isRoomHost(room, selfId);
  const action = lobbyAction(room, selfId);
  const game = GAME_CATALOG.find(({ id }) => id === catalogGameId(room.game)) ?? GAME_CATALOG[0];
  const individual = game.id === 'yacht' || game.id === 'fleet' || game.id === 'fleet-variant';
  return <section class="room-lobby" aria-labelledby="room-code">
    <h1 id="room-code">{room.code}</h1>
    <article class="lobby-game"><div><h2>{game.name}{room.settings.aiOpponent && !individual ? ' (AI 대전)' : ''}</h2><p>{game.people} · {game.time} · {game.tags.map((tag) => `#${tag}`).join(' ')}</p></div>{!individual && <details class="game-settings"><summary aria-label="게임 설정">…</summary><div class="game-settings-popup"><label>AI 대전<input type="checkbox" checked={room.settings.aiOpponent} disabled={!host} onChange={(event) => { if (host) send({ command: 'set-ai-opponent', enabled: event.currentTarget.checked }); }} /></label><label>AI 강도<select value={room.settings.aiStrength ?? 'normal'} disabled={!host} onChange={(event) => { if (host) send({ command: 'set-ai-strength', strength: event.currentTarget.value as 'normal' | 'high' }); }}><option value="normal">보통</option><option value="high">높음</option></select></label>{hasBoardSize(room.game) && <label>판 크기<select value={room.settings.boardSize ?? 13} disabled={!host || room.phase !== 'lobby'} onChange={(event) => { if (host) send({ command: 'set-board-size', size: Number(event.currentTarget.value) as BoardSize }); }}>{BOARD_SIZES.map((size) => <option value={size} key={size}>{size}×{size}</option>)}</select></label>}</div></details>}</article>
    {room.settings.aiOpponent && !individual ? <p class="ai-opponent-banner">모두 함께 AI와 대전 중</p> : individual ? <p class="ai-opponent-banner">{game.id === 'yacht' ? '개인전 · 참가 순서는 시작 연출로 결정' : '개인전 · 참가 순서는 시작 순서입니다'}</p> : <div class="team-headings">
      {room.teamNames.map((team, index) => host
        ? <label key={index}>팀 {index + 1}<input value={team} maxLength={24} onChange={(event) => send({ command: 'team-name', team: index + 1 as 1 | 2, name: event.currentTarget.value })} /></label>
        : <strong key={team}>팀 {index + 1} · {team}</strong>)}
    </div>}
    <div class="participant-grid">
      {roomSlots(room).map((person, index) => <article class={`participant team-${room.settings.aiOpponent ? 1 : teamForSlot(index + 1)}`} key={index}>
        {person ? <>
          <strong>{person.id === room.hostId ? '♛ ' : ''}{person.name}</strong>
          <span>{participantStatusLabel(room, person)}</span>
          {host && <details><summary>…</summary><div class="participant-menu">
            <button onClick={() => send({ command: 'kick', target: person.id })}>추방</button>
            <button onClick={() => send({ command: 'promote', target: person.id })}>방장 위임</button>
            {roomSlots(room).map((_, slot) => <button key={slot} disabled={room.phase !== 'lobby' || slot + 1 === person.slot} onClick={() => send({ command: 'move', target: person.id, slot: slot + 1 })}>{slot + 1}번 슬롯</button>)}
          </div></details>}
        </> : <span>빈 자리</span>}
      </article>)}
    </div>
    <div class="lobby-actions">
      <button onClick={() => { send({ command: 'set-activity', activity: 'games' }); openGames(); }}>게임 변경</button>
      <button class={action.emphasized ? 'primary' : undefined} disabled={action.disabled} onClick={() => send({ command: action.command })}>{action.label}</button>
      <strong>{readyLabel(room)}</strong>
    </div>
  </section>;
}

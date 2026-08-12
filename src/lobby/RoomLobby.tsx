import type { RoomCommand, RoomSnapshot } from './room-state';
import { canStartRoom, isRoomHost, readyLabel, roomSlots, teamForSlot } from './room-state';
interface Props {
  room: RoomSnapshot;
  selfId: string | null;
  send: (command: RoomCommand) => void;
  openGames: () => void;
}
export function RoomLobby({ room, selfId, send, openGames }: Props) {
  const host = isRoomHost(room, selfId);
  return <section class="room-lobby" aria-labelledby="room-code">
    <h1 id="room-code">{room.code}</h1>
    <article class="lobby-game"><div><h2>{room.game === 'samok' ? '사목' : room.game}</h2><p>2명 · #대전 #동시진행</p></div></article>
    <div class="team-headings">
      {room.teamNames.map((team, index) => host
        ? <label key={index}>팀 {index + 1}<input value={team} maxLength={24} onChange={(event) => send({ command: 'team-name', team: index + 1 as 1 | 2, name: event.currentTarget.value })} /></label>
        : <strong key={team}>팀 {index + 1} · {team}</strong>)}
    </div>
    <div class="participant-grid">
      {roomSlots(room).map((person, index) => <article class={`participant team-${teamForSlot(index + 1)}`} key={index}>
        {person ? <>
          <strong>{person.id === room.hostId ? '♛ ' : ''}{person.name}</strong>
          <span>{person.ready ? '준비' : '대기'}{person.present ? '' : ' · 연결 끊김'}</span>
          {person.id === selfId && <button disabled={room.phase !== 'lobby'} onClick={() => send({ command: 'ready' })}>{person.ready ? '준비 취소' : '준비'}</button>}
          {host && <details><summary>…</summary><div class="participant-menu">
            <button onClick={() => send({ command: 'kick', target: person.id })}>추방</button>
            <button onClick={() => send({ command: 'promote', target: person.id })}>방장 위임</button>
            {roomSlots(room).map((_, slot) => <button key={slot} disabled={room.phase !== 'lobby' || slot + 1 === person.slot} onClick={() => send({ command: 'move', target: person.id, slot: slot + 1 })}>{slot + 1}번 슬롯</button>)}
          </div></details>}
        </> : <span>빈 자리</span>}
      </article>)}
    </div>
    <div class="lobby-actions">
      <button onClick={openGames}>게임 변경</button>
      <button class="primary" disabled={!host || !canStartRoom(room)} onClick={() => send({ command: 'start' })}>플레이 시작</button>
      <strong>{readyLabel(room)}</strong>
    </div>
  </section>;
}

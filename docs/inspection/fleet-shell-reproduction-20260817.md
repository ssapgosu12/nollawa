# B-28 · B-41 재현 기록 (2026-08-17)

M3-FLEET-SHELL 티켓의 재현 카드 산출물이다. 두 항목은 검수 보고서에서 **미재현**으로 표시돼 있어
수정이 아니라 재현부터 하도록 발행했고, 그 결과가 아래다. 도는 하네스는
`src/m3-fleet-shell.reproduction.test.tsx`에 있다.

## 결론 두 줄

- **B-28은 실재한다.** 원격 방에서 시작 알림이 새 판 스냅샷보다 먼저 도착하면, 화면은 새 게임으로
  들어가면서 판 상태는 직전 클래식 완료 상태를 그대로 들고 있어 **「1P 승리」가 잠깐 보인다.**
  호스트와 참가자 양쪽에서 재현됐고, 스냅샷이 도착하면 사라진다. 로컬 경로는 정상이다.
- **B-41은 결함이 아니다.** 함대 카탈로그가 2인 전용(`minPlayers:2, maxPlayers:2`)이라
  **3인 클래식 방은 시작 버튼 자체가 비활성**이다. 인위적으로 3인 상태를 만들면 표적 전환이 없는 것은
  맞지만 유효한 경로로는 도달할 수 없다. 입력 전수조사가 조건부로 남겨 둔 물음의 답이다.

---

M3-FLEET-SHELL-B reproduction record
baseline: 863c3a1e3c11587b0d5c3cbfaaf0ccf6786287f0
harness: artifacts/m3-fleet-shell/reproduction-harness.test.tsx

POPULATION: total=2 (B-28, B-41); GREEN=0; RED=1; NOT-SUPPORTED=1; NOT-YET=0; BLOCKED=0; UNKNOWN=0; uninspected=0.
Browser backend population: total=0; available=0; inspected=0; uninspected=0; verdict=NOT-SUPPORTED. The in-app Browser runtime returned no available backends, so no screenshot claim is made.
Physical-device verification channel: total=1; NOT-YET=1; completed=0; uninspected=1.

B-28
Hypothesis: if the remote room play notification is handled before the new fleet-variant snapshot, the shell enters the fleet screen while retaining the previous classic-complete FleetState, so FleetGame renders the classic result until the snapshot arrives.
Falsifier: under room-before-snapshot order, the first FleetGame render is already the fleet-variant setup screen rather than the prior classic completion.
Exact initial state: createFleetState([{id:p1,name:1P},{id:p2,name:2P}]); for each participant, place classic ship indices 0..4 horizontally at origin {row:shipIndex,column:0}; complete each placement; p1 fires at every one of p2's 17 ship cells while p2 fires at distinct empty p1 cells between turns. Observed terminal state was {mode:classic, phase:complete, winnerId:p1}, and dynamic FleetGame render contained "1P 승리".
Local action sequence: exit the completed classic route to the game list; invoke the local variant start behavior with p1,p2,p3; createVariantFleetState replaces the current fleet state before the fleet route renders.
Local observed state/render: {mode:variant, phase:setup}; FleetGame rendered aria-label "함대 격침 변형 설정" and visible "프리셋". The stale classic result did not appear.
Room host action sequence: retain the prior classic-complete client state; host selects fleet-variant, guest readies, host sends room-command start, then host sends the new fleet-variant snapshot. The real relay Room harness delivered [room,snapshot]. Handle room first by entering the fleet screen without replacing fleetState; then handle snapshot by replacing fleetState.
Room host observed state/render: after room={mode:classic, phase:complete}, visible "1P 승리"; after snapshot={mode:variant, phase:setup}, visible variant setup.
Room non-host action sequence: the same relay exchange was observed on the guest socket as [room,snapshot], then the same client event sequence was applied.
Room non-host observed state/render: after room={mode:classic, phase:complete}, visible "1P 승리"; after snapshot={mode:variant, phase:setup}, visible variant setup.
Counter-path: apply the fleet-variant snapshot before the room play notification. Observed first FleetGame render was the variant setup screen; no classic completion text appeared. The local flow is a second normal counter-path.
Verdict: RED. Reproduced dynamically for the actual remote relay order on both host and non-host. The visible stale interval ends when the following snapshot is handled. The user's exact original path and perceived duration remain UNKNOWN because no browser backend or physical device was available.

B-41
Hypothesis: the real room/catalog contract prevents a three-person classic game from starting, so the renderer's classic target-switch limitation is unreachable through a valid lobby action.
Falsifier: a three-person classic RoomSnapshot makes canStartRoom true and renders an enabled host "플레이 시작" action.
Exact initial state: room ABC-67, game=fleet, phase=lobby, aiOpponent=false, host p1, participants p1/p2/p3 in slots 1/2/3, all present and ready.
Action sequence: resolve the fleet catalog entry; call canStartRoom; derive lobbyAction for host p1; dynamically render RoomLobby and inspect the actual host start button state.
Observed state/render: fleet catalog={people:2인,minPlayers:2,maxPlayers:2}; canStartRoom=false; lobbyAction.disabled=true; rendered "플레이 시작" button disabled=true. There is no valid start action, so initial target and target switching cannot be exercised through the real three-person classic room path.
Counter-path A: the otherwise identical two-person classic room produced canStartRoom=true, lobbyAction.disabled=false, and rendered start button disabled=false.
Counter-path B: an artificial createFleetState(p1,p2,p3) was fully placed to phase=targeting and rendered for p1. It showed target 2P and had no "이전 플레이어 보드" or "다음 플레이어 보드" controls. This demonstrates the latent renderer behavior but is not a valid reproduction because that state is outside the real classic room contract.
Counter-path C: a real three-person fleet-variant state was advanced to targeting and rendered both previous and next player controls, proving the dynamic carousel harness can observe target switching when the contract permits three players.
Verdict: NOT-SUPPORTED. A three-person classic room is not startable through the real catalog/lobby contract; the exact blocking constraints are maxPlayers=2 and canStartRoom's participant-count-equals-2 requirement. The artificial three-person renderer observation is excluded from the reproduction verdict.

Harness observation command:
  .\node_modules\.bin\vitest.cmd run artifacts\m3-fleet-shell\reproduction-harness.test.tsx --reporter=verbose
Harness result: exit 0; Test Files 1 passed (1); Tests 2 passed (2).

Required command results:
  exit 0 ./node_modules/.bin/vitest run — Test Files 45 passed (45); Tests 396 passed (396).
  exit 0 npm run check:terms — Forbidden-term gate passed: 70 files, 30 terms.
  exit 0 npm run build — check:terms passed; tsc --noEmit passed; Vite transformed 40 modules and built dist.

Changed files intended for the evidence-only commit:
  artifacts/m3-fleet-shell/reproduction-harness.test.tsx
  artifacts/m3-fleet-shell/reproduction-b28-b41.txt

Product source changed: no.
Existing tests changed: no.
Docs, collab13, relay, or deployment state changed: no.

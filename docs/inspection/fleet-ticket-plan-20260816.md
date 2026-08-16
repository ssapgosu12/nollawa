# 함대 격침 33건 — 티켓 발행 계획

기준 커밋 `098507d` · 검수 보고서와 코드를 대조해 확정한 계획이다. 보고서 서술이 아니라 **실제 파일의 줄 밀도와 기존 테스트**가 이 계획의 형태를 결정했다.

---

## 0. 먼저 — 계획을 바꾼 실측 3가지

**(1) 배열은 33행이 아니라 37행이다.** `B-1`~`B-33` 33건 + `D-1`·`D-2`·`D-2.5`·`D-3` 4건. "33건"은 B계열만 센 수다. POPULATION 분모를 33으로 잡으면 D계열 4건이 집합 밖으로 새어 아무도 책임지지 않는다. **분모는 37로 잡는다.**

**(2) 병렬 상한 7장은 이 티켓에서 의미가 없다. 실제 상한은 4장이다.** `src/components/FleetGame.tsx`는 240줄이지만 한 줄이 화면 한 구역 전체다 — 실측 줄 길이: **199행 1,400자**(변형 설정 화면 전부), **221행 678자**(중단 바 특수 버튼 전부), **215행 666자**(배 선택기), **229행 596자**(하단 설명), 222행 426자, 224행 422자. 37건 중 24건이 이 파일을 만진다. git은 줄 단위로 병합하므로 **의미상 무관한 두 수정이라도 같은 줄이면 100% 충돌**한다. 카드 수를 7까지 올려도 병합에서 되돌아온다. 병목은 카드 수가 아니라 이 파일 하나다.

**(3) 기존 테스트 5곳이 결함을 정답으로 못 박고 있다.** 이걸 카드에 안 적으면 worker는 "테스트가 깨진다 → 내 수정이 틀렸다"로 읽고 결함을 되돌린다. 실측:

| 못 박은 곳 | 지금 단언하는 내용 | 걸리는 행 |
|---|---|---|
| `src/fleet.acceptance.test.js` "3/3" | 후미 마감면이 `left:50%` — **선두와 같은 자리**(=B-1 그 자체) | B-1 |
| `src/fleet.acceptance.test.js` "4/6" | `fleetShotMark`가 hit·miss·partial 3종뿐 | B-4·B-5·D-2 |
| `src/game/fleet.test.ts` "1/6" | 2칸 배 회전 결과가 `(0,0),(1,0)` (=cells[0] 고정 기준점) | B-23 |
| `src/game/fleet.test.ts` "2/6" | 한 발 뒤 `turnParticipantId`가 p2로 넘어가고 p1 두 번째 사격은 거부 | B-31 |
| `src/game/fleet.test.ts` (끝) | `placementParticipantId === 'p1'` (단일 행위자 토큰) | B-30 |
| `src/m3-fleet-3-integration.test.js` "9/9" | `.fleet-shot-mark` 규칙이 hit·miss·partial 3개 | D-2 |

→ **해당 카드의 DONE-WHEN에 "이 단언을 사양 근거와 함께 재작성한다"를 명시하고, FALSIFIER에 "옛 단언이 그대로 남아 있으면 RED"를 넣는다.**

---

## 1. POPULATION 분모 — 원장 표를 사양 정본 안에 신설한다

손으로 고른 `B-1, B-11, B-17…` 목록은 집합이 아니다. 이 저장소의 기존 컨벤션(`POPULATION: 2 (docs/plan/room-lobby.md 구현 상태 표 P1-P2)`)을 그대로 따라, **`docs/plan/fleet-strike.md`에 `§7 수정 원장` 표를 신설**하고 모든 카드의 분모를 그 표에서 도출한다. 새 문서를 만들지 않는다(사양 정본 안의 한 절 추가).

행 형식:

```
| ID | 증상 한 줄 | 뿌리 | 파일·존 | spec:FS-SPEC | impl:FS-MIDBAR | 상태 |
```

- 열 값에 `impl:` / `spec:` 접두어를 붙이는 이유는 **grep이 정확히 한 열만 세게 하기 위해서**다.
- 각 카드의 분모: `POPULATION: 4 (docs/plan/fleet-strike.md §7 수정 원장에서 impl:FS-MIDBAR 행 — 도출: grep -c 'impl:FS-MIDBAR' docs/plan/fleet-strike.md)`
- 전 카드 분모 합 = 37 = 원장 행 수. 이 항등식이 "빠진 건이 없다"의 기계 증명이며, supervisor가 병합할 때마다 `grep -c 'impl:' = 37`로 확인한다.
- `D-1`·`D-2`·`D-3`처럼 사양분과 구현분이 갈리는 행은 두 열이 서로 다른 티켓을 가리킨다(사양=FS-SPEC, 구현=각 티켓). 행을 쪼개지 않으므로 합이 흐트러지지 않는다.

---

## 2. 병합 충돌 지도 — 무엇을 묶고 무엇을 나누는가

### 2.1 소유 단위

**`FleetGame.tsx` = 존(zone) 단위 배타 소유.** 한 웨이브에서 한 존은 한 티켓만 만진다.

| 존 | 줄 | 내용 | 요구 티켓 수 |
|---|---|---|---|
| R1 | 26–56, 71–74 | 상수·표시 이름 맵·`fleetShotMark`·점수판 행 계산 | 3 |
| R2 | 112–141 | `FleetBoard`(칸 class·표기·꼬리표) | 4 |
| R3 | 143–195 | 훅·파생값·핸들러(`selectTarget`·`confirmTarget`·재생 타이머) | 7 ← 최대 격전지 |
| R4 | 197–200 | 변형 설정 화면(1,400자 한 줄) | 4 |
| R5 | 202–212 | 상단 존(캐로셀·배치 요약·조준 보드) | 5 |
| R6 | 213–226 | 중단 바(배 선택기·회전·탄종·토글·확인) | 6 |
| R7 | 227–239 | 하단 존·점수판·연출 자막 | 5 |

**`styles.css` = 선택자 단위 배타 소유.** 이 파일은 규칙 1개 = 1줄이라 서로 다른 규칙끼리는 자동 병합된다. 다만 **새 규칙 삽입 위치가 겹치면 충돌**하므로, 카드마다 "새 규칙은 이 티켓이 소유한 마지막 선택자 바로 아래에 삽입한다"로 앵커를 다르게 준다. 검증은 `git diff -U0 src/styles.css`로 소유 밖 선택자가 나오면 RED.

**`fleet.ts` = 함수 단위 배타 소유.** 실측 구역: `placeShip/completePlacement`(212–256) · `rotateShip`(234–242) · `shoot`(260–278) · `queueVariantShot`(303–344) · `resolveVariantRound`(362–399) · `chooseVariantPreset/chooseSpecialShips`(412–460) · `fleetActorId`(476–481) · `taggedFleet`(433–441).

**`App.tsx`·`public/sw.js` = 파일 통째로 한 티켓.** 만지는 건이 3건뿐이라 나눌 이유가 없다.

### 2.2 묶는 근거 (뿌리가 아니라 줄이 근거다)

- **묶는다 — 같은 줄**: `B-4`+`B-5`+`B-25`+`D-2`는 전부 `fleetShotMark`(72행) 한 줄과 `.fleet-shot-mark` 3규칙을 만진다. 셋으로 쪼개면 같은 파이프라인을 세 번 만지고 두 번 충돌한다.
- **묶는다 — 같은 존**: `B-3`(221행 압박 버튼 패리티)+`B-33`(221행 토글 캡션)+`B-24`(215행)+`B-18`(`.fleet-middle`). 성격은 로직/표기/CSS로 제각각이지만 **R6 한 줄을 공유**하므로 한 장이어야 한다.
- **나눈다 — 선행**: `B-6`(관통탄 입력 경로 삭제)을 먼저 하면 `B-32`의 절반이 저절로 사라지고 `B-7`의 사례 ②가 사라진다. 순서를 뒤집으면 곧 삭제될 코드에 안내 문구를 다는 헛일을 한다.
- **나눈다 — 결정 대기**: `D-2`(표기 3종)·`B-19`(길이 숫자)·`B-22`(탭 2단계)·`B-23`(회전 기준점)·`B-26`(종료 화면)은 사용자 결정이 없으면 착수 자체가 추측이다.
- **나눈다 — 반증 우선**: `B-28`(변형 고르면 클래식 화면)과 `B-8`의 "전원 동일 태그", `B-19`의 "겹침"은 보고서 서술이 코드로 재현되지 않았다. 수정 카드가 아니라 **재현 카드**로 시작해, 못 재현하면 BLOCKED로 끝낸다.

---

## 3. 웨이브 — 14장 + 결정 카드 1장

트랙은 worktree로 격리하고 supervisor가 웨이브 안에서 순차 병합한다. 다음 웨이브는 **병합된 main에서 새로 분기**한다(그래야 R6·R3을 두 번째 티켓이 안전하게 다시 만진다).

| 웨이브 | 동시 | 카드 | 행 | 소유 |
|---|---|---|---|---|
| **W0** | 1 | **D0**(결정, 사용자) · **FS-SPEC** | 사양 8행 | `docs/plan/fleet-strike.md` 단독 |
| **W1** | 4 | FS-SHELL 3 · FS-FRAME 5 · FS-MIDBAR 4 · FS-EDGE 2 | 14 | App/sw · css프레임+R7:238 · R6+css중단+fleet.ts:314 · fleet.ts 가장자리 |
| **W2** | 3 | FS-VOCAB 3 · FS-SYNC 3 · FS-PLACEMENT 3 | 9 | R1+R4/R6/R7 소비처 · fleet.ts 게이트+App:607+R3:156/158 · R2+R3커서+fleet.ts:234-242 |
| **W3** | 4 | FS-MARKS 4 · FS-SETUP 2 · FS-AIM 3 · FS-UPPER 2 | 11 | R1/R2표기+css표기 · R4+fleet.ts프리셋 · R3핸들러+R5:208 · R5 |
| **W4** | 2 | FS-GUIDE 2 · FS-PRESENT 1 | 3 | R3/R6/R7 안내·종료 · fleet.ts연출+R3타이머 |

합 8(사양열) + 37(구현열) — 구현 합 14+9+11+3 = 37 ✓

**최우선 예외**: `FS-SHELL`의 `B-21`(서비스워커 리로드)은 논리적 선행이 아니지만 **다른 모든 카드의 검증을 파괴한다**(진행 중 화면이 리로드로 날아간다). W1 안에서 가장 먼저 병합한다.

---

## 4. 시각·조작감 결함을 기계 판정문으로 — 5가지 환원 규칙

"배 형상이 끊어진다"는 판정할 수 없다. 판정할 수 있는 것으로 환원한다. 이 저장소는 이미 그 도구를 갖고 있다 — `fleet.acceptance.test.js`의 `ruleBody(selector)`(CSS 규칙 본문 파싱), `tree(node)`(vnode 순회), 컴포넌트를 **함수로 호출**해 반환 트리를 보는 방식, 순수 함수 계약(`fleetShipTexture`·`fleetShotMark`). jsdom도 스크린샷도 없고 필요도 없다.

**규칙 ① 형상 → 닫힌 변의 개수와 위치.** "윤곽이 끊긴다"는 *바깥 끝에 있어야 할 마감선이 안쪽에 있다*는 뜻이다. → 선택자별 4변 좌표와 `border-*` 유무를 단언한다.
**규칙 ② 대칭 → 거울/회전 관계식.** 두 규칙의 좌표가 서로의 거울상인가를 값으로 비교한다. 회전은 순수 함수 출력(`rotation: 90`)으로 고정한다.
**규칙 ③ 겹침 → 배치 문맥 + z축.** "덮는다"는 `position: fixed`이거나 부모가 자리를 확보하지 않았다는 뜻이다. → `position`·`inset`·`z-index` 선언과 컨테이너의 grid 행 수로 단언한다.
**규칙 ④ 구분 불가 → 두 값이 실제로 다른가.** "격침이 명중과 같다"는 `fleetShotMark('sunk').kind === fleetShotMark('hit').kind`로 정확히 표현된다. RED 조건 = **같으면**.
**규칙 ⑤ 무반응 → 거부 경로가 남기는 산출물.** "눌러도 아무 일이 없다"는 *리듀서가 같은 참조를 반환했는데 화면에 노드가 하나도 안 늘었다*는 뜻이다. → `reduceFleet(...) === state`인 입력에서 (a) 버튼 `disabled`가 true이거나 (b) 반환 트리에 안내 노드가 정확히 1개 있어야 한다.

### 실제 문장 예 — B-1 「배 후미가 좌우 반전돼 윤곽이 끊긴다」

```
FALSIFIER:
- ruleBody('.fleet-ship-texture.texture-stern::before')가 `left: 50%`와 `right: 0`을 갖지 않거나,
  여전히 .texture-bow::before와 한 선택자 그룹에 묶여 있으면 RED.
- .texture-stern::after의 네 변이 .texture-bow::after의 좌우 거울상이 아니면 RED
  (bow가 right:10%·left:50%이면 stern은 right:50%·left:10%).
- 마감면의 닫힌 세로변이 칸 바깥쪽 끝(x=10%)에 정확히 1개가 아니거나,
  이웃 칸과 맞닿는 안쪽 변(x=90%)에 세로 border가 1개라도 남아 있으면 RED.
- fleetShipTexture(3칸 가로)가 ['stern','body','bow']를, 세로가 rotation 90을
  그대로 반환하지 않으면 RED (회전 로직은 무변이어야 세로 배가 같이 고쳐진다).
- fleet.acceptance.test.js "3/3"의 옛 단언(stern::after left:50%)이 남아 있으면 RED.
- git diff --name-only에 src/components/FleetGame.tsx가 있으면 RED — 이 행은 CSS만으로 닫힌다.
```

마지막 줄이 이 규칙의 핵심이다: **"어느 파일이 diff에 나타나면 RED"는 시각 결함에 가장 강한 falsifier다.** 원인이 CSS인지 렌더러인지가 판정문에 박히고, worker가 엉뚱한 층을 만지면 즉시 잡힌다.

---

## 5. 티켓 초안 뼈대 (14장)

전 카드 공통(카드마다 반복 기재):
```
cwd: C:\Localai\boardgames
run: .\node_modules\.bin\vitest.cmd run <소유 테스트 파일>
run: .\node_modules\.bin\vitest.cmd run
run: npm run build
artifact: docs/plan/fleet-strike.md · docs/spec/DIRECTIVES.md · collab13/PREFLIGHT.md · <소유 소스>
공통 FALSIFIER: 소유 밖 파일·존·선택자가 diff에 나타나면 RED / vitest·build가 0이 아니면 RED /
  CSS 총 줄수가 배정 상한을 넘으면 RED / docs·collab13 수정(FS-SPEC 제외) RED / 릴레이 배포 RED /
  같은 증상에 두 번 실패하면 세 번째 변형 대신 반증된 가설을 raw에 적고 BLOCKED.
```
> 예산 메모: `styles.css` 270/500줄 — 잔여 230줄을 FRAME 40·MIDBAR 20·MARKS 30·PLACEMENT 30·AIM 20·UPPER 40·GUIDE 20으로 배분. PREFLIGHT의 `src 비테스트 2,000줄` 상한은 M2 시절 수치이고 실측이 이미 **3,949줄**이라 낡았다 — PREFLIGHT 규칙대로 조이지 말고 supervisor가 갱신을 요청한다.

---

### D0 — 결정 카드 (supervisor→사용자, worker 아님)
5문. 이게 없으면 4장이 착수 불가다.
1. **밝힘 표기 2종**: 조명탄이 밝힌 칸 중 ①배가 있는 칸 ②빈 칸을 각각 무엇으로 그리나. (지금은 ①이 명중과 같은 빨강 ×, ②는 빗나감과 같은 검정 ×라 실제로 쏜 칸과 구별되지 않는다.)
2. **격침 표기**: 격침된 칸의 기호와, 격침된 배 자체의 칠. (D-048은 빨강×·검정×·작은빨강× 3종만 정했다.)
3. **배 꼬리표의 길이 숫자**: 사양에 없는 숫자를 지울지, 연안/원양 태그와 구분되는 다른 표기로 남길지. (지우면 클래식에서 어느 배가 어디 놓였는지 읽을 단서가 사라진다.)
4. **배치 미리보기 입력**: 세로 폰이라 hover가 없다 — "첫 탭=미리보기, 둘째 탭=확정"인가, 중단의 「확인」 버튼 재사용인가.
5. **회전 기준점**: 배 중앙 기준으로 바꾸나(그러면 판 경계에서 밀어넣기 규칙도 정해야 함), 첫 칸 기준을 두고 미리보기로 보여주나.
6. (부수) **종료 표시**: 승/패/무승부를 보는 사람 기준으로 어디에 어떻게 내나 — 전용 화면인가 배너인가.

---

### W0 · FS-SPEC — 사양 정합과 수정 원장 신설
- **범위**: `docs/plan/fleet-strike.md` 단독. §2의 모순 두 문장 정리(D-1 문서분: 프리셋 묶음 문장 폐기, 「후보 9종/7종」→8종으로 정정) · §4.7에 연출 자막 칸과 회전 기준점 자리 정의 · §4.8 표기 표에 결정 1·2의 행 추가 · §5를 프리셋·배치·사격 전부로 확대 + 로컬 모드는 순번 대행 명시(D-3 문서분) · **§7 수정 원장 37행 신설**.
- **POPULATION**: `8 (docs/plan/fleet-strike.md §7에서 spec:FS-SPEC 행 — grep -c 'spec:FS-SPEC')`
- **FALSIFIER**: 원장 행이 37이 아니거나 `impl:` 값의 합이 37이 아니면 RED / §2에 프리셋 묶음 문장과 독립 뽑기 문장이 **둘 다** 남으면 RED / §5 증보문에 "숨은 시작 버튼을 1초마다 자동으로 누른다" 류 폴링 구현이 들어가면 RED(전원 완료 시 자동 전환은 `fleet.ts:252-255`에 **이미 있다**) / 로컬 모드 예외가 §5에 없으면 RED / `src/` 아래 파일이 diff에 있으면 RED.

### W1 · FS-SHELL — 판이 통째로 날아가는 3건 ★최우선
- **범위**: B-21(서비스워커 리로드) · B-20(로컬 2P 특수 배 선택 불가, 블로커) · B-28(변형 골랐는데 클래식 화면, **미재현**)
- **소유**: `src/App.tsx` 전체 · `public/sw.js`
- **POPULATION**: `3 (… impl:FS-SHELL)`
- **FALSIFIER**: 사용자가 「확인 후 업데이트」를 누르지 않은 `controllerchange`에서 `location.reload()`가 호출되면 RED(첫 방문 `claim()` 경로 포함) / 동의 플래그 없이 `sw.js`의 `clients.claim()`만 지워 오프라인 캐시 갱신 시점을 바꾸면 RED / 로컬 모드에서 1P가 특수 배 2척 확정 후 2P 차례에 `specialSelection`·`shipIndex`·`orientation`·`targetPreview`·`variantSelections`·`bonusMode`·`spread`·`targetId` **8종이 전부** 초기 상태가 아니면 RED(콜사이트에 리셋 7줄을 나열하는 처방은 RED — `App.tsx:607`에 배우 단위 key) / B-28은 「방 메시지가 새 스냅샷보다 먼저 도착」 창을 재현하는 테스트를 먼저 쓰고, 재현되지 않으면 화면 전환 코드를 고치지 말고 BLOCKED로 보고(보고서가 지목한 `:426/:434`는 원인이 아님을 raw에 적을 것).

### W1 · FS-FRAME — 화면 틀을 깨는 5건
- **범위**: B-1(후미 반전) · B-11(점수판 손잡이가 틀 밖) · B-17(안내 두 문구 붙음) · B-27(이름표가 1행을 덮음) · B-10(자막이 아홉 칸 어디에도 없음)
- **소유**: `styles.css`의 `.fleet-ship-texture.*` · `.fleet-sheet-handle`(신설) · `.fleet-summary` · `.fleet-board-shell`/`.fleet-board-name` · `.fleet-presentation` / `FleetGame.tsx` **238행만** / `src/fleet.acceptance.test.js`
- **POPULATION**: `5 (… impl:FS-FRAME)`
- **FALSIFIER**: (B-1) §4 예시 5줄 그대로 / (B-11) `.score-sheet-handle`(:84) 공용 규칙이 diff에 있으면 RED — 요트가 같이 깨진다; `.fleet-sheet-handle`이 `position: absolute`가 아니거나 `.fleet-screen` 밖을 기준으로 잡으면 RED / (B-17) 규칙 완화 후 `.fleet-summary`가 `display:flex`+`gap`을 갖지 않거나, 반대로 `fleet-board`를 마크업에 덧붙여 안내문에 격자 테두리가 생기면 RED / (B-27) `.fleet-board-shell`이 이름표 행을 확보하지 않고 `.fleet-board-name`이 `position:absolute`로 남으면 RED; 보드가 정사각 비율을 잃거나 `.fleet-screen` 45/10/45가 바뀌면 RED / (B-10) `.fleet-presentation`이 `position:absolute; inset:42% 5% auto`로 남거나, 자막 DOM이 아홉 칸 중 한 칸 안이 아니면 RED.

### W1 · FS-MIDBAR — 중단 바 4건
- **범위**: B-3(압박 고폭탄이 항상 조명탄 1발) · B-18(버튼 글자가 단어 중간에서 끊김) · B-24(배치 완료 여부 미표시) · B-33(「일반탄 대체」 오독)
- **소유**: `FleetGame.tsx` R6(213–226) / `styles.css`의 `.fleet-middle`·`.fleet-middle button`·`.fleet-ship-picker*`·`.fleet-shot-choice*` / `fleet.ts` 314행 한 곳
- **POPULATION**: `4 (… impl:FS-MIDBAR)`
- **FALSIFIER**: (B-3) **압박 고폭탄이 실제로 십자 5칸 impacts를 만드는 라운드가 리듀서 테스트에 존재하지 않으면 RED** — 조명탄 1발만 나오면 RED; `fleet.ts:314`와 `FleetGame.tsx:221` 두 패리티가 어긋난 채 남으면 RED(두 곳이 일치함을 리듀서 왕복으로 증명할 것) / (B-18) `.fleet-middle button`에 `white-space:nowrap`·`flex:none`이 없거나, 넘침 정책(가로 스크롤 또는 2행) 없이 nowrap만 넣어 버튼이 중단 10% 영역 밖으로 나가면 RED / (B-24) 배치 완료 표시가 선택 표시와 같은 노랑(`--accent`)이면 RED(D-048: 노랑은 선택 전용) / (B-33) 「일반탄 대체」 문자열이 코드에 남으면 RED; 택1이 토글 1개로 남고 나란한 박스 2개(고른 쪽만 강조)가 아니면 RED(D-043 「박스 1개 = 발사 1번」).

### W1 · FS-EDGE — 리듀서 가장자리 2건
- **범위**: B-2(예광탄이 판 가장자리에서 전체 무효) · B-8(연안·원양이 무작위 2척이 아님)
- **소유**: `fleet.ts` `queueVariantShot`(337–341) · `taggedFleet`(433–441) · 182행 / `src/game/fleet.test.ts` 신규 케이스
- **POPULATION**: `2 (… impl:FS-EDGE)`
- **FALSIFIER**: 1행·마지막행·1열·마지막열을 중심으로 한 예광탄이 거부되면 RED / **중심 칸 자체가 판 밖인 예광탄이 impacts 0개로 통과하면 RED**(340행의 filter만 믿고 중심 검사를 빼면 이 구멍이 생긴다) / `fleet-shots.ts`가 diff에 있으면 RED(플래너는 정상) / 8~10척 함대에서 인덱스 7·8·9가 어떤 난수에서도 태그를 받을 수 없으면 RED / 연안·원양이 항상 함대 배열에서 이웃한 두 척이면 RED / 「검수 3인 전원 동일 태그」는 코드로 재현되지 않았으므로 회귀 확인에서 별도 관측으로 남기고, 재현되면 별건으로 보고.

### W2 · FS-VOCAB — 변형 표시 어휘 계층 신설 (B-14·B-16·D-2.5)
- **범위**: 사격 8종 이름·설명, 특수 배 7종 이름, 청사진 id 약 11종 이름 맵 신설 + 소비처 배선
- **소유**: `FleetGame.tsx` R1(26–56) · R4(199) · R6(215·219) · R7(229). **R5(207)는 만지지 않는다** — FS-UPPER가 그 자리를 통째로 다시 쓰고 사전을 소비한다. R2(137 aria)는 FS-PLACEMENT 소유.
- **POPULATION**: `3 (… impl:FS-VOCAB)`
- **FALSIFIER**: 사용자 대면 문자열에 `salvo`·`buckshot`·`supply-ship`·`base-2`·`armor-5` 같은 내부 식별자가 하나라도 렌더 트리에 남으면 RED / **기존 `FLEET_SHOT_LABELS`를 그대로 재사용하면 RED** — `salvo`는 「연속 사격」, `random-shot`은 「랜덤샷」이 사양(§3:65-74)이고 현재 맵은 '일제사격탄'·'무작위탄'으로 어긋나 있다 / 탄종 설명이 탄종에 따라 달라지지 않으면(하단 문구가 한 종류면) RED / 설명 문안을 사양 §3:65-83 밖에서 지어내면 RED / 프리셋 3장 각각에 설명이 없으면 RED.

### W2 · FS-SYNC — 배치·프리셋·사격 동시화 (D-3 구현 · B-30 · B-31)
- **범위**: 단일 행위자 토큰을 참가자별 완료 플래그 게이트로 교체. 클래식 사격을 변형 라운드 파이프라인으로 이관.
- **소유**: `fleet.ts` `placeShip`·`completePlacement`·`shoot`·`resolveVariantRound`·`chooseVariantPreset`·`chooseSpecialShips`·`fleetActorId` / `App.tsx:607` / `FleetGame.tsx` R3의 **156·158 두 줄만** / `src/game/fleet.test.ts`
- **POPULATION**: `3 (… impl:FS-SYNC)`
- **선행**: FS-SHELL(같은 `App.tsx:607`을 만진다 — 반드시 뒤).
- **FALSIFIER**: **`resolveVariantRound`의 `if (blueprint)` 분기에 blueprint 없는 클래식 배용 경로를 추가하지 않은 채 클래식을 그 경로에 태우면 RED**(모든 사격이 miss가 된다 — 실측 확인) / 두 사람이 같은 라운드에 동시에 배치·확정할 수 없으면 RED / 로컬(한 기기) 모드에서 행위자가 사라져 배치·설정이 진행 불가가 되면 RED(변형 조준의 `:480` 방식 = 「살아 있고 아직 확정하지 않은 첫 사람」을 배치·설정에도 적용) / `fleet.test.ts` "1/6"·"2/6"·`placementParticipantId==='p1'` 옛 단언이 남으면 RED / 마지막 사람이 완료했을 때 자동 전환이 되지 않거나, 폴링 타이머로 자동 전환을 새로 만들면 RED / 클래식에서 같은 사람의 같은 칸 두 발 규칙과 승패 확정 시점이 라운드 끝으로 옮겨지지 않으면 RED.

### W2 · FS-PLACEMENT — 배치 조작 3건 (B-22 · B-23 · B-19) 〔D0 결정 3·4·5 필요〕
- **소유**: `FleetGame.tsx` R2(112–141) 전체 · R3의 배치 커서 상태(147–152 인접) · R6의 217행 / `fleet.ts` `rotateShip`(234–242) / `styles.css` `.fleet-cell.target-selected` 인접 신규 배치 커서 규칙 · `.fleet-ship-label` / `src/game/fleet.test.ts`
- **POPULATION**: `3 (… impl:FS-PLACEMENT)`
- **FALSIFIER**: 하단 내 보드의 칸 클릭이 곧바로 `place-ship`을 발행하면 RED(미리보기→확정 2단계여야 한다) / hover(`onMouseEnter`/`onFocus`) 전제 경로를 만들면 RED(세로 폰 기준 D-045) / 배치 커서 색이 `--accent`가 아니면 RED(D-048이 명시 허용) / 회전 결과가 판 밖·겹침일 때 화면에 아무 변화가 없으면 RED / `rotate-ship` 경로에서 로컬 `orientation`이 갱신되지 않아 다음 배의 방향이 어긋나면 RED / `fleet.test.ts` "1/6"의 회전 단언이 새 기준점으로 재작성되지 않으면 RED / 꼬리표에서 길이 숫자를 지우기만 하고 결정 3의 지시를 벗어나면 RED.

### W3 · FS-MARKS — 피격 표기 어휘 확장 (D-2 구현 · B-4 · B-5 · B-25) 〔D0 결정 1·2 필요〕
- **소유**: `fleet.ts` `FleetShotResult`(20) · `resolveVariantRound`의 결과 접기(383–384) · 클래식 배 sunk 필드(224–227) / `FleetGame.tsx` R1(29·71–74) · R2(124·128·134) / `styles.css` `.fleet-shot-mark.*` · `.fleet-cell.occupied` / `fleet.acceptance.test.js` "4/6" · `m3-fleet-3-integration.test.js` "9/9"
- **POPULATION**: `4 (… impl:FS-MARKS)`
- **FALSIFIER**: `fleetShotMark('sunk').kind === fleetShotMark('hit').kind`이면 RED / `'revealed'`가 `FleetShotResult`에 없어 `fleet.ts:383`에서 접히면 RED / **UI에서 `impactKind === 'flare'`만 보고 「밝혀짐」으로 판정하면 RED** — 종이배는 조명탄에 실제 피해를 입어 `impactKind='flare'`인데 진짜 명중이다(반례 테스트 필수) / 조명탄이 밝힌 **빈 칸**이 실제로 쏴서 빗나간 칸과 같은 표기면 RED / 격침된 배 칸의 class가 멀쩡한 배와 동일하면 RED / **`fleetScoreSheetRows`(51–52행)가 `result !== 'miss'`로 남아 밝혀지기만 한 칸을 부서진 칸으로 세면 RED**(타입만 넓히고 여길 안 고치면 점수판이 조용히 틀린다) / 옛 3종 단언이 두 테스트 파일에 남으면 RED.

### W3 · FS-SETUP — 프리셋 결합 해체 (D-1 구현 · B-15)
- **소유**: `fleet.ts` `FleetVariantPreset`(22–26) · `variantPresetOffers`(156–165) · 180 · `chooseSpecialShips`(448–451) / `FleetGame.tsx` R4(197–200) / `styles.css` selected 규칙의 `.fleet-screen` 범위 승격
- **POPULATION**: `2 (… impl:FS-SETUP)`
- **선행**: FS-VOCAB(설정 화면이 사전을 소비한다). 순서를 뒤집으면 1,400자 한 줄을 두 번 쓴다.
- **FALSIFIER**: 사격 카드 3장 뽑기와 특수 배 4장 뽑기가 여전히 한 자료구조로 묶여 있으면(`specialShipOffers`가 preset에 매달려 있으면) RED / `(presetIndex*4+offset)%7` 슬라이스가 남아 1번 카드 후보와 3번 카드 후보가 3장 겹치면 RED / 카드를 고른 뒤 세 장이 똑같이 disabled로만 바뀌고 고른 장에 선택 표시가 없으면 RED / 선택 표시 규칙이 `.fleet-ship-picker` 안에만 존재해 설정 화면·중단 버튼에 닿지 않으면 RED / 선택 색이 `--accent` 외의 값이면 RED / 사양 §2 문장과 구현이 어긋나면 RED(FS-SPEC이 이미 고쳐 둔 문장이 정본).

### W3 · FS-AIM — 조준 입력 경로 정정 (B-6 · B-29 · B-32)
- **소유**: `FleetGame.tsx` R3의 93–110·159–160·175–190 / R5의 208–209 / `styles.css` `.fleet-cell.target-selected` 및 신규 미리보기 규칙
- **POPULATION**: `3 (… impl:FS-AIM)`
- **FALSIFIER**: 관통탄이 여전히 `selectionNeeded=2`의 범용 칸 선택 경로를 쓰면 RED(가로 1×2 / 세로 2×1 택1이어야 한다 — D-043) / 인접하지 않은 두 칸으로 확인 버튼이 활성화되면 RED / 정원이 찬 뒤의 클릭이 미리보기로 얹혀 4번째 칸이 강조되면 RED / 확정 선택과 미리보기가 같은 `target-selected` 한 클래스로 그려지면 RED / **범위탄 미리보기를 `Math.random`이 들어간 계획으로 만들어 미리보기와 실제 착탄이 달라지면 RED** — 무작위탄·산탄은 시드를 고정하거나 범위 대신 성격만 표기할 것 / 중심이 판 밖(±2)일 때 강조 칸이 0개면 RED / `fleet-shots.ts`가 diff에 있으면 RED.

### W3 · FS-UPPER — 상단 존 재구성 (B-12 · B-13)
- **소유**: `FleetGame.tsx` R5(202–212) 전체 / `styles.css` `.fleet-side`·`.fleet-carousel`
- **POPULATION**: `2 (… impl:FS-UPPER)`
- **선행**: FS-VOCAB(탄종 특성 문구) · FS-SYNC(배치가 동시가 되어야 상단 중앙이 「내 현황」이 된다 — 순차인 채로 고치면 곧 다시 고친다)
- **FALSIFIER**: 배치 페이즈에서 상단 좌·우가 공란이 아니면 RED(캐로셀 조건에 `phase === 'targeting'`이 없으면 RED — D-045) / 조준 페이즈 좌·우 슬롯에 이웃 보드가 `FleetBoard`로 렌더되지 않고 화살표 버튼만 있으면 RED / 이웃 보드가 클릭 표적이면 RED(`interactive={false}` + 슬롯 전체가 넘김) / 각 보드 좌상단에 소유자 이름표가 없으면 RED(D-044) / 탈락자 보드가 캐로셀에서 빠지면 RED / 배치 상단 중앙이 「지금 배치 중인 남의 이름」을 보여주면 RED(주어가 나로 통일되어야 한다) / 같은 정보를 상단 중앙과 중단 배 선택기가 중복 표시하면 RED.

### W4 · FS-GUIDE — 침묵 거부와 종료 표시 (B-7 · B-26)
- **소유**: `FleetGame.tsx` R3(189·191–195) · R6(219·221) · R7(229) · R5의 이름표 상태 표기
- **POPULATION**: `2 (… impl:FS-GUIDE)`
- **선행**: FS-AIM(사례 ② 관통탄 경로가 없어진 뒤여야 헛일을 안 한다) · FS-SYNC(사례 ③의 게이트가 바뀐다)
- **FALSIFIER**: 리듀서가 같은 state를 반환하는 4경로(연안 배를 한가운데 배치 / 기본 사격 전 보너스탄 / 특수 배 3척째 / 남은 하나)에서 안내 노드가 0개면 RED / 안내 대신 리듀서를 「거부 사유 반환」으로 바꾸면 RED(바둑·요트까지 파급 — 이 티켓 범위 밖) / 기본 사격 전인데 보너스 버튼이 `disabled`가 아니면 RED / 거부 시 선택이 지워지면 RED(`:189`) / 승패가 `viewerId`와 `winnerId` 비교로 산출되지 않아 패배자가 자기 패배를 알 수 없으면 RED / `phase==='complete'`인데 조준 레이아웃이 그대로면 RED / 내 보드 이름표에만 탈락 표기가 없으면 RED(상대는 붙는데 나는 안 붙는 비대칭).

### W4 · FS-PRESENT — 연출 단위 (B-9)
- **소유**: `fleet.ts` `FleetVariantImpact`(69) · 342 · `resolveVariantRound` 큐 생성(366–398) / `FleetGame.tsx` R3의 158·168–173
- **POPULATION**: `1 (… impl:FS-PRESENT)`
- **선행**: FS-SYNC(같은 `resolveVariantRound`를 만진다 — 반드시 뒤)
- **FALSIFIER**: 고폭탄 한 발(십자 5칸)이 캡션 5개·결과 5개를 만들면 RED(발당 캡션 1 + 결과 요약 1) / impact에 발 식별자가 없어 여러 발의 impacts가 구분 없이 이어 붙으면 RED / 연출 재생 중에 다음 라운드 입력이 열리면 RED(`canShoot`이 재생 상태를 보지 않으면 RED) / 재생 타이머가 순수 클라이언트 지역 상태로만 남아 재접속·authority 교체에서 어긋나면 RED / 기존 `presentationQueue` 순서 단언(`['caption','result',...]`)을 근거 없이 깨면 RED — `m3-fleet-3-integration.test.js` "7/9"을 사양 근거와 함께 재작성할 것.

---

## 6. 남는 위험 3가지 (supervisor가 보고 있어야 할 것)

1. **R3(143–195)은 7개 티켓이 요구하는 유일한 구역이다.** FS-SYNC(156·158) → FS-PLACEMENT(147–152) → FS-AIM(159–190) → FS-GUIDE(189·191–195) → FS-PRESENT(158·168–173) 순서로 **웨이브를 걸쳐 직렬화**했다. 이 순서를 흔들면 병합이 깨진다. 한 웨이브 안에서 두 카드가 R3을 요구하면 그건 계획 위반이지 director 재량이 아니다.
2. **W2가 3장, W4가 2장으로 얇다.** 7장을 채우려고 카드를 더 만들면 반드시 같은 존을 두 명이 잡는다 — 채우지 않는 것이 맞다.
3. **미재현 3건**(B-28·B-8의 "전원 동일"·B-19의 "겹침")은 수정 카드가 아니라 재현 카드다. 재현 실패 시 BLOCKED가 정상 결과이며, 이를 done으로 올리면 원장 상태가 거짓이 된다.
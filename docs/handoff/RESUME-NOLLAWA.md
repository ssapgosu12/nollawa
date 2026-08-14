# Nollawa — 다음 작업

STREAM: nollawa-build · v9 · 2026-08-14 (v8 = 폰 검수 다섯 요청, 연출 6회 교정과 배포로 소진돼 교체)

▶ **RESUME HERE → 다음 개발은 새 게임이다. `M2`(요트 다이스 + 범용 점수판) 티켓을 발행해 착수한다.** [사용자 협업 — D-007에 따라 사용자가 "발행해"라고 말할 때만 카드를 만든다]
**DONE-WHEN**: `docs/PLAN.md` §8 M2 절의 완료 조건 — 실물 주사위로 한 판 기록한 뒤 앱을 완전히 종료했다 켜서 복원된다. 점수는 입력 이벤트 목록에서 순수 함수로 재계산하고 누적 변수를 쓰지 않는다(2배 누적 버그의 근원). 입력마다 즉시 저장·되돌리기·화면 꺼짐 방지.
**HOW→** 티켓 발행 절차는 이 저장소에서 굳어졌다 — ①`git worktree add C:/Localai/boardgames-<track> -b track/<track>` ②`~/.codex/config.toml`에 그 폴더를 `trust_level = "trusted"`로 등록 ③그 폴더에서 `npm ci --ignore-scripts` ④`collab13/PREFLIGHT.md`에 공통 절 + 티켓 절(주문·보존·파일 경계·중단 조건)을 쓰고 ⑤`collab13/cards/director/queue/`에 director 카드 한 장 ⑥`python C:/Users/apple/.collab3/control.py up <카드> --root <폴더>`로 스폰 ⑦`watch`도 같이 띄운다. 카드에 **"네 worker는 네가 직접 control.py up으로 스폰한다"**를 반드시 넣는다. 병합 뒤 그 트랙을 즉시 정리한다(감시자 종료·증거를 `collab13/tracks-*/`로 복사·worktree 제거·trust 원복).
**첫 안건** — M2를 한 트랙으로 묶을지(요트 → 점수판 순차) 두 트랙으로 나눌지. 점수판이 요트 점수표 파생이라 순차가 자연스럽고, 계획서도 "사실상 공짜"로 본다.
**ANCHOR**: `8894893` (2026-08-14; tests 259 passed, build 성공, 푸시·배포 완료) — 재개 전 `git log 8894893..HEAD --oneline`과 `git status --porcelain`으로 대조.

## STATE

하루에 티켓 열아홉 장을 돌려 M0·M1을 전부 닫고 배포했다. 게임 넷(사목·오목·육목·리버시)이 격자 렌더러와 탐색 코어를 공유하고, 판 크기 선택·두 단계 착수·마지막 수 표시·판마다 선공 결정·참가자 상태 5종·AI 강도·연출 3종(동전·주사위·덱)이 라이브에 있다. 테스트 18 → **259개**. 연출은 사용자 피드백으로 여섯 번 교정했고 시간·각도·비율이 전부 슬라이더이며 지금 값이 기본값으로 굳었다.

- **로드맵 좌표**: `docs/PLAN.md` §8 — M0·M1 완료, 다음이 **M2(주사위·점수표 축)**. 그 뒤 T0에 남은 것은 함대 격침·체스다.
- **IN-FLIGHT**: 없음. 협업 세션 0(`python C:/Users/apple/.collab3/control.py ls --root C:/Localai/boardgames`로 확인).
- **잔여물**: 없음 — worktree·감시자·Codex trust 항목까지 정리했다.
- **git 미추적 산출물**: `collab13/`(제어면 상태·협업 증거 `tracks-2026*`)과 `dist/`. 둘 다 git으로 복원 불가하다.

## DECIDED (재논의 금지)

- **선공 결정은 모든 게임 공통 절차**다(D-023). 새 게임 티켓의 완료 조건에 「선공 결정이 그 게임에서도 동작한다」를 넣는다. 사람끼리는 동전, AI 대전은 흑돌/백돌 선택이며 판마다 다시 정한다.
- **오목은 렌주 금수**(삼삼·사사·장목)이고 스왑 오프닝은 폐기됐다(D-017). 금수와 돌 색은 좌석이 아니라 **그 판의 선수** 기준이다 — 흑 = 선수, 백 = 후수.
- **연출 시간·각도·비율은 사용자가 맞춘 현재 기본값이 정답**이다. 임의로 바꾸지 말 것(D-027·D-032·D-033).
- **세 트랙 동시 진행은 worktree로 격리**하고 supervisor가 순차 병합한다. 같은 체크아웃에 여러 세션을 넣지 않는다.
- 티켓은 사용자가 "발행해"라고 할 때만 발행한다(D-007, 작업 카드 최대 3장). `dist/`는 추적하지 않는다.

## OPEN (필요할 때만)

- 자막(「OO덱이 섞이고 있습니다」)이 좁은 화면에서 덱과 겹치는지 — supervisor 데스크톱 954px에서 겹쳤고 폰 확인이 안 됐다. 겹치면 위치만 고치는 작은 수정.

## TRAPS (단정 전 확인)

- **애니메이션 검증에 스크린샷을 쓰지 마라.** 왕복 1초인데 현상은 100ms다. 페이지 안에서 `setTimeout(16ms)` 간격으로 `getComputedStyle(el).transform`을 표집해 요약만 돌려받는다. **`requestAnimationFrame`은 이 환경에서 즉시 반환돼 루프가 순식간에 끝난다** — rAF로 표집하면 첫 순간만 잡히고 "안 움직인다"는 오판이 나온다(실제로 두 번 그랬다).
- **브라우저 창이 최소화되면**(`outerWidth` 0·`visibilityState: hidden`) 타이머가 조여져 시간 측정이 성립하지 않는다. 확정 타이머를 계산하는 것은 대표 클라이언트(보통 방장)이므로 그 탭이 보여야 한다.
- **worker 결과 카드가 형식에서 자주 깨진다**(파일명 `-result` 누락·`outcome` 누락·`raw:` 빈 값·`from: worker` 리터럴·`COVERED`가 `n/N` 아님). director가 살아 있으면 스스로 correction을 내므로 **먼저 `ls`로 생존을 확인하고 기다린다.** supervisor가 대신 result를 쓰면 `foreign-result`로 거부된다.
- **테스트가 통과했는데 화면이 망가질 수 있다.** 자막 폭이 그리드 트랙을 부풀려 덱이 500px가 된 적이 있다 — 연출·레이아웃 변경은 미리보기 정적 확인을 함께 한다.
- **릴레이는 별도 배포다.** 바뀌었는지 `git diff <직전 배포 해시>..HEAD -- relay/`로 확인하고, 바뀌었으면 `npx wrangler deploy --config relay/wrangler.toml`을 돌린다. 기억으로 판단하지 말 것(그렇게 해서 한 번 틀렸다).
- **`npm test`가 `vitest`를 못 찾는다.** `./node_modules/.bin/vitest run`으로 돌린다.

## CONTEXT (필독 — 해당 절만)

- `docs/INDEX.md` — 질문에서 문서·절로 가는 라우팅 표. 여기서 시작한다.
- `docs/PLAN.md` §8(로드맵 M0~M5와 각 단계 완료 조건) · §11(구조 예산: `src` 비테스트 1,600줄·CSS 500·릴레이 285·직접 의존성 4) · §14(실기기 검수 이력 일곱 회와 그때그때의 결정).
- `docs/spec/DIRECTIVES.md` D-008~D-033 — 사용자 지시 **원문**. 계획과 어긋나면 이쪽이 이긴다.
- `docs/plan/room-lobby.md`(로비·팀·투표·판 크기·두 단계 착수·표시 규율의 「구현 상태」 표) · `docs/plan/table-effects.md` §4(덱 섞기 사양 표: 스폰 8장·홀짝 리플·좌우 교대·슬라이더).
- `collab13/COLLAB-ISSUES-LOG.md` — 협업 제어면에서 관측된 문제(감시자 되먹임·director가 worker 스폰을 기다리다 죽는 함정). 협업 시작 전에 읽는다.

---

**REALITY CHECK** (시작 직전 1회): `git log 8894893..HEAD --oneline` · `git status --porcelain` · `./node_modules/.bin/vitest run` · `git worktree list` · `python C:/Users/apple/.collab3/control.py ls --root C:/Localai/boardgames`

**디스커버리**: 이 파일은 `docs/INDEX.md`의 「인수인계」 표와 `docs/PLAN.md` §8 말미에서 가리켜진다. 스트림이 끝나면 같은 파일을 v10으로 교체하고 다른 스트림 파일은 덮어쓰지 않는다.

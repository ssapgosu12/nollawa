# Nollawa — 다음 작업

STREAM: nollawa-build · v2 · 2026-08-12 (v1 = §14 피드백 처리 확정, 완료되어 교체)

▶ **RESUME HERE → 사용자가 폰·태블릿으로 방 로비·팀 투표·좌석 회귀 수리를 검수하게 하고, 그 결과를 `docs/PLAN.md` §14에 새 행으로 적는다.** [사용자 협업 필요 — 검수는 사용자만 할 수 있다]
**DONE-WHEN**: `nollawa.pages.dev`가 새 빌드를 서빙하고, 검수 결과가 `docs/PLAN.md` §14에 새 행으로 기록된다(완료 행은 되돌리지 않는다 — §14 말미 규정).
**HOW→** 푸시와 배포는 끝났다(2026-08-12, `8dba34f`). 검수 전 라이브가 새 빌드인지만 확인한다 — **번들 해시가 아니라 내용으로**(Cloudflare가 자기가 빌드하므로 해시는 로컬과 영원히 다르다): `curl -s https://nollawa.pages.dev/assets/$(curl -s https://nollawa.pages.dev/ | grep -o 'index-[A-Za-z0-9_-]*\.js' | head -1) | grep -c "새 판을 시작했습니다"`
**첫 안건**: "폰과 태블릿으로 붙어서 셋만 봐 주세요 — ①방을 만들고 참여했을 때 로비에 서로가 보이는지 ②왼쪽/오른쪽 열로 팀이 갈리고 팀명이 뜨는지 ③한 팀이 2명 이상일 때 투표가 열리고, 혼자인 팀은 기다림 없이 바로 두는지."
**ANCHOR**: `304fb52` (2026-08-12; tests 71 passed) — 재개 전 `git log 304fb52..HEAD --oneline`과 `git status --porcelain`으로 대조.

---

## STATE

티켓 `M1-LOBBY` **완주**. 방 로비·팀 나누기·한 수 투표·좌석 회귀 수리가 커밋 5개로 들어갔고 테스트가 18 → **71개**로 늘었다. **푸시·배포 완료**(`8dba34f`) — 라이브가 새 빌드를 서빙한다. 남은 것은 사람 손이 필요한 실기기 검수뿐이다.

- **로드맵 좌표**: `docs/PLAN.md` §8 — M0 완료 → M1-LOBBY 완료 → 남은 것은 **M1 본편(오목·육목·리버시 + 공용 탐색 코어)**.
- **IN-FLIGHT**: 없음. 협업 세션 0, 대기 결정 0.
- **잔여물**: `collab13/cards/blocked/` 6장과 신호 9장은 전부 해소된 이력이다. 정리 불필요.
- **git 미추적 산출물**: `collab13/`(협업 제어면 상태 — `.gitignore`에 있다).
- **별도 스트림**: 협업 제어면 감시 재설계는 이 문서가 아니라 `C:\Users\apple\.collab3\design\MONITOR-PLAN.md`가 관리한다(P1 완료, 다음 P2). **프로젝트 작업과 섞지 마라 — 그것을 붙잡느라 오늘 하루가 정지했다.**

## DECIDED (재논의 금지)

- 방 로비 사양 전체 — 원문은 `docs/spec/DIRECTIVES.md` D-001·D-003·D-005·D-006, 도출본은 `docs/plan/room-lobby.md`. **[원문] 표시가 붙은 항목은 바꿀 수 없다.**
- **기능 지시는 상한 재예측까지 포함한다**(D-004). 소스를 동결하라는 반대 지시가 없는 한 구조 예산 상향을 따로 승인받지 않는다.
- **티켓은 만들면 발행한다**(D-007). "발행해"가 오면 카드를 만들어 그 자리에서 띄운다. 작업 카드는 최대 3장.
- 정본 호스트 Cloudflare Pages, 미러 GitHub Pages. 도메인 사지 않음. APK 만들지 않음. GitHub Actions 워크플로 파일 만들지 않음.

## OPEN (필요할 때만)

- `docs/plan/room-lobby.md` OPEN 절의 6건 — 방장도 준비를 누르는지, 방장 승계, 게임 변경 시 준비 초기화, 빈 칸의 모습, 이 기기 플레이의 게임 설정, 판이 끝난 뒤 돌아갈 곳. **구현이 그 답을 이미 정했을 수 있으니 코드를 먼저 확인하고 물어라.**

## TRAPS (단정 전 확인)

- **배포 반영을 번들 해시로 확인하지 마라.** Cloudflare가 자기가 빌드해서 해시가 로컬 `dist/`와 영원히 다르다. 내용 문자열로 확인한다(위 HOW→).
- **`npm test`가 `vitest`를 못 찾는다.** `./node_modules/.bin/vitest run`으로 돌린다.
- **"지금 ~하고 있다"고 말하기 전에 그 턴에 관측하라.** 이전 턴 관측을 현재형으로 옮기지 마라 — 오늘 그래서 완주한 티켓을 한 시간 반 동안 몰랐다. 예상 소요 대비 델타 판단은 `~/.claude/CLAUDE.md` §진행 확인과 시간 감각.
- **협업 감시 도구는 대화 세션을 넘지 못한다.** 새 세션·압축 후 반드시 다시 건다(`agent-monitor` 스킬).

## CONTEXT (필독 — 해당 절만)

- `docs/INDEX.md` — **여기서 시작한다.** 질문에서 문서·절로 가는 라우팅 표.
- `docs/PLAN.md` §14 — 실기기 피드백과 종결 기록, 그리고 검수 결과를 적을 자리.
- `docs/plan/room-lobby.md` — 방 로비·팀·투표 사양 전문과 구현 상태 표.
- `docs/PLAN.md` §8 M1 — 다음 단계(오목·육목·리버시)의 범위와 완료 조건.

---

**REALITY CHECK** (시작 직전 1회): `git log 304fb52..HEAD --oneline` · `git status --porcelain` · `./node_modules/.bin/vitest run` · `python C:/Users/apple/.collab3/control.py ls --root C:/Localai/boardgames`

**디스커버리**: 이 파일은 `docs/INDEX.md`의 「인수인계」 표와 `docs/PLAN.md` §8 M0 절 말미에서 가리켜진다. 스트림이 끝나면 같은 파일을 v3으로 교체하고, 다른 스트림 파일은 덮어쓰지 않는다.

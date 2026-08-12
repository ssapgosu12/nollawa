# Nollawa — 다음 작업

STREAM: nollawa-build · v1 · 작성 2026-08-12 (앞 세대 `DEPLOY-SESSION-PROMPT.md` v1 = 배포 스트림, 완결되어 이 파일로 교체)

▶ **RESUME HERE → `docs/PLAN.md` §14의 사용자 피드백 4건을 언제 처리할지 사용자에게 확정받고, 착수하기로 한 것만 담은 구현 티켓 1장을 발행한다.** [사용자 협업 필요 — 범위는 사용자가 정한다]
**DONE-WHEN**: §14 표의 4행 각각에 처리 시점이 정해지고, 그중 착수분만 담은 티켓이 `collab13/cards/`에 적재된다.
**HOW→** 판단 재료 전부가 `C:\Localai\boardgames\docs\PLAN.md` §14에 있다(피드백 4건 전문 + 보류 1건). 구현은 Codex에 위임한다(`psmux-collab` 스킬 §0).
**첫 안건**: "한 판이 끝나고 '다시 시작'을 지금은 **두 사람이 다 눌러야** 새 판이 열립니다. 한 명만 눌러도 되게 고치는 방법이 둘인데 — ⓐ 아직 안 누른 쪽 화면을 반투명 회색으로 덮고 '플레이어 기다리는 중'을 띄우거나, ⓑ 한 명이 누르면 상대 화면도 같이 초기화 — 어느 쪽으로 갈까요?"
**권고 순서**(사용자 확정 전 제안): 피드백 4건을 M1(오목·육목·리버시 추가)보다 **먼저**. 이유 한 줄 — M1이 얹을 3종이 지금과 같은 좌석·차례 흐름을 공유하므로, 흐름을 먼저 고쳐야 같은 수정을 네 번 하지 않는다.
**ANCHOR**: `0bdc580` (2026-08-12; tests 18/18 통과) — 재개 전 `git log 0bdc580..HEAD --oneline`과 `git status --porcelain`으로 대조.

---

## STATE

M0(골격 관통) **완결**. 배포까지 끝났고 사용자 실기기 검수 7항과 기계 검증 4항이 전부 통과했다.
살아 있는 주소 셋: 정본 `https://nollawa.pages.dev` · 미러 `https://ssapgosu12.github.io/nollawa/` · 릴레이 `wss://nollawa-relay.nollawa-party.workers.dev`.
Cloudflare Pages가 `master` push를 감지해 자동 재빌드한다(실측 ~40초). 미러는 커밋된 `dist/`를 서빙하므로 사람이 `git subtree push --prefix dist origin gh-pages`를 칠 때만 갱신된다.

- **로드맵 좌표**: `docs/PLAN.md` §8 M0 완료 → 다음 단계는 M1. 다만 §14 피드백이 M1보다 앞설 수 있다(위 권고 순서).
- **IN-FLIGHT**: 없음.
- **잔여물**: 없음.
- **git 미추적 산출물**: `collab13/`(협업 제어면 상태 — `.gitignore`에 있어 저장소에 올라가지 않는다).

## DECIDED (재논의 금지)

- 서비스 이름 **Nollawa**, 인게임 타이틀만 **"Nollawa party games"**.
- 정본 호스트 **Cloudflare Pages**, 미러 **GitHub Pages**. Netlify·Vercel 탈락. 도메인 사지 않음. **APK 만들지 않음.**
- **GitHub Actions 워크플로 파일을 만들지 않는다** — Cloudflare가 push를 감지해 직접 빌드하고, 미러는 `git subtree push` 한 줄이다.
- 피드백 4건은 **배포 세션이 접수만 했다**(사용자 명시). 구현 범위·시점은 미정이며, 감사·검수 발견을 승인 없이 구현 범위로 승격하지 않는다.

## OPEN (필요할 때만)

- **선공(먼저 두는 사람)을 사람이 직접 고르는 기능** — 사용자 판단은 "있으면 좋지만 필요 이상으로 복잡해질 수 있으니 천천히 고려한 뒤 결정". §14의 **선공 자동 교대 요구(판마다 번갈아)와는 다른 항목**이다. 자동 교대는 요구사항이고 이쪽만 미정.

## TRAPS (단정 전 확인)

- **미러의 빌드 해시가 정본보다 한 칸 뒤처지는 것은 정상이다.** 커밋된 `dist/`는 자기가 들어갈 커밋의 해시를 알 수 없다. 정본은 매번 새로 빌드하므로 항상 정확하다.
- **계정 조작은 전부 사용자 몫이다** — 로그인·결제수단·약관 승인. 하네스의 자동 모드 분류기가 `gh repo create`·`git push` 같은 외부 효과 명령을 차단하므로, 사용자가 프롬프트에 `! <명령>`으로 직접 친다. Git Bash라 경로는 `/c/Localai/boardgames` 형태로 써야 한다(`C:\...`는 백슬래시가 먹혀 실패한다).
- **`npm test`가 `vitest`를 못 찾는다.** `./node_modules/.bin/vitest run`으로 돌린다.
- **`npx wrangler`는 첫 실행 시 패키지를 내려받으며 y/n을 묻는다** — 비대화 셸에서 멈춘다.

## CONTEXT (필독 — 해당 절만)

- `docs/PLAN.md` §14 사용자 피드백 — **NEXT ACTION의 판단 재료 전부.** 실기기 검수에서 나온 4건과 보류 1건.
- `docs/PLAN.md` §8 M1 — 다음 단계(오목·육목·리버시)의 범위와 완료 조건.
- `docs/PLAN.md` §11 구조 예산 — 의존성 4개·공통층 820줄·CSS 500줄 상한. 승인 없이 늘리지 않는다.
- `docs/PLAN.md` §13 M0-FIX 지적 5항 + 그 말미의 교훈 — **반드시 지킬 사양은 `collab13/PREFLIGHT.md`에 올린다.** 계획서에만 있던 사양은 구현이 놓쳤다.
- `collab13/PREFLIGHT.md` 「공통 — 프로젝트 불변」 — 사용자가 고정한 제약 전문(색·방 코드 형식·AI 강도·규모).

---

**REALITY CHECK** (시작 직전 1회): `git log 0bdc580..HEAD --oneline` · `git status --porcelain` · `./node_modules/.bin/vitest run` · `curl -sI https://nollawa.pages.dev | head -1`

**디스커버리**: 이 파일은 `docs/PLAN.md` §8 M0 절 말미에서 가리켜진다. 스트림이 끝나면 같은 파일을 v2로 교체하고, 다른 스트림 파일은 덮어쓰지 않는다.

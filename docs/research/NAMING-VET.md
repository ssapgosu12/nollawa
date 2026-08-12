# 이름 충돌 실사 (NAMING-VET)

- 조사일: 2026-08-12
- 대상: 후보 28개 + 사용자 원안 "pajamas party games"
- 목적: 발상이 아니라 **사실 확인**. 이미 존재하는 서비스·상표·도메인·슬러그를 실측해
  나중에 서비스 이름을 바꾸는 비용을 없앤다.

---

## 0. 조사 방법과 그 한계 (먼저 읽을 것)

### 0.1 실제로 쓴 도구

일반 검색엔진 도구(WebSearch)는 이 세션의 호출 예산(200/200)이 이미 소진돼 쓸 수 없었다.
그래서 **봇 차단을 받지 않는 구조화 API를 1차 근거로 삼고**, 일반 웹 검색은 보조로 돌렸다.

| 축 | 사용한 소스 | 권위 수준 | 커버리지 |
|---|---|---|---|
| 상표 | **TMview** — EUIPO(유럽연합지식재산청)가 운영하는 글로벌 상표 통합 검색. 미국·EU·한국·영국·중국 등 각국 특허청 원본 데이터를 그대로 중계한다 | 높음(관청 원본) | **후보 전원** |
| 도메인 등록 | **RDAP**(Registration Data Access Protocol — WHOIS의 후속 표준. 레지스트리가 직접 응답) · .com=Verisign, .io/.games=Identity Digital, .app=Google Registry | **확정적** | **후보 전원 × 4 TLD** |
| 도메인 실사용 | 등록된 도메인 전부에 HTTPS/HTTP 요청 → 상태코드·`<title>`·본문 실측 | 확정적 | **등록된 것 전부** |
| `<slug>.pages.dev` | Cloudflare 1.1.1.1 DNS 조회 + HTTPS 응답·본문 실측 | 높음 | **후보 전원** |
| iOS 앱 | Apple iTunes Search API | 높음 | **후보 전원** |
| Android 앱 | Google Play 검색 파싱(en·ko 양쪽) | 중간 | **후보 전원** |
| 코드·오픈소스 | GitHub Search API, npm registry API | 높음 | **후보 전원** |
| 게임 유통 | Steam 앱 검색 API, itch.io 검색 | 중간 | 주요 후보 |
| 한국 시장 | `.kr` / `.co.kr` DNS + 타이틀 실측 | 중간 | 로마자 후보 전원 |
| 일반 웹 | Brave Search, Yahoo Search, DuckDuckGo | 부분적 | **아래 0.2 참조** |

### 0.2 ★ 일반 웹 검색은 후보 전원에 균일하게 돌리지 못했다

DuckDuckGo·Bing·Mojeek·Qwant·Startpage·Ecosia·SearXNG 공개 인스턴스는 전부 봇 차단
(captcha / HTTP 429 / 질의와 무관한 결과)에 걸렸고, Brave와 Yahoo만 소수 쿼리씩 통과한 뒤
IP 단위로 차단됐다. **어떤 이름에 일반 웹 검색이 실제로 돌아갔는지 아래에 명시한다.**

- **일반 웹 검색 실행됨(13개)**: Jama Party, Boardjama, Playjama, Slumber Board, Gamenook,
  Nolpan, Cozydice, Dicenic, Nollawa, Jiwaja, Pajama Table, Pannori, Hanpan
- **일반 웹 검색 미실행(15개)**: Blanket Fort, Midnight Table, Table Crew, Small Hours,
  Urikkiri, Kkiri, Damoya, Moongchi, Malpan, Bammasil, Kkulbam, Dorandoran, Osundosun,
  Ongijongi, Noribang

미실행 15개 중 Small Hours·Kkiri·Bammasil·Dorandoran·Ongijongi·Hanpan은 **웹 검색 없이도
직접 증거(운영 중인 동명 사이트·앱·유효 등록상표)로 판정이 확정**됐다. 나머지는 전부
`caution`으로 두었고, 판정을 clear로 올린 이름은 없다.

### 0.3 그 밖의 한계

- **한국 특허청(KIPRIS) 직접 조회는 API 키가 필요해 못 했다.** TMview가 KR 상표를 중계하므로
  한국 등록 상표는 상당수 잡히지만(실제로 아래에서 KR 등록 상표가 여럿 검출됐다), 최근 출원
  건은 반영이 늦을 수 있다.
- **상표는 "동일 문자열"만 판정했다.** 유사상표(발음·외관·관념 유사) 판단은 법률 영역이며
  이 문서 범위 밖이다.
- 도메인 "미등록"은 RDAP 404 = **미등록 확정**이다(추정 아님). 반대로 "등록됨"이 곧
  "서비스가 있다"는 뜻은 아니어서, 등록된 것은 전부 접속해 실물을 확인했다.

### 0.4 판정 기준

- **blocked** — 같은 이름의 서비스·앱·유효 상표가 실재하고 그것이 이 프로젝트와 같거나 인접한
  영역이다. 또는 `<slug>.pages.dev`가 이미 살아 있는 서비스에 점유돼 있다.
- **caution** — 다른 분야에 같은 이름이 있거나, 유사 이름이 있거나, 슬러그·도메인 확보에
  제약이 있거나, 확인이 부분적이다.
- **clear** — 조사한 전 축에서 충돌이 나오지 않았고 **일반 웹 검색도 실제로 돌렸다.**

---

## 1. 결론 요약

### blocked (7)

| 이름 | 결정적 사유 |
|---|---|
| **Hanpan** | **`hanpan.pages.dev`가 이미 "모임한판 — 모임 게임 허브"** 라는 한국 모임게임 웹앱이다. 그 사이트 소개문이 "모임 현장에서 폰 하나로 게임을 고르고, 30초 만에 배우고, 바로 진행하는 웹 도구 허브. 설치도 가입도 없이 링크 하나면" — 이 프로젝트와 사실상 같은 물건이 같은 슬러그를 쓰고 있다. 추가로 `hanpan.app`(운영 중, "Hanpan 한판"), Google Play `com.theknot1001.hanpan`, App Store "HANPAN", GitHub `bakesia/hanpan`(미니게임 플랫폼), `tali.kr/puzzle-hanpan`(Puzzle Hanpan·한판 고스톱 등 Andromeda Games) |
| **Gamenook** | 영국 **등록상표** GAMENOOK, 니스 **28류(게임·완구)**, Click Hill Limited, 2025-10-24 등록·2035 만료. 더해 `gamenook.co.uk`(운영 중), `gamenookshop.com`(보드게임 온라인 스토어), Game Nook(미국 보드게임 매장·Instagram @game_nook), `gamenook.net`(Mastodon 서버), `gamenook.com`은 HugeDomains 매물 |
| **Kkiri** | App Store **"KKIRI - SMART AI MESSENGER"**(주식회사 Kkirikkiri), Google Play `com.kkiri314.kkiri`, `kkiri.io` = 끼리앤파트너스(운영 중), `kkiri.com`은 HugeDomains 매물, `kkiri.kr`·`kkiri.co.kr` 등록됨 |
| **Small Hours** | `smallhours.app`(운영 중·육아 기록 서비스) + **`smallhours.games`(운영 중)** — .games를 이미 게임 브랜드가 쓰고 있다. App Store 동명 앱 2종, 미국 등록상표 SMALL HOURS(33류), **.com/.io/.app/.games 4개 전부 등록됨** |
| **Ongijongi** | **한국 등록상표 ONGiJONGi, 41류(연예·오락·게임 서비스업), 2025-07-28 등록**(이해혁) — 이 프로젝트가 속할 바로 그 류다. 43류도 동일인 등록. `ongijongi.kr` 운영 중 |
| **Dorandoran** | 한국 **유효 등록상표 3건** — **9류(소프트웨어, 오픈스택 주식회사, 2023-11-06)**, 42류(2001), 25류(2018). 게다가 **`dorandoran.pages.dev`는 "도란도란 펜션" 사이트가 점유**. 10자로 길기도 하다 |
| **Bammasil** | `bammasil.com`·`bammasil.kr`·**`bammasil.pages.dev`** 전부 "밤마실" = **유흥알바·밤알바 정보 미디어**. App Store 앱 "BAMMASIL"도 존재. 이름 선점 문제 이전에, 친구·가족이 모여 노는 물건에 얹을 수 없는 연상이다 |

### clear (4)

| 이름 | 슬러그 | 근거 요약 |
|---|---|---|
| **Nollawa** | `nollawa` | 상표 0 · 앱 0 · GitHub 0 · npm 0 · Steam 0 · itch 0 · **.com/.io/.app/.games 4개 전부 미등록** · .kr/.co.kr도 미등록 · pages.dev 비어 있음 · 웹 검색에서도 동명 주체 없음 |
| **Pajama Table** | `pajamatable` | 동일 문자열 상표 0 · 앱 0 · GitHub 0 · npm 0 · Steam 0 · itch 0 · **4개 TLD 전부 미등록** · pages.dev 비어 있음 · 웹 검색은 "잠옷 파티 테이블 장식" 소매 노이즈뿐 |
| **Slumber Board** | `slumberboard` | 동일 문자열 상표 0 · 앱 0 · GitHub 0 · npm 0 · Steam 0 · **4개 TLD 전부 미등록** · pages.dev 비어 있음 · 웹 검색 결과는 전부 *Sloth Starts to Slumber* 라는 그림책(board book) 노이즈 |
| **Pannori** | `pannori` | 동일 문자열 상표 0 · 앱 0 · GitHub 0 · npm 0 · Steam 0 · pages.dev 비어 있음 · 웹 검색에 서비스 없음(인도네시아 Pannori 해변·성씨·연세대 동아리 계정뿐). **단 `pannori.com`은 BrandBucket 프리미엄 매물이라 .com 확보에 별도 비용이 든다** |

나머지 17개는 caution이며 개별 사유는 4장에 있다.

---

## 2. 도메인·슬러그 실측표

RDAP 기준. **미등록 = 지금 살 수 있음(확정)**. 등록된 것은 전부 접속해 실물을 확인했다.

| 슬러그 | .com | .io | .app | .games | `<slug>.pages.dev` |
|---|---|---|---|---|---|
| jamaparty | 등록(빈 페이지) | 미등록 | 미등록 | 미등록 | 비어 있음 |
| boardjama | **미등록** | **미등록** | **미등록** | **미등록** | 비어 있음 |
| playjama | 등록(매물 파킹) | 미등록 | 미등록 | 미등록 | 비어 있음 |
| slumberboard | **미등록** | **미등록** | **미등록** | **미등록** | 비어 있음 |
| gamenook | 등록(HugeDomains 매물) | 미등록 | 미등록 | 미등록 | 비어 있음 |
| cozydice | 등록(에러 페이지) | 미등록 | 미등록 | 미등록 | 비어 있음 |
| dicenic | **미등록** | **미등록** | **미등록** | **미등록** | 비어 있음 |
| blanketfort | 등록(**운영 중**) | 미등록 | 등록 | 미등록 | 비어 있음 |
| midnighttable | 등록(빈 페이지) | 미등록 | 미등록 | 미등록 | **점유됨** |
| tablecrew | 등록(빈 페이지) | 미등록 | 미등록 | 미등록 | 비어 있음 |
| smallhours | 등록 | 등록 | 등록(**운영 중**) | 등록(**운영 중**) | 비어 있음 |
| pajamatable | **미등록** | **미등록** | **미등록** | **미등록** | 비어 있음 |
| urikkiri | 등록(**Substack 운영 중**) | 미등록 | 미등록 | 미등록 | **점유됨(운영 중)** |
| kkiri | 등록(매물) | 등록(**운영 중**) | 등록 | 미등록 | 비어 있음 |
| damoya | 등록(운영 중) | 미등록 | 미등록 | 미등록 | 비어 있음 |
| moongchi | 등록(**운영 중**) | 미등록 | 등록 | 미등록 | 비어 있음 |
| hanpan | 등록(서버 없음) | 미등록 | 등록(**운영 중**) | 미등록 | **점유됨(운영 중)** |
| malpan | 등록(Atom 매물) | 미등록 | 미등록 | 미등록 | 비어 있음 |
| nolpan | 등록(서버 없음) | 미등록 | 미등록 | 미등록 | 비어 있음 |
| pannori | 등록(BrandBucket 매물) | 미등록 | 미등록 | 미등록 | 비어 있음 |
| bammasil | 등록(**운영 중**) | 미등록 | 미등록 | 미등록 | **점유됨(운영 중)** |
| kkulbam | 등록(Namecheap 파킹) | 미등록 | 미등록 | 미등록 | 비어 있음 |
| dorandoran | 등록(서버 없음) | 미등록 | 등록 | 미등록 | **점유됨(운영 중)** |
| osundosun | 등록(오류 응답) | 미등록 | 미등록 | 미등록 | **점유됨(운영 중)** |
| ongijongi | 등록(서버 없음) | 미등록 | 미등록 | 미등록 | 비어 있음 |
| noribang | 등록(서버 없음) | 미등록 | 미등록 | 미등록 | 비어 있음 |
| nollawa | **미등록** | **미등록** | **미등록** | **미등록** | 비어 있음 |
| jiwaja | **미등록** | **미등록** | **미등록** | **미등록** | 비어 있음 |
| pajamaparty | 등록 | 미등록 | 등록(502) | 미등록 | 비어 있음 |
| pajamasparty | 등록(서버 없음) | 미등록 | 미등록 | 미등록 | 비어 있음 |
| pajamapartygames | **미등록** | **미등록** | **미등록** | **미등록** | 비어 있음 |

`.kr` / `.co.kr` 별도 실측 — **등록된 것만** 나열:
`kkiri.kr`·`kkiri.co.kr` / `moongchi.kr`(뭉치스토어 운영 중)·`moongchi.co.kr` /
`hanpan.kr`·`hanpan.co.kr` / `bammasil.kr`(운영 중) / `kkulbam.co.kr` /
`dorandoran.kr`·`dorandoran.co.kr` / `osundosun.kr`·`osundosun.co.kr`(경희오순도순한의원 운영 중) /
`ongijongi.kr`(운영 중) / `noribang.kr`·`noribang.co.kr`.
**미등록**: urikkiri, damoya, malpan, nolpan, pannori, nollawa, jiwaja (.kr/.co.kr 양쪽).

### 슬러그 형식 적합성

후보 28개 전부 소문자 영문자만이고 최장이 `midnighttable`(13자)이라
Cloudflare Pages 서브도메인 규칙(소문자·숫자·하이픈, 63자 이하)은 **전원 충족**한다.
문제는 형식이 아니라 **점유 여부**이고, 여기서 걸리는 것은 6개다 —
`midnighttable`, `urikkiri`, `hanpan`, `bammasil`, `dorandoran`, `osundosun`.

---

## 3. 상표 실측 (TMview)

동일 문자열 + **현재 유효한** 권리만 추렸다. 이 프로젝트와 직접 관련되는 니스 분류는
**9류(소프트웨어)·28류(게임/완구)·41류(오락 서비스)·42류(SaaS)** 이다.

| 이름 | 유효 등록 | 관련 류인가 |
|---|---|---|
| **GAMENOOK** | 영국 등록, **28류**, Click Hill Limited, 2025-10-24 | **예 — 정면 충돌** |
| **ONGiJONGi** | 한국 등록, **41류**, 이해혁, 2025-07-28 / 43류 동일인 | **예 — 정면 충돌** |
| **DORANDORAN** | 한국 등록 **9류**(오픈스택㈜, 2023-11-06) · **42류**(2001) · 25류(2018) | **예** |
| **DAMOYA** | 프랑스 등록, 30·35·39·**41**·43류, TEDDY TOUITOU, 2024-11-01 | 예(41류) — 단 프랑스 |
| SMALL HOURS | 미국 등록, 33류(주류), Phoenix Vintners | 아니오(도메인·앱이 별개 문제) |
| MALPAN | 인도 등록, 5류(제약), Panacea Biotec | 아니오 |
| JIWAJA | 말레이시아 등록, 39류(렌터카), JIWAJA RENT A CAR SDN BHD | 아니오 |
| PAJAMA PARTY | 중국 25류 등록 외 다수 — 5장 참조 | — |
| KKIRI · HANPAN · MOONGCHI · OSUNDOSUN · NORIBANG | 동일 문자열 한국 상표는 전부 **소멸(Ended)** | — |
| Boardjama · Cozydice · Dicenic · Slumber Board · Urikkiri · Pannori · Nollawa | **전 세계 동일 문자열 상표 0건** | — |
| Nolpan · Kkulbam · Pajama Table · Midnight Table · Table Crew · Jama Party · Playjama · Blanket Fort | 동일 문자열 유효 권리 없음 | — |

---

## 4. 후보별 판정

`웹`= 일반 웹 검색 실행 여부. ✅=실행, ❌=엔진 차단으로 미실행.

### 4.1 영어 조합 (A안)

| 이름 / 슬러그 | 판정 | 웹 | 발견된 충돌 | 도메인 |
|---|---|---|---|---|
| **Jama Party** `jamaparty` | caution | ✅ | Instagram @jamaparty · "spa-jama party" 같은 관용 말장난이 흔함 · **JAMA는 미국의사협회지(Journal of the American Medical Association)의 강한 약어**라 영어권에서 "자마 파티"로 안 읽힐 위험 · pajama party 상표군의 후광 안에 있음 | .com 등록(빈 페이지) / .io·.app·.games 미등록 / pages.dev 비어 있음 |
| **Boardjama** `boardjama` | caution | ✅ | 상표·앱·GitHub·npm·Steam·itch 전부 0. 다만 Yahoo 색인에 **"Steam Workshop::Boardjama"** 제목 페이지가 하나 잡혔고 이것만은 직접 열어 확인하지 못했다(Steam Workshop 검색으로는 재현 안 됨). 그 한 건 때문에 clear로 올리지 않았다 | **.com/.io/.app/.games 4개 전부 미등록** / pages.dev 비어 있음 |
| **Playjama** `playjama` | caution | ✅ | **Playgama**(`playgama.com`, HTML5 게임 포털, 자칭 월 3억 플레이어, Google Play 앱 보유)와 **한 글자 차이**인데 분야까지 같다(게임 포털). 오타 트래픽·혼동 양방향 위험 · `playjama.com`은 매물 파킹 · Instagram/X/YouTube 핸들 존재 | .com 등록(매물) / 나머지 3개 미등록 / pages.dev 비어 있음 |
| **Slumber Board** `slumberboard` | **clear** | ✅ | 없음. 웹 검색 결과가 전부 *Sloth Starts to Slumber* 라는 그림책(board book) — 동명 주체 아님 | **4개 전부 미등록** / pages.dev 비어 있음 |
| **Gamenook** `gamenook` | **blocked** | ✅ | 영국 등록상표 28류 · `gamenook.co.uk` · `gamenookshop.com`(보드게임 스토어) · Game Nook 매장 · `gamenook.net` · GitHub 4건(보드게임 발견 웹앱 포함) | .com은 HugeDomains 매물 |
| **Cozydice** `cozydice` | caution | ✅ | **Etsy 샵 `cozydice`**(주사위 가방·다이스 타워 = 테이블탑 게임 액세서리) · Instagram @cozydice · YouTube CozyDice · Thangs "CozyDice Tower" · `cozydice.com` 등록(에러 페이지). 상표·앱은 0이지만 **인접 분야(다이스 굿즈)에 활동 중인 개인 브랜드**가 있다 | .com 등록 / 나머지 3개 미등록 / pages.dev 비어 있음 |
| **Dicenic** `dicenic` | caution | ✅ | **DICENIC-SP / DICENIC-GEL** = Niktech Healthcare 제약 제품명 · GitHub `Sheyiyuan/dicenic`(중국어 스크립트 파서). 분야는 완전히 다르지만 동일 문자열이 실사용 중 · 발음이 갈린다("다이스닉" vs "디세닉") | **4개 전부 미등록** / pages.dev 비어 있음 |
| **Blanket Fort** `blanketfort` | caution | ❌ | `blanketfort.com`이 2000년부터 운영 중인 개인 사이트("Pamper Your Brain") · `blanketfortlabs.app` · GitHub BlanketFortMedia 등 3건. 영어 일상어(담요 요새)라 붐빔 · 12자 | .com·.app 등록 / .io·.games 미등록 / pages.dev 비어 있음 |
| **Midnight Table** `midnighttable` | caution | ❌ | **`midnighttable.pages.dev`가 이미 점유돼 있다**(DNS는 응답하고 HTTP 404 — 프로젝트명이 선점된 상태). 요구조건 1을 그대로는 못 맞춘다 · 13자로 가장 길다 | .com 등록(빈 페이지) / 나머지 3개 미등록 |
| **Table Crew** `tablecrew` | caution | ❌ | GitHub `sunny0511/Tablecrew` — 설명이 "An app for social meetup"으로 **컨셉이 인접**하다 · `tablecrew.com` 등록(빈 페이지) | .com 등록 / 나머지 3개 미등록 / pages.dev 비어 있음 |
| **Small Hours** `smallhours` | **blocked** | ❌ | `smallhours.app`·**`smallhours.games`** 둘 다 운영 중 · App Store 동명 앱 2종 · 미국 등록상표(33류) · GitHub 8건(SmallHoursStudio 포함) | **.com/.io/.app/.games 4개 전부 등록됨** |
| **Pajama Table** `pajamatable` | **clear** | ✅ | 없음. 웹 검색은 "pajama party table decor" 소매 상품 노이즈뿐이고 동명 주체가 없다 | **4개 전부 미등록** / pages.dev 비어 있음 |

### 4.2 한국어 오표기 (B안)

| 이름 / 슬러그 | 판정 | 웹 | 발견된 충돌 | 도메인 |
|---|---|---|---|---|
| **Urikkiri** `urikkiri` | caution | ❌ | **`urikkiri.pages.dev`가 이미 살아 있다**(스텔라이브 팬 사이트 《우리끼리》) · `urikkiri.com` = Urikkiri Substack(운영 중인 발행물) · GitHub 4건. 상표는 0이지만 **슬러그와 .com 둘 다 못 쓴다** | .com 등록(운영 중) / 나머지 3개 미등록 |
| **Kkiri** `kkiri` | **blocked** | ❌ | App Store "KKIRI - SMART AI MESSENGER"(주식회사 Kkirikkiri) · Play `com.kkiri314.kkiri` · `kkiri.io` 끼리앤파트너스 운영 중 · `kkiri.kr`·`kkiri.co.kr` 등록 · GitHub 100건 이상 | .com 매물 / .io·.app 등록 |
| **Damoya** `damoya` | caution | ❌ | **프랑스 등록상표 DAMOYA, 41류(오락) 포함, 2024-11-01** · `damoya.com` 운영 중(봇 차단) · GitHub 13건(한국 대학생 매칭 플랫폼 "damoya" 포함) · 다모여/다모아 계열은 한국에서 매우 흔한 작명 패턴이라 식별력이 약하다 | .com 등록 / 나머지 3개·.kr 미등록 / pages.dev 비어 있음 |
| **Moongchi** `moongchi` | caution | ❌ | `moongchi.com` 운영 중("Where Designers Unite", 패션 커머스) · `moongchi.kr` = 뭉치스토어 운영 중 · `moongchi.app` 등록 · GitHub 31건 · 한국 상표는 대부분 소멸이나 17류 출원 1건 계류 | .com·.app·.kr 등록 / .io·.games 미등록 / pages.dev 비어 있음 |
| **Hanpan** `hanpan` | **blocked** | ✅ | 1장 참조. **동일 슬러그에 동일 컨셉의 한국 모임게임 웹앱이 이미 운영 중** | pages.dev·`hanpan.app` 점유 |
| **Malpan** `malpan` | caution | ❌ | `malpan.com`은 Atom 프리미엄 매물 · 인도 등록상표 MALPAN(5류, Panacea Biotec) · GitHub 58건(대부분 인도 성씨 Malpani) · **Malpan은 인도 케랄라 시리아 정교회의 성직·교사 직함으로 실재하는 낱말** · 로망스어권에서 `mal-`이 부정 접두사로 읽힌다 | .com 등록(매물) / 나머지 3개·.kr 미등록 / pages.dev 비어 있음 |
| **Nolpan** `nolpan` | caution | ✅ | GitHub **`JohnPark97/Nolpan` — 설명이 "Free board game to play with friends"** 로 **이 프로젝트와 컨셉이 똑같다**(2026-03 생성·2026-05 최종 커밋·Dart/Flutter·별 0·홈페이지 없음 → 출시된 서비스는 아닌 취미 저장소) · `nolpan.com` 등록(현재 서버 없음, 과거 색인 흔적 있음) | .com 등록 / 나머지 3개·.kr 미등록 / pages.dev 비어 있음 |
| **Pannori** `pannori` | **clear** | ✅ | 서비스·앱·상표 없음. 웹에는 인도네시아 Pannori 해변, Pannori 성씨, 연세대 동아리 인스타 계정, 서울아리랑페스티벌의 "Pan-Nori Gil-Nori"(판놀이 길놀이) 정도 | .com은 **BrandBucket 프리미엄 매물**(별도 비용) / 나머지 3개·.kr 미등록 / pages.dev 비어 있음 |
| **Bammasil** `bammasil` | **blocked** | ❌ | 1장 참조. 유흥알바 정보 미디어가 .com·.kr·pages.dev를 전부 점유 | 전방위 점유 |
| **Kkulbam** `kkulbam` | caution | ❌ | 직접 충돌은 못 찾음(상표 0·앱 0·Steam 0, GitHub는 "꿀밤 스나이퍼" 게임 1건) · `kkulbam.com`은 Namecheap 최근 등록·경매 파킹, `kkulbam.co.kr` 등록 · **일반 웹 검색 미실행** · 한국어로 꿀밤은 "머리를 쥐어박는 것"이라는 뜻도 되어 의미가 갈린다 | .com·.co.kr 등록 / .io·.app·.games 미등록 / pages.dev 비어 있음 |
| **Dorandoran** `dorandoran` | **blocked** | ❌ | 1장 참조. 한국 유효 등록상표 3건(9류 소프트웨어 포함) + pages.dev 점유 | pages.dev·.app·.kr 점유 |
| **Osundosun** `osundosun` | caution | ❌ | **`osundosun.pages.dev` 점유**(경희오순도순한의원) · `osundosun.co.kr` 운영 중 · 한국·미국 상표는 소멸 · 9자 · 영어권에서 요루바계 인명(Osun)으로 읽힐 소지 | .com 등록(오류) / 나머지 3개 미등록 |
| **Ongijongi** `ongijongi` | **blocked** | ❌ | 1장 참조. **한국 등록상표 41류(오락·게임 서비스업) 2025-07-28** + `ongijongi.kr` 운영 중 | .kr 운영 중 |
| **Noribang** `noribang` | caution | ❌ | 상표는 소멸·앱 없음이나 `noribang.com`·`.kr`·`.co.kr` 전부 등록됨(서버 없음) · GitHub에 `noribang` 사용자 계정 존재 · **노리방은 노래방과 한 글자 차이라 한국에서 오독되고**, 영어권에서 `bang`이 비속어로 읽힌다 · **일반 웹 검색 미실행** | .com·.kr·.co.kr 등록 / .io·.app·.games 미등록 / pages.dev 비어 있음 |
| **Nollawa** `nollawa` | **clear** | ✅ | 서비스·앱·상표·저장소 전부 없음. 웹에는 하노이 식당 "Nollowa"(철자 다름), 찬송가 가사 "주 은혜 놀라와", 제주 숙소 소개문 정도. Instagram 핸들 하나가 있으나 서비스가 아니다 | **4개 전부 미등록 · .kr/.co.kr도 미등록** / pages.dev 비어 있음 |
| **Jiwaja** `jiwaja` | caution | ✅ | **말레이시아 등록상표 JIWAJA(39류, 렌터카)** · MangaUpdates에 "Jiwaja" 항목이 색인돼 있으나 직접 확인 실패(404) · Instagram 핸들 2개 · Lazada Malaysia 상품 · 인도네시아·말레이어에서 `jiwa`가 "영혼"이라 그쪽 문화권 단어로 읽힌다 · **한국어로 무슨 말인지 즉시 잡히지 않는 것도 약점** | **4개 전부 미등록 · .kr도 미등록** / pages.dev 비어 있음 |

---

## 5. 사용자 원안 "pajamas party games" 정밀 판정

### 5.1 결론 — 그대로는 못 쓴다. 세 가지가 각각 독립적으로 걸린다.

**(1) "PAJAMA PARTY"는 상표가 붐빈다 — 그것도 게임 류에서**

TMview에서 "pajama party"를 조회하면 총 **59건**, 상위 20건 중 **18건이 문자열 정확 일치**다.
그중 눈여겨볼 것:

- **미국 28류(게임·완구·운동구)** — OUTDOOR SUPPLY CO., INC.
- 미국 25류(의류) — Charles Komar & Sons, Inc.(미국 대형 잠옷 업체)
- **중국 25류 — 上海伊语贸易有限公司, 2016-01-07 등록(유효)**
- 미국 14류 — Franklin Mint Corporation
- **한국 35·25류 — 신민석·한현주**

즉 "pajama party"는 일상어인 동시에 **게임 류(28류)에 이미 등록례가 있는 구절**이다.
참고로 대체어 "slumber party"는 더 심해서 총 **168건**·상위 20건 **전원 문자열 일치**이고
여기에도 28류(Rapid Mounting & Finishing Co.)가 있다.

**(2) 앱 시장에서 이 구절은 이미 "여아용 드레스업 게임" 장르어다**

- App Store: **"Pajama Party– Girl Games"**(Mary.com BV), **"My City: Pajama Party Night"**(MY TOWN GAMES LTD)
- Google Play: "BFF Girls Pajama Party Fun", "My Friend's House Pajama Party", "My City : Pajama Party"

이 프로젝트는 체스·바둑·오목·요트 다이스를 성인 친구들끼리 여행 숙소에서 하는 물건인데,
"pajama party games"라는 이름은 검색에서도 연상에서도 **아동용 드레스업 게임 카테고리**로
끌려간다. 상표를 피해 가더라도 이 포지셔닝 손실은 그대로 남는다.

**(3) 영어로 비문이고, 길이 규칙도 넘는다**

- 영어에서 잠옷 파티는 관용적으로 **"pajama party"**(단수 수식)이지 "pajamas party"가 아니다.
  영어권 독자에게는 브랜드가 아니라 **오타**로 읽힌다. B안(의도적 오표기)은 **한국어를 로마자로
  옮길 때** 성립하는 전략이지, 영어 단어 자체를 틀리게 쓰는 것은 같은 효과를 내지 않는다.
- `pajamaspartygames` = 17자, `pajamasparty` = 12자. 원안 그대로는 15자 권장을 넘는다.

### 5.2 도메인·슬러그 실측 (원안 계열)

| 문자열 | .com | .io | .app | .games | pages.dev |
|---|---|---|---|---|---|
| `pajamaparty` | 등록됨 | **미등록** | 등록됨(502) | **미등록** | 비어 있음 |
| `pajamasparty` | 등록됨(서버 없음) | **미등록** | **미등록** | **미등록** | 비어 있음 |
| `pajamapartygames` | **미등록** | **미등록** | **미등록** | **미등록** | 비어 있음 |

`pajamapartygames.*`는 4개 TLD가 전부 비어 있다. 하지만 위 (1)(2)(3) 때문에
**도메인이 비었다는 사실이 이름을 쓸 수 있게 만들어 주지는 않는다.**
붐비는 것은 도메인이 아니라 구절 자체다.

### 5.3 어디를 비틀면 되는가 — 구체적으로

문제의 핵심은 `pajama`가 아니라 **`pajama` + `party` 결합**이다. 그 두 단어가 붙은
**구절 전체**가 상표·앱 양쪽에서 붐비는 단위이므로, 결합만 깨면 위험이 급감한다.

1. **`party`를 버리고 `pajama`의 분위기만 남긴다 — 가장 효율이 좋다.**
   - **`Pajama Table`** — 이번 조사에서 clear. 동일 문자열 상표 0, 4개 TLD 전부 미등록,
     `pajamatable.pages.dev` 비어 있음. "잠옷 차림으로 둘러앉은 테이블"이라 보드게임이라는
     물건과도 맞고, 흑백 선화 로고(격자 + 옷깃 선)로도 바로 성립한다.
   - `Boardjama` — 상표·앱·저장소 0에 4개 TLD 전부 미등록. 다만 4.1에 적은 Steam Workshop
     한 건이 미확인이라 caution.

2. **`pajama`를 잘라 `jama`로 만든다** — 소리는 남기고 붐비는 구절에서 빠져나오는 방법.
   단 `Jama Party`는 여전히 `party`를 달고 있어 pajama party의 후광 안에 있고,
   JAMA(미국의사협회지)라는 강한 약어와도 부딪힌다. `Boardjama` 쪽이 안전하다.

3. **B안으로 옮긴다** — 이번 조사에서 가장 깨끗했던 것은 **`Nollawa`** 다
   (전 축 0 + .com/.io/.app/.games/.kr/.co.kr 전부 미등록 + pages.dev 비어 있음).

**권하지 않는 우회**
- 철자만 비트는 방식(`Pajamaz Party`, `PJ Party`, `Pyjama Party`)은 상표 유사범위에 그대로
  들어가고, (2)의 아동 게임 연상도 벗어나지 못한다.
- `pajamapartygames.com`이 비어 있다는 이유로 쓰는 것 — **도메인 가용성은 상표 방어가 아니다.**

---

## 6. 로고 제약(흑백 선화)과의 정합

의뢰서의 "흰 바탕 + 검은 선, 로고가 흑백 선화로 성립해야 한다"를 기준으로,
충돌 실사를 통과한 이름들의 심볼화 난이도:

- **Pajama Table** — 보드 격자 + 잠옷 옷깃 선 하나. 무리 없음.
- **Slumber Board** — 보드 + 감은 눈 선 하나. 다만 영어로 "졸린 판때기"로도 읽혀 뜻이 흐리다.
- **Pannori** — 판(board)이라는 뜻이 한국인에게는 잡히고 도형화도 쉽다. `.com`이 유료 매물인 것이 유일한 흠.
- **Nollawa** — 표음 조어라 도형 근거가 없다. 로고를 **워드마크(글자)** 로 가야 하는데,
  그라데이션·복잡한 심볼이 필요 없으므로 흑백 선화 규약과는 오히려 잘 맞는다.

---

## 7. 최종 확정 전에 반드시 할 것

1. **일반 웹 검색 미완 15개**(0.2 목록)는 검색엔진 봇 차단 때문에 못 돌렸다. 최종 후보로
   좁힌 이름 1~2개는 **사람이 직접 구글·네이버에서 한 번 검색**할 것. 특히 `Kkulbam`,
   `Noribang`, `Table Crew`는 다른 증거가 약한 채로 caution에 머물러 있다.
2. **KIPRIS 직접 조회**: 한국 상표는 TMview 중계로만 봤다. 최종 후보는
   kipris.or.kr에서 직접 조회하는 편이 안전하다(특히 9류·41류의 계류 중 출원).
3. **도메인은 "지금" 비어 있을 뿐이다**: 위 RDAP 결과는 2026-08-12 시점 사실이다.
   이름을 정하면 `.com`과 `<slug>.pages.dev`를 **같은 날 선점**할 것.
4. `Boardjama`의 "Steam Workshop::Boardjama" 한 건은 Steam에 로그인해 워크숍 검색으로
   재확인하면 clear/caution이 갈린다.

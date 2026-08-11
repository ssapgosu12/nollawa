# T2 — P2P / 멀티기기 네트워크 조사

조사일: 2026-08-12 · 웹 검색 수행함(2026년 현재 상태 확인 완료)
판정 기준: ① 무료인가(과금 폭탄 없음) ② 1년 방치해도 돌아가는가 ③ 한국 모바일망(CGNAT)에서 실제로 연결되는가

---

## 0. 결론 먼저

**Cloudflare Durable Objects(DO, 지속 객체 — 방 하나당 서버 인스턴스 하나가 살아 있는 형태) 위의 WebSocket 릴레이를 1순위로 채택한다. P2P(WebRTC)는 채택하지 않는다.**

근거 한 줄: 보드게임은 초당 수백 바이트짜리 저대역 턴제 통신이라 **P2P가 주는 유일한 이득(대역폭 절약)이 0에 수렴**하는 반면, P2P가 요구하는 비용(시그널링 서버, TURN 계정, NAT 실패 처리, 호스트 이탈 처리, 재접속 시 상태 복구)은 전부 그대로 남는다.

핵심 반전 논리:
- WebRTC는 시그널링 서버 없이는 **연결 자체가 시작되지 않는다.** 즉 "서버 없음"은 애초에 성립하지 않고, "누구의 서버를 공짜로 빌릴 것인가"의 문제일 뿐이다.
- 한국 LTE/5G는 CGNAT + symmetric NAT가 기본이라 **P2P 직결이 실패하는 비율이 25~35%**다. 실패하면 TURN 릴레이를 타야 하는데, TURN을 타는 순간 트래픽은 **어차피 서버를 경유**한다. 그러면 그냥 처음부터 서버를 경유하는 편이 코드가 절반이다.
- 게다가 TURN을 타도 **방 상태는 어디에도 없다.** 스마트폰 화면이 꺼지면 연결이 죽고, 돌아왔을 때 복구해 줄 주체가 없다. 릴레이 서버(DO)는 방 상태를 들고 있으므로 재접속 = 소켓 다시 열기로 끝난다.

### 대역폭 실계산 (P2P를 정당화할 수 있는지 검증)
- 보드게임 1수 = JSON 200~500바이트. 체스/바둑/오목은 좌표 한 쌍이면 되므로 실제로는 100바이트 이하도 가능.
- 최악 가정: 8인 방, 초당 1메시지, 서버가 8명에게 팬아웃 = 초당 4KB.
- 1시간 플레이 = 약 14MB(팬아웃 포함). 실제 턴제 보드게임은 이것의 1/50 수준(수 초에 1수) → **시간당 300KB 미만.**
- 무료 TURN 한도 대입: Open Relay 20GB/월 = 약 6만 시간분. Cloudflare Realtime TURN 1,000GB 무료 = 사실상 무한.
- **결론: 대역폭은 어떤 방식을 골라도 문제가 되지 않는다.** 따라서 "P2P가 싸다"는 논거는 이 프로젝트에서 무효이고, 판정은 전적으로 **복잡도와 방치 내구성**으로 결정된다.

---

## 1. 각 선택지 판정

### (A) Cloudflare Durable Objects WebSocket 릴레이 — ★ 채택 (5/5)

**구조**: 방 코드 `ABCD12` → `env.ROOM.idFromName("ABCD12")` → 그 방 전용 DO 인스턴스 하나. 모든 참가자가 그 DO에 WebSocket으로 붙는다. DO가 방 상태(누가 있는지, 현재 판)를 SQLite 스토리지에 들고 팬아웃한다.

**무료 한도 (2026-08 공식 문서 확인)**
| 항목 | Workers Free |
|---|---|
| 요청 | 100,000 / 일 (계정 전체, 00:00 UTC 리셋) |
| DO 컴퓨트 duration | 13,000 GB-s / 일 |
| DO SQLite 스토리지 | 5 GB |
| 수신 WebSocket 메시지 과금 비율 | **20:1** (메시지 100개 = 요청 5개) |
| 송신 WebSocket 메시지 | 무과금 |
| 한도 초과 시 | **에러 반환. 과금 없음.** |

수신 20:1 덕분에 실질 한도는 **하루 약 200만 WebSocket 메시지**다. 8인 방이 하루 종일 초당 1수씩 두어도 남는다.

**"방치 가능"이 성립하는 이유 (이게 결정적)**
- Cloudflare는 **무활동으로 프로젝트를 정지시키지 않는다.** (Supabase는 7일 무활동 시 정지 — 치명적 차이)
- 무료 한도 초과 시 **청구가 아니라 에러**. 자동충전 사고 구조가 원천적으로 없다.
- WebSocket Hibernation API(하이버네이션 — 유휴 시 객체를 잠재우고 소켓만 런타임이 붙들고 있는 기능)가 2026년 기준 GA(정식 출시)이고 auto-reply-to-close가 기본값. 빈 방이 유휴 상태로 있어도 duration 과금이 안 붙는다.
- 크론·헬스체크·keepalive 스크립트가 **필요 없다.** 배포 후 손댈 것이 0.

**최소 구현 스케치**

```js
// worker.js
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const code = url.searchParams.get("room");         // 방 코드
    if (!code) return new Response("no room", { status: 400 });
    const id = env.ROOM.idFromName(code.toUpperCase());
    return env.ROOM.get(id).fetch(req);
  }
};

export class Room {
  constructor(state, env) { this.state = state; }

  async fetch(req) {
    const pair = new WebSocketPair();
    // ★ 반드시 acceptWebSocket (하이버네이션). ws.accept() 쓰면 과금 계속 발생.
    this.state.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws, msg) {
    const game = (await this.state.storage.get("game")) ?? initGame();
    const next = applyMove(game, JSON.parse(msg));      // 서버가 규칙 판정(치트 방지 겸용)
    await this.state.storage.put("game", next);
    for (const peer of this.state.getWebSockets()) {
      peer.send(JSON.stringify({ t: "state", game: next }));
    }
  }

  async webSocketClose(ws) { /* 하이버네이션 후에도 호출됨. 자리 비움 표시만 */ }
}
```

**재접속·상태 복구**: 클라이언트가 붙자마자 DO가 현재 전체 상태를 한 번 밀어준다. 화면 잠금으로 끊겼다 돌아와도 소켓만 다시 열면 완전 복구. **호스트 개념 자체가 없으므로 "호스트가 나가면?" 문제가 발생하지 않는다.** 마지막 사람이 나가도 DO 스토리지에 판이 남아 있어 재입장 가능(TTL 걸어 정리).

**약점**
- Cloudflare 계정 + `wrangler deploy` 1회 필요. 완전 무계정은 아님.
- 무료 한도가 **계정 전체** 공유 → 정적 파일은 절대 이 Worker로 서빙하지 말 것(아래 함정 참고).
- Cloudflare가 무료 티어 정책을 바꿀 이론적 위험. 다만 Workers 무료 티어는 2017년부터 유지되어 왔고, 축소 전력보다 확대 전력(2025년 DO를 무료 플랜에 개방)이 우세.

---

### (B) 순수 WebRTC DataChannel + 자체 시그널링(Worker/DO) — 3/5

DO를 어차피 배포할 거라면 시그널링만 시키고 데이터는 P2P로 보내는 안. **명백히 열등하다**:
- DO는 그대로 필요하다(시그널링용). 즉 인프라는 하나도 안 줄어든다.
- 여기에 ICE 후보 교환, offer/answer 상태기계, TURN 계정, `iceconnectionstatechange` 재협상, 실패 시 폴백 경로까지 **코드가 순증**한다.
- 25~35%의 모바일 사용자는 어차피 TURN(=서버 경유)으로 떨어진다. 얻는 게 없다.
- 방 상태 소유자가 없어 재접속 복구를 클라이언트끼리 합의해야 한다.

절약되는 것은 시간당 수백 KB. **채택 이유가 없다.**

---

### (C) Trystero (Nostr 기본) — 3/5

2026년 현재 `0.23.0`에서 대규모 리라이트. 패키지가 `trystero` + `@trystero-p2p/{nostr,mqtt,torrent,ipfs,supabase,firebase,ws-relay}`로 분할됐다. 기본 전략은 **Nostr**(수백 개 공개 릴레이가 도는 분산 메시징 네트워크)이며, 견고성 순서로 MQTT > BitTorrent > IPFS를 권한다. 데이터는 매개 네트워크를 거치지 않고 P2P E2E 암호화로 직송된다.

**장점**: 계정·배포·서버가 정말로 0. 방 코드 = 룸 이름. 20줄이면 동작한다.

```js
import { joinRoom } from 'trystero/nostr'
const room = joinRoom({ appId: 'boardgames-xyz', password: roomCode }, roomCode)
const [sendMove, getMove] = room.makeAction('move')
room.onPeerJoin(id => sendMove(currentState, id))
```

**치명적 약점**
- 시그널링을 **남의 공개 Nostr 릴레이**에 무단 의존한다. 릴레이는 개인·커뮤니티 운영이고 레이트리밋·스팸필터·폐쇄가 수시로 일어난다. Trystero 0.23 릴리스 노트 자체가 "새 공개 릴레이 목록, 반복 핑/타임아웃 처리 개선"을 개선점으로 든다 = **릴레이 이탈이 상시 현실**이라는 뜻이다. 라이브러리가 릴레이 목록을 업데이트해 주지만, 그건 **당신이 1년 뒤에 버전을 올려야 한다**는 유지보수 부채다.
- TURN은 별도로 넣어야 한다(`rtcConfig.iceServers`). 안 넣으면 한국 LTE에서 상당수 실패.
- 8인 mesh(완전 연결)면 28개 PeerConnection. 모바일에서 입장 지연·CPU 부담이 곱으로 는다.
- 호스트 이탈 시 권위 상태 소실 → 직접 호스트 마이그레이션을 짜야 한다.

**포지션**: "서버 완전 0"이 절대 요구였다면 1순위. 하지만 이 프로젝트의 최상위 목표가 방치 내구성이므로, 통제 못 하는 제3자 인프라 의존은 감점. **2순위 폴백으로만 가치 있음.**

---

### (D) PartyKit — 3/5

2024년 4월 Cloudflare에 인수됐고 현재 개발은 `cloudflare/partykit`에서 진행. 실체는 **Durable Objects 위의 얇은 DX 레이어**다. 인수 후 안내도 "자기 Cloudflare 계정에 배포하고 쓴 만큼 내라"로 정리됐다.

즉 (A)와 같은 인프라에 추상화 계층 하나가 더 얹힌 것. 얻는 것은 API 편의, 잃는 것은 **인수된 제품의 장기 유지 불확실성**과 의존성 하나. 1년 방치 기준에서 얇은 층을 하나 더 두는 것은 감점이다. **(A)를 직접 쓰는 편이 낫다.**

---

### (E) PeerJS 공개 브로커(0.peerjs.com) — 2/5

- 라이브러리(`peerjs` 1.5.5)는 살아 있고 주간 6만 다운로드로 유지보수는 "sustainable" 수준.
- **문제는 공개 브로커다.** `peers/peerjs-server` 이슈 #461 제목이 그대로 "Public server is unreliable" — 연결에 여러 번 시도가 필요하고, 붙는 데 20초가 걸린다는 보고가 다수. 공식 문서 스스로 "프로덕션이면 PeerServer를 직접 띄워라"고 안내한다.
- 브로커는 **아무나 아무 ID를 클레임할 수 있다.** 방 코드를 peer ID로 쓰면 제3자가 선점·가로채기 가능.
- 공개 브로커에는 TURN이 없다 → CGNAT 사용자는 그냥 실패.
- PeerServer를 직접 띄우면? 그건 상시 가동 서버라 프로젝트 제약 위반.

---

### (F) Firebase Realtime Database를 릴레이로 — 2/5

Spark(무료) 플랜: 1GB 저장 / 월 10GB 다운로드 / **동시 연결 100**. 초과 시 과금이 아니라 거부.

- **동시 연결 100이 벽이다.** 8인 방 12개면 소진. 성공하면 죽는 구조.
- Blaze(종량제)로 올리면 그 순간 과금 폭탄 위험이 생긴다(연결 수·다운로드 과금). 사용자 제약과 정면 충돌.
- Google 제품 정책 변경 이력이 잦고, 계정·프로젝트가 무활동으로 손대일 여지도 있다.
- 다만 릴레이로서 기능적으로는 잘 동작하고, Trystero의 `firebase` 전략으로 시그널링만 쓰는 용도라면 연결 수 압박이 훨씬 낮다.

---

### (G) Supabase Realtime — 1/5 (실격)

무료 티어에 동시 Realtime 연결 200개, DB 500MB로 스펙 자체는 나쁘지 않다. 그러나:

> **무료 플랜 프로젝트는 7일간 활동이 없으면 자동 정지된다.**

공식 문서에 명시된 정책이고, 사람들은 이걸 피하려고 GitHub Actions 크론으로 주기적 핑을 때린다. 즉 **"1년 방치"라는 최상위 목표와 정면으로 배치되며, 회피책 자체가 유지보수 부담이다.** 이 축에서 **즉시 실격**.

---

### (H) y-webrtc / Colyseus — 1/5 (용도 불일치)

- **y-webrtc**: Yjs CRDT(충돌 없는 복제 자료형 — 동시 편집 문서용) 동기화기. 보드게임은 "동시 편집"이 아니라 "순서와 규칙이 있는 턴 진행"이라 CRDT의 자동 병합이 오히려 해롭다(두 사람이 같은 칸에 두면 둘 다 반영되는 식). 게다가 기본 공개 시그널링 서버(`signaling.yjs.dev`, heroku 계열)는 과거 반복적으로 다운됐고 Heroku 무료 티어는 이미 사라졌다. **잘못된 도구.**
- **Colyseus**: 제대로 된 권위 게임서버 프레임워크지만 상시 가동 노드 프로세스가 전제. Colyseus Cloud 유료는 $15/월부터. 실시간 액션 게임용 물건이지 턴제 보드게임에 필요한 무게가 아니다.

---

## 2. TURN / NAT 통과 판정

### 실패율 (업계 통계, 2025~2026)
| 환경 | TURN 필요 비율 |
|---|---|
| 전체 WebRTC 트래픽 평균 | 15~30% (Chrome UMA 기준 relay 후보 사용 20~25%) |
| 가정 Wi-Fi 소비자앱 | 15~20% |
| **모바일 캐리어망(CGNAT)** | **25~35%** |
| 기업망/방화벽 | 30~50% |

한국 LTE/5G는 CGNAT + symmetric NAT가 표준 배치라 위 표의 **25~35% 구간에 해당**한다. 즉 **모바일 사용자 3~4명 중 1명은 P2P 직결이 안 된다.** 방 코드로 친구를 부르는 게임에서 "가끔 안 붙어요"는 곧 앱의 죽음이다.

### 무료 TURN 옵션 (2026-08 확인)
| 제공자 | 무료 한도 | 인증 | 평가 |
|---|---|---|---|
| Open Relay (metered.ca) | **20GB/월** | 계정 가입 후 API 키로 자격증명 발급. 레거시 static auth(`staticauth.openrelay.metered.ca`, secret `openrelayprojectsecret`, 포트 80/443)도 유지 | 무료 TURN 중 최선. 다만 상용사 마케팅 무료 티어라 언제든 축소 가능 |
| Cloudflare Realtime TURN | **1,000GB 무료** 후 $0.05/GB | 자격증명 만료 최대 48시간 → **48시간마다 재발급하는 코드가 필요** | 한도는 사실상 무한하나 종량제라 이론상 과금 경로 존재 |
| Google STUN (`stun.l.google.com:19302`) | 무제한 | 없음 | **STUN일 뿐 TURN이 아니다.** symmetric NAT는 못 뚫는다 |

### 판정
**TURN 대역폭 비용은 이 프로젝트에서 문제가 아니다**(위 0장 계산: 20GB = 6만 시간분). 문제는 **TURN이 또 하나의 계정·키·48시간 만료 갱신 로직이라는 점**이다. 그리고 TURN을 타는 순간 트래픽은 서버를 경유하므로 P2P의 개념적 이점도 사라진다.

> **따라서: TURN을 붙일 바에는 WebSocket 릴레이가 낫다.** 같은 "서버 경유"인데 릴레이 쪽은 ICE 협상이 없고, 상태 소유자가 있고, 재접속이 자명하고, 무료 한도 초과 시 과금 대신 에러가 난다.

---

## 3. 모바일 현실 — 화면 잠금과 재접속

**확인된 사실**: iOS Safari는 화면 잠금 또는 백그라운드 전환 즉시 WebRTC와 Web Audio를 정지시킨다. 잠긴 iOS에서 앱은 서스펜드되어 VoIP/오디오 외의 네트워크 연결(WebSocket 포함)이 유지되지 않는다. iOS 17 이후에도 "몇 초 뒤 끊기고 계속 재연결"류 보고가 이어진다. Android Chrome도 백그라운드 탭에 대해 유사한 제약을 건다.

**더 나쁜 점**: OS/브라우저가 close 이벤트를 전달하지 않는 경우가 있어, **상대 화면에는 "연결됨"으로 남은 채 응답만 없는 좀비 상태**가 된다.

### 대응 설계 (릴레이 채택 시)
1. `visibilitychange`에서 `hidden` → 재개 시 소켓 상태를 **신뢰하지 말고 무조건 재연결 시도**(readyState가 OPEN이어도 좀비일 수 있다).
2. 앱 레벨 heartbeat: 클라이언트가 15초마다 `ping`, 서버는 40초 무응답이면 해당 참가자를 "자리 비움"으로 표시(방은 삭제하지 않는다).
3. 재접속 = `?room=CODE&seat=<로컬 저장 좌석토큰>`으로 소켓 재개설 → DO가 전체 상태를 1회 스냅샷 전송 → 화면 복원. 좌석 토큰은 localStorage에.
4. 지수 백오프 재시도(1s, 2s, 4s, 최대 15s) + 온라인 이벤트(`window.online`) 트리거.
5. 턴제이므로 **끊긴 동안 아무 일도 안 일어나게** 설계 가능(제한시간 있으면 서버가 일시정지). 이것이 실시간 게임 대비 압도적 이점.

P2P였다면 이 복구를 **호스트가 누구인지 재합의하는 것부터** 해야 한다. 릴레이는 DO가 항상 그 자리에 있으므로 재연결 한 줄로 끝난다.

---

## 4. 토폴로지 — 별 vs mesh, 호스트 이탈

| | mesh (완전 연결) | 별 (호스트 중심 P2P) | **릴레이(DO)** |
|---|---|---|---|
| 8인 연결 수 | 28 | 7 | 8 (전부 서버로) |
| 입장 지연 | ICE 협상 × 28, 모바일에서 체감 큼 | 7회 | 1회, ~100ms |
| 권위 상태 | 없음(합의 필요) | 호스트 | 서버 |
| 호스트 이탈 | 부분 붕괴 | **방 사망** → 호스트 마이그레이션 구현 필요 | **해당 없음** |
| 치트 방지 | 불가 | 호스트 신뢰 | 서버가 규칙 검증 가능 |
| 구현 난이도 | 높음 | 중 | **낮음** |

P2P를 쓴다면 2~8인 보드게임에서는 **무조건 별(호스트 중심)**이다. mesh는 28연결 협상 비용과 상태 합의 문제로 답이 아니다. 그러나 별을 고르면 **호스트 이탈 = 방 사망**이라는 구조적 결함을 떠안고, 호스트 마이그레이션(누가 다음 호스트인지 결정 + 상태 이관 + 전원 재연결)을 직접 구현해야 한다. 이건 이 프로젝트가 감당할 복잡도가 아니다.

**릴레이는 이 문제 자체가 존재하지 않는다.** 방 = DO 인스턴스이고, 참가자 전원이 나가도 DO 스토리지에 판이 남는다.

---

## 5. 최종 권고 아키텍처

```
[정적 파일] GitHub Pages 또는 Cloudflare Pages   ← PWA 셸, 게임 로직, AI
        (Cloudflare Workers 무료 요청 한도와 분리할 것)
                    │
                    │  (c) 멀티 모드에서만
                    ▼
[릴레이]  Cloudflare Worker + Durable Object
          방 코드 → idFromName(코드) → 방 전용 인스턴스
          WebSocket Hibernation, 상태는 DO SQLite
```

- (a) 공용, (b) 스플릿, (d) 점수판은 **네트워크가 전혀 필요 없다.** 네트워크 코드는 (c)에만 격리한다.
- 게임 로직은 `applyMove(state, move) -> state` 순수 함수로 짜서 로컬/릴레이가 **같은 함수를 공유**하게 한다. 이러면 멀티는 "그 함수를 서버에서도 돌린다"가 전부가 된다.
- 전송 계층은 `Transport` 인터페이스(`connect/send/onMessage/onPeerChange`) 뒤로 숨긴다. Cloudflare가 정책을 바꾸면 **Trystero 어댑터로 갈아끼우는 것이 파일 하나 교체**가 되도록.
- 폴백 순서: DO 릴레이 실패 → (선택) Trystero/Nostr → 실패 시 "같은 기기에서 공용 모드로 하세요" 안내.

### 방 코드 설계
- 6자리 대문자+숫자(혼동 문자 `O/0/I/1` 제외) → 약 32^6 ≈ 10억. 무작위 스캔 방어에 충분.
- DO는 `idFromName(코드)`로 자동 생성되므로 방 목록·DB가 **불필요**하다.
- 빈 방은 마지막 close 후 alarm으로 24시간 뒤 storage 삭제(5GB 한도 보호).

---

## 6. 함정 목록 (실제 사고 사례 기반)

1. **Supabase 무료 프로젝트 7일 무활동 자동 정지.** 회피책으로 GitHub Actions 크론 핑을 돌리는 게 관행화돼 있다 — 즉 "무료지만 방치 불가"다. 이 프로젝트에선 즉시 실격 사유.
2. **Glitch가 2025-07-08 무료 호스팅을 완전 종료했다.** Heroku 무료 티어 폐지의 재판. "지금 무료인 남의 서버"는 실제로 사라진다 — 공개 브로커 의존은 시한폭탄이다.
3. **PeerJS 공개 브로커는 아무나 아무 ID를 클레임할 수 있다.** 방 코드를 peer ID로 쓰면 선점·하이재킹이 가능하고, 연결에 20초가 걸리는 사례가 이슈로 보고돼 있다.
4. **Trystero 0.23에서 패키지가 `@trystero-p2p/*` 스코프로 쪼개졌다.** 무심코 버전을 올리면 import 경로가 전부 깨진다. 1년 방치가 목표라면 버전 고정 + lockfile 커밋이 필수다.
5. **공개 매개(Nostr/BitTorrent)에 방 코드를 평문 토픽으로 넣으면 아무나 같은 방에 들어온다.** 반드시 `appId` + 해시된 룸 키 + Trystero `password`(E2E)를 함께 쓸 것. 6자리 코드는 이론상 전수 스캔 가능하다.
6. **iOS 화면 잠금 시 close 이벤트가 안 오는 경우가 있어 상대에겐 "접속 중"으로 남는다.** `readyState === OPEN`을 신뢰하면 영원히 상대 턴을 기다리는 화면이 된다. 앱 레벨 heartbeat 없이는 감지 불가.
7. **Cloudflare 무료 100,000 요청/일은 계정 전체 한도다.** 정적 자산까지 같은 Worker로 서빙하면 게임이 아니라 아이콘·폰트 요청이 한도를 태운다. 정적은 GitHub Pages 또는 Pages로 반드시 분리.
8. **DO에서 `ws.accept()`를 쓰면 하이버네이션이 안 된다.** 반드시 `this.state.acceptWebSocket(ws)`. 전자를 쓰면 빈 방이 duration(GB-s)을 계속 태워 무료 한도를 하루 만에 소진한다. 그리고 하이버네이션 후 **인메모리 변수는 전부 사라지므로** 방 상태는 반드시 `state.storage`에.
9. **Cloudflare Realtime TURN 자격증명은 최대 48시간 만료다.** "한 번 발급해서 상수로 박아두기"가 통하지 않는다 — 갱신 코드가 곧 유지보수 부담이며, 이를 빼먹으면 이틀 뒤 조용히 전부 연결 실패한다.
10. **Firebase Spark의 "동시 연결 100"은 방이 아니라 소켓 수다.** 8인 방 12개면 13번째 방부터 연결 거부. 성공할수록 죽는 한도이고, 풀려면 Blaze 종량제로 넘어가야 해서 과금 폭탄 경로가 열린다.

---

## 출처

- [PeerJS public server is unreliable (peers/peerjs-server #461)](https://github.com/peers/peerjs-server/issues/461)
- [peerjs npm 패키지 상태](https://www.npmjs.com/package/peerjs)
- [Trystero README / 전략과 릴레이 신뢰도](https://github.com/dmotz/trystero/blob/main/README.md)
- [Trystero 0.23.0 릴리스 노트](https://github.com/dmotz/trystero/discussions/157)
- [Cloudflare Durable Objects 가격/무료 한도](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Cloudflare Workers 가격](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare Realtime TURN FAQ](https://developers.cloudflare.com/realtime/turn/faq/)
- [Open Relay Project 무료 TURN](https://www.metered.ca/tools/openrelay/)
- [Supabase 무료 프로젝트 일시정지 정책](https://supabase.com/docs/guides/platform/free-project-pausing)
- [Firebase Realtime Database 한도](https://firebase.google.com/docs/database/usage/limits)
- [y-webrtc 공개 시그널링 서버 다운 이슈](https://github.com/yjs/y-webrtc/issues/43)
- [Cloudflare, PartyKit 인수](https://blog.cloudflare.com/cloudflare-acquires-partykit/)
- [Glitch 무료 호스팅 종료(2025-07-08)](https://blog.glitch.com/post/changes-are-coming-to-glitch)
- [WebRTC 모바일 데이터 실패 / TURN 필요 비율](https://icetester.org/blog/blog)
- [iOS Safari 백그라운드 WebRTC 정지](https://developer.apple.com/forums/thread/774239)
- [Colyseus 가격](https://colyseus.io/pricing/)

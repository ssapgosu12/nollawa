# T4 — 반응형 UI (잘림 없음 · 폰트 스케일 · 정사각 보드 · 스플릿 · 색 팔레트)

조사일 2026-08-12 · 웹 검색 수행함(하단 출처) · 대비비·색약 시뮬레이션 수치는 본 문서에서 직접 계산(sRGB→선형 변환, WCAG 2.x 공식, Viénot 1999 이색각 행렬)

판정 기준 = **"1년 방치해도 돌아가는가"** + **"무료인가"**. CSS/HTML 표준 기능은 비용 0·유지보수 0에 수렴하므로,
이 축에서 감점 대상은 "빌드 도구·런타임 의존성·JS로 브라우저 버그를 뒤쫓는 코드"다.

---

## 0. 결론 요약 (한 화면)

| 문제 | 채택안 |
|---|---|
| 뷰포트 높이 | `100svh`(고정) + `dvh`는 쓰지 않음. `vh` 폴백 1줄. JS `--vh` 해킹 폐기 |
| 안전 영역 | `viewport-fit=cover` + `env(safe-area-inset-*)`를 **토큰화**해서 `max(12px, env(...))`로만 사용. JS로 읽지 않음 |
| 폰트 스케일 | `html`에 px font-size 금지 · 전부 `rem`/`clamp()` · `text-size-adjust` **선언하지 않음** · `body{font: -apple-system-body}`(iOS Dynamic Type) + `<meta name="text-scale" content="scale">`(Chrome) |
| 확대 | **막지 않는다.** `user-scalable=no` 금지(iOS는 무시, 안드로이드만 망가짐). 보드에만 `touch-action: pinch-zoom` |
| 정사각 보드 | 부모 `flex:1; min-height:0` + 보드 `aspect-ratio:1; width:min(100%, 계산된 높이)`, 내부는 **SVG `viewBox`** (Canvas 아님) |
| 작은 교차점 | 셀 피치 < 32 CSS px면 **드래그 프리뷰 + 별도 확정 버튼**(2단계) 자동 활성 |
| 스플릿 | `transform: rotate(180deg)` 한 패널에만. 회전 서브트리 안에 **오버레이·네이티브 컨트롤·스크롤 영역·텍스트 입력 금지** |
| 팔레트 | 색은 **보조 채널**. 정본 식별 = **모양(●■▲◆) + 숫자(1~4)**. 모든 말에 검정(다크에선 흰) 2px 외곽선 |
| 다크 모드 | 흰 바탕이 기본·정본. 3상태 토글(밝게/어둡게/시스템) + 토큰 6개 스왑. `<meta name="color-scheme">` **필수**(안 쓰면 안드로이드가 멋대로 어둡게 만든다) |

---

## 1. 뷰포트 단위 — `100vh` 함정과 `svh/lvh/dvh`

### 1.1 사실관계 (2026-08 확인)

- `svh` / `lvh` / `dvh` = Chrome 108+, Edge 108+, Firefox 101+, Safari 15.4+, Opera 94+, Samsung Internet 21+.
  전역 지원 90% 초과. **2026년 기준 무조건 써도 되는 기능**이다.
- iOS Safari에서 `vh`는 `lvh`처럼 동작한다 = "주소창이 접힌 상태"의 큰 높이. 그래서 주소창이 보이는
  최초 로드 시 `height:100vh` 요소가 화면보다 커져 하단이 잘린다. **이것이 사용자가 말한 "잘림"의 1번 원인이다.**
- `svh` = 브라우저 UI가 **최대로 펼쳐진** 상태의 작은 높이 → 어떤 상태에서도 잘리지 않는다(대신 UI가 접히면 아래에 여백).
- `dvh` = 실시간으로 변한다. **스크롤할 때마다 레이아웃이 리플로우**되어 보드가 미세하게 커졌다 작아졌다 한다.
  게임 보드에는 최악이다(말 위치가 손가락 아래에서 움직인다).

### 1.2 채택: `svh` 고정

```css
/* app-shell.css */
.app {
  /* 1) 구형 폴백: 반드시 먼저 */
  height: 100vh;
  /* 2) 실제로 적용될 값 */
  height: 100svh;

  display: flex;
  flex-direction: column;
  overflow: hidden;              /* 페이지 자체는 절대 스크롤하지 않는다 */
}

html, body { margin: 0; height: 100%; overscroll-behavior: none; }
body { background: var(--bg); }  /* Safari 26이 루트 배경색을 샘플링한다 — 반드시 명시 */
```

- 왜 `dvh`가 아닌가: 우리 앱은 `overflow:hidden`이라 **주소창이 접힐 일이 거의 없다**. 그러면
  `svh == dvh == lvh`가 되어 차이가 사라진다. 차이가 나는 순간(키보드, iOS 26 툴바 애니메이션)에는
  `dvh`가 리플로우를 만들고 `svh`는 안 만든다. → `svh`가 지배적으로 우월.
- `lvh`는 쓸 일 없음(잘림을 유발하는 쪽).
- **JS `--vh = window.innerHeight * 0.01` 해킹은 폐기한다.** 2020년식 해법이고, resize 리스너 +
  iOS 키보드 예외 처리 + orientationchange 타이밍 버그를 영구히 떠안는다. `svh` 한 줄이 대체한다.
  (유지보수 0 원칙에 정면으로 부합)

### 1.3 키보드 (방 코드 입력)

- `interactive-widget=resizes-content`는 **Chrome 108+ / Firefox 132+만** 지원. Safari 미지원.
- 우리는 `overflow:hidden` 전체화면 셸이므로 키보드가 뜨면 iOS는 화면을 위로 밀어 올린다(스크롤 아님).
  → **방 코드 입력 화면만은 `.app`의 `overflow:hidden`을 풀고 일반 문서 흐름으로 만든다.** 전체화면 셸 안에
  입력 필드를 넣지 않는 것이 근본 해법.
- 그래도 넣어야 하면 `visualViewport` 이벤트로 하단 바를 올리는 대신 **입력 필드를 화면 상단에 배치**한다(코드 0줄).

---

## 2. 안전 영역 (노치 · 홈 인디케이터 · 펀치홀)

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

```css
:root {
  /* 두 번째 인자 = 폴백. viewport-fit=cover가 없거나 지원 안 하면 0px */
  --sa-t: env(safe-area-inset-top, 0px);
  --sa-r: env(safe-area-inset-right, 0px);
  --sa-b: env(safe-area-inset-bottom, 0px);
  --sa-l: env(safe-area-inset-left, 0px);

  /* 실사용은 항상 max()로: 인셋이 0인 기기에서도 여백이 유지된다 */
  --pad-t: max(0.75rem, var(--sa-t));
  --pad-b: max(0.75rem, var(--sa-b));
  --pad-x: max(0.75rem, var(--sa-l), var(--sa-r));
}

.app { padding: var(--pad-t) var(--pad-x) var(--pad-b); box-sizing: border-box; }
```

### 정확한 사용법 규칙

1. `viewport-fit=cover`를 켜는 순간 **모든 패딩은 내 책임**이 된다. 브라우저 기본 여백과 섞지 말 것.
2. **가로 모드(landscape)에서 left/right가 진짜 문제다.** 아이폰을 눕히면 노치가 보드의 왼쪽(또는 오른쪽)을
   먹는다. 태블릿 가로 + 폰 가로 모두 `--sa-l/--sa-r`를 반드시 적용해야 한다. 세로만 테스트하고 넘어가면 여기서 잘린다.
3. **인셋 값은 동적이다.** iOS Safari는 하단 툴바가 보일 때 `safe-area-inset-bottom`을 0으로 준다(툴바가
   이미 홈 인디케이터 영역을 덮으므로). 툴바가 접히면 34px이 된다. → **JS로 한 번 읽어서 캐시하면 반드시 틀린다.**
   CSS `env()`로만 쓰면 브라우저가 알아서 갱신한다.
4. `env()`는 **미디어 쿼리 조건에서 사용할 수 없다**(`@media (min-height: env(...))` 불가). `calc()`/`max()` 안에서만.
5. iOS 26 Liquid Glass: 하단 탭바가 콘텐츠 **위 레이어**에 뜬다. `position:fixed` 요소의 배경색을
   Safari가 샘플링해 툴바를 착색하며, `opacity:0`으로 숨긴 요소도 샘플링 대상이다.
   → 모달 백드롭은 `opacity:0`이 아니라 **`display:none`**으로 숨긴다.

---

## 3. 폰트 스케일 & 확대

### 3.1 절대 규칙

```css
/* 금지 */
html { font-size: 16px; }        /* ← 사용자의 브라우저 글꼴 크기 설정을 무력화 */
html { -webkit-text-size-adjust: 100%; }  /* ← Chrome Android의 OS 글꼴 크기 반영을 죽인다 */
```

- `html`의 font-size는 **건드리지 않는다**(= 브라우저 기본 100%). 이것만으로 데스크톱/안드로이드
  브라우저 글꼴 설정이 전부 반영된다.
- `-webkit-text-size-adjust: 100%`는 normalize.css·Tailwind preflight에 **기본 포함**되어 있다.
  프레임워크 리셋을 그대로 가져오면 접근성이 조용히 깨진다. → **CSS 리셋을 직접 손으로 쓴다**(15줄이면 충분).
- 모든 크기는 `rem`. `px`는 1px 보더/헤어라인에만.

### 3.2 OS 글꼴 크기(Dynamic Type / Android font scale) 반영

브라우저별로 동작이 다르다(2026-02 Adrian Roselli 정리 기준):

| 브라우저 | OS 글꼴 크기 반영 | 필요한 작업 |
|---|---|---|
| Firefox | 자동 | 없음 |
| Safari (iOS) | 안 함 | `body { font: -apple-system-body; }` |
| Chrome (Android) | 안 함(기본) | `<meta name="text-scale" content="scale">` + px 단위 회피 |

```html
<meta name="text-scale" content="scale">
```

```css
body {
  font: -apple-system-body;                 /* iOS Dynamic Type 훅 */
  font-family: system-ui, -apple-system, "Segoe UI", Roboto,
               "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
  line-height: 1.45;
}
/* -apple-system-body가 있는 터치 환경(=iOS)에서만 루트를 100%로 되돌린다 */
@supports (font: -apple-system-body) and (not (-webkit-touch-callout: default)) {
  :root { font-size: 100%; }
}
```

> `<meta name="text-scale">`는 신규 표준 추진 중인 기능이다. **없어도 앱은 정상 동작**하고(진행적 향상),
> 있으면 Chrome이 OS 설정을 반영한다. 1년 방치 리스크 0.

### 3.3 200% 확대에서도 안 깨지게 하는 레이아웃 규칙

- 텍스트 컨테이너에 **고정 `height` 금지**. `min-height` + `padding`만.
- 버튼 줄은 `flex-wrap: wrap` + `gap`. 한 줄에 억지로 밀어 넣지 않는다.
- 제목·라벨은 `clamp()`로 상·하한을 잡되 **하한은 rem 기준**:
  ```css
  --fs-title: clamp(1.125rem, 1rem + 1.2vw, 1.75rem);
  --fs-body:  clamp(0.9375rem, 0.875rem + 0.4vw, 1.125rem);
  ```
  `clamp()`의 중간항에 `vw`만 쓰면(예: `clamp(1rem, 4vw, 2rem)`) **사용자 확대에 반응하지 않는다** —
  vw는 확대해도 그대로다. 반드시 `rem + vw` 합 형태로 쓴다.
- 검수 기준: **320 CSS px 폭 · 텍스트 200%** 에서 가로 스크롤 없이 모든 기능 도달(WCAG 1.4.10 Reflow / 1.4.4).

### 3.4 확대(pinch zoom)를 막아야 하는가 → **막지 않는다**

- iOS 10 이후 Safari는 `user-scalable=no` / `maximum-scale=1`을 **무시**한다. 즉 이걸 넣어도
  아이폰에서는 아무 효과가 없고, **안드로이드에서만 저시력 사용자의 확대를 차단**한다. 순손실이다.
- WCAG 1.4.4 위반이기도 하다.
- 대신 **필요한 곳에만 CSS로** 제어한다:

```css
button, .tap { touch-action: manipulation; }  /* 더블탭 확대만 제거 → 탭 지연 없음. 핀치는 살아있음 */
.board       { touch-action: pinch-zoom; }    /* 한 손가락 팬 차단(=내 드래그 로직 동작) + 두 손가락 핀치는 허용 */
```

- `touch-action: none`은 핀치까지 죽이므로 보드에는 쓰지 않는다. `pinch-zoom` 단독 값이 정확히
  "브라우저 팬은 끄고 확대는 살린다"를 준다.
- **입력 필드는 `font-size: 1rem`(≥16px) 이상.** 미만이면 iOS가 포커스 시 자동 확대하고,
  블러 후 원래대로 안 돌아온다. 방 코드 입력창이 정확히 이 함정에 걸린다.

---

## 4. 정사각 보드 레이아웃

### 4.1 셸 구조 (세로 폰 기준)

```html
<div class="app">
  <header class="bar">…</header>
  <main class="stage"><div class="board"><svg viewBox="0 0 19 19">…</svg></div></main>
  <footer class="bar">…</footer>
</div>
```

```css
.bar   { flex: 0 0 auto; }
.stage {
  flex: 1 1 auto;
  min-height: 0;          /* ★ 없으면 flex 자식이 콘텐츠 크기 이하로 안 줄어들어 하단이 잘린다 */
  min-width: 0;
  display: grid;
  place-items: center;
  padding: 0.5rem;
}
.board {
  aspect-ratio: 1 / 1;
  /* 폭·높이 중 작은 쪽에 맞춰 정사각 유지. 브라우저가 알아서 계산한다 */
  width:  min(100%, calc(100% * 1));     /* 실제로는 아래 한 줄이면 충분 */
  max-width: 100%;
  max-height: 100%;
  height: auto;
  block-size: auto;
  container-type: inline-size;           /* 보드 내부 컴포넌트용 컨테이너 쿼리 */
}
/* 위 4줄의 요체: aspect-ratio + max-width:100% + max-height:100% 조합이면
   추가 JS 없이 "부모의 짧은 변에 내접하는 정사각형"이 나온다. */
```

- `min-height: 0`은 **flex 레이아웃에서 잘림을 만드는 1번 원인**이다. 기본값 `min-height:auto`가
  자식 콘텐츠보다 작아지는 것을 막아 컨테이너가 뷰포트를 넘어간다. 반드시 넣는다.
- 보드 내부는 **SVG + `viewBox="0 0 19 19"`**. 좌표계가 논리 단위라 픽셀 계산이 아예 없다.
  - Canvas 대비 이점: `devicePixelRatio` 곱셈·리사이즈 시 재드로잉·고DPI 흐림 처리가 전부 불필요.
    1년 방치 관점에서 **깨질 코드 자체가 없다.**
  - 히트 테스트: `evt.target.dataset.cell` (교차점마다 투명 `<rect>`) 또는
    `pt.matrixTransform(svg.getScreenCTM().inverse())`. 후자는 회전·스케일을 자동 보정한다.

### 4.2 19x19을 390x844 폰에서

- 가용 폭 = 390 − 좌우 패딩(0.5rem×2 = 16) = 374 CSS px. 셀 피치 = 374/19 ≈ **19.7px**.
- WCAG 2.5.8(AA) 최소 타깃 24×24, AAA 44×44 → **직접 탭은 요구를 충족할 수 없다.**
  물리적으로도 성인 손가락 접촉면(16~20mm ≈ 60~75 CSS px)보다 훨씬 작다.

**채택 해법: "드래그 프리뷰 + 확정" 2단계** (WCAG 2.5.7 Dragging Movements의 대안 경로도 함께 제공)

1. `pointerdown` → 가장 가까운 교차점에 **고스트 돌**(반투명, 실선 외곽) 표시.
2. `pointermove` → 손가락을 끌면 고스트가 따라 이동. 손가락 위치와 고스트 위치는 동일하되,
   **확대 루페(지름 약 96px)를 손가락 위 약 80px 지점에 띄워** 가려진 부분을 보여준다.
3. `pointerup` → 고스트 확정 아님. 하단 확정 바가 활성화(`착수` 버튼, 높이 3rem = 48px 이상, 엄지 도달 영역).
4. `착수` 탭 → 실제 착수. 다른 교차점을 다시 누르면 고스트만 이동.
5. 대안 경로(드래그 불가 사용자용): 좌표 스테퍼 `A↔T / 1↔19` 두 개 + `착수`. 순수 버튼 조작.

- **자동 활성 조건**: `cellPitchPx < 32` 일 때만 2단계 모드. 오목(15x15)·체스(8x8)·요트는
  피치가 충분하므로 원탭 착수. 조건 계산은 `ResizeObserver` 1개, 코드 10줄.
- 손가락 오프셋(Little Go의 "stone distance from fingertip") 옵션도 설정에 노출하면 좋으나 필수 아님.
- **선택지 B(핀치 줌 + 팬)** 은 상태(줌 배율·오프셋·경계 클램프·더블탭 리셋)가 늘어나 버그 표면이 커진다.
  2단계 확정이 이미 정확도를 해결하므로 **19x19에만 선택적 부가 기능**으로 남기고 기본은 끈다.

### 4.3 태블릿 가로

- 가로에서는 **높이가 제약**이다. 상단/하단 바를 두면 보드가 급격히 작아진다.
  → 미디어 쿼리로 **컨트롤을 좌우 사이드 레일로 이동**한다.

```css
@media (orientation: landscape) {
  .app { flex-direction: row; }
  .bar { flex-direction: column; width: clamp(4rem, 14vw, 9rem); }
  .stage { padding-inline: 0.5rem; }
}
```

- 태블릿 가로에서 19x19 피치: 1024×768 기준 높이 768 − 패딩 16 = 752 → 752/19 ≈ **39.6px**.
  32px 임계를 넘으므로 **원탭 착수로 자동 전환**된다(같은 코드가 기기별로 다르게 동작).
- 아주 큰 화면에서 보드가 과하게 커지는 것을 막으려면 `.board { max-width: 46rem; }` 정도의 상한.
  단 상한을 rem으로 두면 글꼴 확대 시 함께 커진다(의도된 동작).

---

## 5. 스플릿 스크린 (마주 보고 플레이 — 한쪽 180° 회전)

```css
.split { display: grid; grid-template-rows: 1fr 1fr; height: 100svh; }
.split > .seat { min-height: 0; overflow: hidden; }
.split > .seat--opposite { transform: rotate(180deg); }
/* 또는 개별 속성: rotate: 180deg;  (2022+ 전 브라우저 지원, 동일 효과) */
```

### 함정 (실제로 사람들이 걸려 넘어진 것)

1. **`transform`이 걸린 조상은 `position: fixed` 자손의 컨테이닝 블록이 된다.**
   회전 패널 안에 넣은 토스트·모달·드롭다운이 뷰포트가 아니라 **회전된 패널 기준으로, 거꾸로** 뜬다.
   → **모든 오버레이는 회전 서브트리 밖(`.app` 직속)에 렌더링**한다. 구조 규칙으로 못 박을 것.
2. **네이티브 컨트롤은 회전을 따라오지 않는다.** `<select>` 드롭다운, `<dialog>`의 일부 구현,
   날짜/숫자 피커, iOS 키보드, 텍스트 선택 핸들·확대경은 전부 **정방향으로 그려진다.**
   → 회전 패널 안에는 **텍스트 입력과 네이티브 위젯을 절대 넣지 않는다.** 숫자 입력이 필요하면
   직접 그린 키패드(버튼 12개)를 쓴다. 점수판이 이 규칙에 정면으로 걸린다.
3. **스크롤 방향이 뒤집힌다.** 회전 패널 안 스크롤 영역은 아래로 밀면 위로 간다. 사용자는 고장으로 인식한다.
   → 회전 패널은 **스크롤 없이 화면에 딱 맞게** 설계(`overflow:hidden` + 내용 축소).
4. **`scrollIntoView()`·포커스 자동 스크롤이 엉뚱한 방향으로 튄다.** 회전 패널 안에서는 호출하지 않는다.
5. **수동 좌표 계산이 반드시 틀린다.** `getBoundingClientRect()` + `clientX/Y`로 셀 인덱스를 구하면
   회전된 쪽에서 좌우상하가 반전된다. → SVG의 `getScreenCTM().inverse()`를 쓰거나,
   교차점마다 실제 DOM 노드를 두고 `event.target`으로 판정한다(브라우저 히트테스트는 회전을 정확히 처리한다).
   **이것이 스플릿에서 SVG-DOM 방식을 택해야 하는 결정적 이유**다(Canvas였다면 좌표를 직접 역변환해야 함).
6. **`backdrop-filter` + `transform` 조합은 Safari에서 깜빡임·잔상**을 만든다. 회전 패널 안에서 금지.
7. `will-change: transform`을 습관적으로 붙이면 **레이어 승격으로 텍스트가 흐려진다**(특히 저DPI 태블릿).
   180° 회전은 정적이므로 `will-change` 불필요.
8. **회전은 시각만 바꾼다 — 안전 영역은 안 바뀐다.** 위쪽 좌석(회전된 쪽)의 "아래"는 화면의 "위"이고
   거기엔 노치가 있다. `--sa-t`를 회전 패널의 **논리적 하단** 패딩에 적용해야 한다.
   ```css
   .seat--opposite { padding-block-end: var(--pad-t); padding-block-start: var(--pad-b); }
   ```

---

## 6. 디자인 시스템 — 흰 바탕·검정 선·플레이어 4색

### 6.1 계산된 사실 (본 문서에서 직접 산출)

WCAG 2.x 대비비, sRGB 상대휘도 기준.

| 색 | vs 흰색 | vs 검정 |
|---|---|---|
| 순수 노랑 `#FFFF00` | **1.07** | 19.56 |
| 금색 `#FFC800` | **1.55** | 13.51 |
| 순수 빨강 `#FF0000` | 4.00 | 5.25 |
| 초록 `#00A000` | 3.48 | 6.03 |
| 파랑 `#0047AB` | 8.44 | 2.49 |

→ **노랑은 흰 바탕에서 어떤 명도로도 3:1(WCAG 1.4.11 비텍스트 대비)을 만족시키지 못한다.**
3:1을 넘기려면 `#A66A00`(4.48) 수준까지 어두워져야 하는데, 그건 이미 갈색이지 노랑이 아니다.

색약 시뮬레이션(Viénot 1999, CIE76 ΔE):

| 조건 | 빨강 vs 초록 ΔE76 | 판정 |
|---|---|---|
| 정상 색각 | 112.3 | 명확히 구분 |
| 중색약(deuteranopia) | 95.1 | 구분됨(명도차 덕분) |
| **적색약(protanopia)** | **11.3** | **사실상 동일색** |

또한 4색의 **상호 휘도 대비**(= 흑백 인쇄/모노 화면 구분 가능성)는 순진한 팔레트에서
빨강↔초록 **1.03~1.21** — 회색조로 보면 완전히 같은 색이다.

**결론: 사용자가 지정한 팔레트는 색만으로는 플레이어를 구분시킬 수 없다. 이건 취향이 아니라 계산된 사실이다.**

### 6.2 해법 — 색을 보조 채널로 강등

**정본 식별자 = 모양 + 숫자. 색은 3번째 채널.**

| 플레이어 | 모양 | 숫자 | 라이트 fill | 다크 fill |
|---|---|---|---|---|
| P1 | ● 원 | 1 | `#FFC700` | `#FFD84D` |
| P2 | ■ 사각 | 2 | `#EE5B54` | `#FF7A73` |
| P3 | ▲ 삼각 | 3 | `#17693B` | `#3FBF7A` |
| P4 | ◆ 마름모 | 4 | `#102A6E` | `#6E9BFF` |

- **모든 말·칩·라벨에 2px 외곽선**(라이트=`#000`, 다크=`#FFF`). 외곽선이 대비를 책임지므로
  fill의 대비비는 자유로워진다(WCAG 1.4.11은 인접색과 3:1을 요구하는데, 검정 외곽선이 흰 바탕과 21:1).
  → **노랑 문제가 구조적으로 해소된다.**
- 이 팔레트는 **휘도 사다리**로 튜닝했다. 라이트 모드 상호 휘도 대비 최솟값 = **1.98**(순진한 팔레트의 1.03 대비 개선).
  흑백에서도 P1 > P2 > P3 > P4 순으로 밝기가 단조 감소해 부분적 구분이 가능하다.
- 각 fill의 흰 배경 대비: P1 1.56 / P2 3.35 / P3 6.73 / P4 13.30. **P1만 3:1 미달이며 외곽선으로 커버**한다.
- 다크 모드 fill의 `#111111` 대비: P1 13.65 / P2 7.45 / P3 8.04 / P4 7.01 — 전부 통과.

```css
:root {
  --bg:#FFFFFF; --ink:#000000; --line:#000000;
  --p1:#FFC700; --p2:#EE5B54; --p3:#17693B; --p4:#102A6E;
  --piece-stroke: var(--ink);
}
:root[data-theme="dark"] {
  --bg:#111111; --ink:#F2F2F2; --line:#F2F2F2;
  --p1:#FFD84D; --p2:#FF7A73; --p3:#3FBF7A; --p4:#6E9BFF;
}
```

SVG 말 (모양 + 숫자 + 외곽선을 한 컴포넌트로):

```html
<svg viewBox="0 0 40 40" class="piece" role="img" aria-label="플레이어 2 (사각)">
  <rect x="4" y="4" width="32" height="32" rx="4"
        fill="var(--p2)" stroke="var(--piece-stroke)" stroke-width="2.5"/>
  <text x="20" y="27" text-anchor="middle" font-size="18" font-weight="700"
        fill="var(--piece-stroke)">2</text>
</svg>
```

- **숫자는 말 크기 ≥ 24 CSS px일 때만 표시**(그 이하는 모양만). 컨테이너 쿼리로 자동 처리:
  ```css
  .piece text { display: none; }
  @container (min-width: 24px) { .piece text { display: block; } }
  ```
- 흑백 패턴(빗금·점)은 **추가하지 않는다** — 작은 보드에서 모아레를 만들고 SVG 노드 수를 늘린다.
  모양+숫자로 이미 2중 중복 부호화가 성립한다.
- **접근성 텍스트 대안**: 각 말에 `aria-label`. 스크린리더 사용자도 "플레이어 2 (사각)"으로 식별.
- **오목·바둑 예외**: 이 두 게임은 관례상 흑/백 돌이다. 여기서는 흑=채움·백=흰 채움+검정 외곽선이
  이미 완벽한 중복 부호화(명도)이므로 P1~P4 팔레트를 쓰지 않는다.

### 6.3 검증 절차 (1회, 도구 무료)

- Chrome DevTools → Rendering → **Emulate vision deficiencies**(protanopia/deuteranopia/tritanopia/achromatopsia)
- 위 4개 중 achromatopsia(전색맹)에서 **모양만으로 4명이 구분되는지**를 합격 기준으로 삼는다.

---

## 7. 다크 모드 판정

**판정: 흰 바탕이 기본이자 정본. 다크는 "야간 옵션"으로 제공한다. 다만 `color-scheme` 선언은 필수다.**

근거:
1. **선언하지 않으면 브라우저가 대신 결정한다.** Chrome Android의 Auto Dark Theme은 사이트가
   다크 대응을 하지 않았을 때 자동 반전을 적용할 수 있다. 방치하면 **사용자가 지정하지 않은 모습**으로
   앱이 보인다. 즉 "다크 모드를 안 만든다"는 선택지는 실제로 존재하지 않는다 — **막든지 만들든지 둘 중 하나**다.
2. 우리 디자인은 모노크롬 + 4색이라 **다크 구현 비용이 토큰 6개 스왑 = CSS 약 12줄**이다.
   차단(`only light`)과 구현의 비용 차이가 거의 없다.
3. 보드게임은 야간·실내 저조도 사용이 많다(실물 게임 점수판은 특히).

```html
<meta name="color-scheme" content="light dark">
```

```css
/* 시스템 추종(기본) */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { /* 위 6.2의 다크 토큰 */ }
}
/* 명시 선택은 항상 이긴다 */
:root[data-theme="dark"] { … }
:root[data-theme="light"] { … }
```

- 설정 3상태: **밝게 / 어둡게 / 시스템 따름**, 기본값 = **밝게**(사용자 지시 존중).
  `localStorage`에 저장. 서버 없음.
- **`filter: invert()` 방식 금지.** 이미지·SVG·플레이어 색이 전부 이상해지고, 성능(합성 레이어)도 나쁘다.
- 다크에서도 "선은 배경 반대색 1px" 원칙 유지 → 디자인 언어가 그대로 보존된다.
- 만약 사용자가 "다크 절대 금지"로 확정하면 `<meta name="color-scheme" content="only light">` 한 줄로
  Auto Dark Theme까지 차단한다. **이 경우에도 meta 태그는 반드시 넣어야 한다**는 점이 핵심이다.

---

## 8. 최소 스택 판정 (1년 방치 관점)

| 항목 | 판정 |
|---|---|
| CSS 프레임워크(Tailwind 등) | **불채택.** 빌드 도구·버전 업그레이드·preflight의 `text-size-adjust:100%` 문제. 이 앱의 CSS 총량은 500줄 이하 |
| 레이아웃 라이브러리(react-grid 등) | **불채택.** flex + grid + aspect-ratio로 충분 |
| `aspect-ratio` / `min()max()clamp()` / 컨테이너 쿼리 / `svh` | **전부 채택.** 모두 2023년 이전 Baseline, 무료, 의존성 0 |
| JS 뷰포트 계측 | **최소화.** `ResizeObserver` 1개(셀 피치 임계 판정)만. `resize`/`orientationchange` 리스너 없음 |
| SVG vs Canvas | **SVG 채택.** DPR 처리·재드로잉·좌표 역변환 코드가 통째로 사라짐 |
| 폰트 | **시스템 폰트만.** 웹폰트 다운로드 없음(오프라인·로딩·CLS·용량 전부 해결) |

---

## 9. 검수 체크리스트 (구현 완료 판정용)

- [ ] iPhone SE급(375×667) 세로에서 상하 잘림 0, 페이지 스크롤 발생 0
- [ ] iPhone 세로/가로 모두에서 노치·홈 인디케이터에 콘텐츠 안 겹침 (가로 좌우 확인 필수)
- [ ] iOS Safari 최초 로드(주소창 펼침) 시점에 하단 버튼이 보임
- [ ] 브라우저 확대 200% + 폭 320px에서 가로 스크롤 없음, 모든 버튼 도달 가능
- [ ] iOS 설정 → 손쉬운 사용 → 텍스트 크기 최대에서 레이아웃 유지
- [ ] 방 코드 입력 시 iOS 자동 확대 발생하지 않음(입력 font-size ≥ 1rem)
- [ ] 핀치 확대가 앱 어디서나 동작(보드 포함)
- [ ] 19x19 세로 폰에서 2단계 확정 모드 자동 활성, 오목 15x15는 원탭
- [ ] 스플릿 회전 패널에서 토스트/모달이 정방향으로 뜸(회전 서브트리 밖 렌더링 확인)
- [ ] DevTools achromatopsia 시뮬레이션에서 4명 구분 가능
- [ ] 안드로이드 Chrome 다크 테마에서 강제 반전 발생 안 함

---

## 출처

- [CSS dvh, svh and lvh: Mobile Viewport Units Explained](https://csstoolkit.net/blog/css-dvh-svh-lvh-guide/)
- [CSS svh and dvh are now cross-browser compatible](https://zenn.dev/tonkotsuboy_com/articles/svh-dvh-lvh-for-all-browser?locale=en)
- [Viewport Unit Variants: Browser Support, dvh, svh, lvh — TestMu AI](https://www.testmuai.com/learning-hub/viewport-unit-variants-browser-support/)
- [env() CSS function — MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/env)
- [Using safe-area-inset to build mobile-safe layouts — Polypane](https://polypane.app/blog/using-safe-area-inset-to-build-mobile-safe-layouts/)
- [Safari returns 0 for safe-area-inset-bottom when the toolbar is hidden — Apple Developer Forums](https://developer.apple.com/forums/thread/716552)
- [Safari 26 Liquid Glass: toolbar tinting, white bars, viewport bugs](https://1ar.io/updates/safari-26-liquid-glass-web/)
- [You can stop using user-scalable=no and maximum-scale=1 — Luke Plant](https://lukeplant.me.uk/blog/posts/you-can-stop-using-user-scalable-no-and-maximum-scale-1-in-viewport-meta-tags-now/)
- [Honoring Mobile OS Text Size — Adrian Roselli (2026-02)](https://adrianroselli.com/2026/02/honoring-mobile-os-text-size.html)
- [Dynamic Type on the Web — furbo.org](https://furbo.org/2024/07/04/dynamic-type-on-the-web/)
- [What does webkit-text-size-adjust do — BrowserStack](https://www.browserstack.com/guide/webkit-text-size-adjust)
- [16px or Larger Text Prevents iOS Form Zoom — CSS-Tricks](https://css-tricks.com/16px-or-larger-text-prevents-ios-form-zoom/)
- [touch-action — MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action)
- [Control the Viewport Resize Behavior with interactive-widget — HTMHell](https://www.htmhell.dev/adventcalendar/2024/4/)
- [WCAG 2.5.8 Target Size Minimum guide — TestParty](https://testparty.ai/blog/wcag-target-size-guide)
- [Un-fixing Fixed Elements with CSS Transforms — Eric Meyer](http://meyerweb.com/eric/thoughts/2011/09/12/un-fixing-fixed-elements-with-css-transforms/)
- [Auto Dark Theme — Chrome for Developers](https://developer.chrome.com/blog/auto-dark-theme)
- [Colorblind-Friendly Palettes — AudioEye](https://www.audioeye.com/post/colorblind-friendly-palettes/)
- [What to consider when visualizing data for colorblind readers — Datawrapper](https://www.datawrapper.de/blog/colorblindness-part2)
- [Little Go (stone distance from fingertip / 19x19 on small iPhone)](https://apps.apple.com/us/app/little-go/id490753989)
- [Go Game Connect (tap-to-enlarge board)](https://apps.apple.com/app/id1385361527)
- [PWA iOS Limitations and Safari Support 2026 — MagicBell](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)

# Nollawa

스마트폰과 태블릿에서 설치 없이 실행하는 사목 M0 웹앱이다. 로컬 대국도 원격 대국과 동일한 `Transport` 메시지 경로를 사용한다.

## 로컬 검증

```powershell
npm ci --ignore-scripts
npm run build
npm test
npm run preview -- --host 127.0.0.1
```

## Cloudflare Pages 정본

Git 연결 화면에서 Node 버전은 `.nvmrc`, 설치 명령은 `npm ci --ignore-scripts`, 빌드 명령은 `npm run build`, 출력 폴더는 `dist`로 고정한다. 결제수단을 등록하지 않는다. 릴레이는 정적 사이트와 별개이며 `relay/wrangler.toml`을 명시해 수동 배포한다.

```powershell
npx wrangler deploy --config relay/wrangler.toml
```

계정 연결과 실제 배포는 이 저장소 작업 범위 밖이다. 앱 빌드에는 `VITE_RELAY_URL=wss://<relay-host>`를 설정한다.

## GitHub Pages 미러

빌드 결과인 `dist/`를 커밋한 뒤 아래 한 줄을 사람이 명시적으로 실행한다. 자동 작업 파일은 두지 않는다.

```powershell
git subtree push --prefix dist origin gh-pages
```

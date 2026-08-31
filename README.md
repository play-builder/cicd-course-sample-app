# sample-app

CI/CD 와 GitOps 강의의 배포 대상 애플리케이션입니다. 단일 서비스입니다.

## endpoint

| 경로 | 응답 | 쓰이는 모듈 |
| --- | --- | --- |
| `GET /` | version, gitSha, pod 이름 | M12 에서 stable 과 canary 응답 비율 확인 |
| `GET /healthz` | 항상 200 | M11 livenessProbe |
| `GET /readyz` | 준비 전 503, 준비 후 200 | M11 readinessProbe |
| `GET /version` | version, gitSha, buildDate, nodeVersion | M13 에서 커밋이 운영까지 도달했는지 확인 |
| `GET /config` | 주입 설정과 secret 키 이름, 존재 여부, 길이 | M14 External Secrets 주입 확인 |
| `GET /metrics` | Prometheus 형식 지표 | M12 AnalysisTemplate |

`GET /config` 는 secret 의 값을 내보내지 않습니다. 키 이름과 길이만 돌려줍니다.

## 환경 변수

| 이름 | 기본값 | 하는 일 | 쓰이는 모듈 |
| --- | --- | --- | --- |
| `PORT` | 3000 | listen 포트 | |
| `APP_VERSION` | dev | `/` 와 `/version` 에 실리는 버전 | M12, M13 |
| `GIT_SHA` | unknown | 빌드한 커밋 | M13 |
| `BUILD_DATE` | unknown | 빌드 시각 | M13 |
| `POD_NAME` | local | downward API 로 주입 | M11, M12 |
| `NODE_NAME` | local | downward API 로 주입 | M11 |
| `FAILURE_RATE` | 0 | `/` 응답을 500 으로 만드는 비율 0.0 ~ 1.0 | M12 자동 rollback |
| `LATENCY_MS` | 0 | `/` 응답을 지연시키는 밀리초 | M12 지연 기반 analysis |
| `READY_DELAY_MS` | 0 | 기동 후 readyz 를 켜기까지 기다리는 밀리초 | M11 rolling update 관찰 |
| `SHUTDOWN_DELAY_MS` | 5000 | SIGTERM 수신 후 종료까지 기다리는 밀리초 | M11 무중단 배포 |
| `SECRET_KEYS` | DB_HOST,DB_PASSWORD,API_KEY | `/config` 가 확인할 키 목록 | M14 |

## 지표

```text
http_requests_total{method,route,status}              Counter
http_request_duration_seconds{method,route,status}    Histogram
process_*, nodejs_*                                   기본 지표
```

라벨 `app` 과 `version` 이 모든 지표에 붙습니다. `version` 으로 stable 과 canary 를 나눠
집계할 수 있습니다.

M12 AnalysisTemplate 이 쓸 오류율 계산 예시입니다.

```text
sum(rate(http_requests_total{app="sample-app",version="[canary 버전]",status="500"}[1m]))
/
sum(rate(http_requests_total{app="sample-app",version="[canary 버전]"}[1m]))
```

## 오류 주입이 probe 에 영향을 주지 않는 이유

```text
FAILURE_RATE 가 적용되는 곳    GET /  한 곳
FAILURE_RATE 가 적용되지 않는 곳  /healthz, /readyz, /version, /config, /metrics

livenessProbe 가 /healthz 를 보므로 오류를 주입해도 Pod 가 재시작되지 않는다
Pod 가 살아 있어야 canary 분석이 실패하는 과정을 끝까지 볼 수 있다
Pod 가 죽으면 분석이 아니라 CrashLoopBackOff 를 보게 된다
```

## 종료 순서

```text
SIGTERM 수신
      │
      ▼
readyz 가 503 을 돌려주기 시작            Service endpoint 에서 빠진다
      │
      │  SHUTDOWN_DELAY_MS 만큼 기다린다   진행 중인 요청을 마친다
      ▼
server.close()
      │
      ▼
process.exit(0)
```

`terminationGracePeriodSeconds` 는 `SHUTDOWN_DELAY_MS` 보다 크게 잡습니다.
작게 잡으면 종료 대기가 끝나기 전에 SIGKILL 이 옵니다.

## 로컬 실행

`의존성 설치`

```bash
npm install
```

`테스트 실행`

```bash
npm test
```

`lint 실행`

```bash
npm run lint
```

`서버 실행`

```bash
npm start
```

`오류 주입 상태로 실행`

```bash
FAILURE_RATE=0.5 npm start
```

## 이미지 빌드

`빌드 인자와 함께 빌드`

```bash
docker build --build-arg APP_VERSION=v1.0.0 --build-arg GIT_SHA=$(git rev-parse HEAD) --build-arg BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ) -t sample-app:v1.0.0 .
```

## 수동으로 해야 하는 단계

```text
1. npm install 을 한 번 실행해 package-lock.json 을 만들고 커밋한다
   Dockerfile 의 npm ci 가 lock 파일을 요구한다

2. 의존성 버전 범위를 확인한다
   express ^5.1.0, prom-client ^15.1.3, eslint ^9.0.0 으로 적어 두었다
   설치 시점의 최신 minor 를 확인하고 필요하면 범위를 올린다

3. 저장소 위치를 정한다
   argocd-gitops 안의 app/ 로 넣을지 앱 저장소를 따로 팔지 미정이다
```

## 검증 불가 항목

```text
node --test --experimental-test-coverage 는 Node 24 에서도 experimental 표시가 붙어 있다
CI 에서는 npm test 를 쓰고, 커버리지가 필요하면 npm run test:coverage 를 쓴다
플래그 이름이 바뀔 수 있으므로 녹화 전에 다시 확인한다
```

## 이 저장소에 없는 것

```text
.github/workflows/    M03 부터 M05 까지 수강생이 직접 만든다
kustomize/, charts/   배포 대상 상태는 argocd-gitops 에 둔다
terraform/            cluster 는 EKS-infra 가 만든다
```

애플리케이션 소스와 배포 대상 상태를 같은 저장소에 두면 CI 가 만든 커밋이 다시 CI 를
실행시키고, 코드 리뷰 대상과 배포 승인 대상이 섞입니다. Argo CD 공식 문서도 설정 저장소를
소스 저장소와 분리할 것을 권장합니다.

# CI/CD course sample application

이 저장소는 CI/CD와 GitOps 강의에서 빌드·테스트·배포할 Node.js 24 애플리케이션의 전체
코드입니다. 애플리케이션 코드와 GitOps desired state를 분리하며, CI는 ECR에 multi-architecture
이미지 인덱스를 푸시한 뒤 **index digest만** `argocd-gitops` 저장소에 반영합니다.

## 전체 흐름

```text
application PR merge
        │
        ▼
lint + test → Buildx(amd64/arm64) → ECR index digest
                                      │
                   ┌──────────────────┴──────────────────┐
                   ▼                                     ▼
             dev digest PR                         prod promotion PR
             validate + auto-merge                 CODEOWNERS approval
                   │                                     │
                   ▼                                     ▼
             Argo CD Deployment                    Argo Rollouts Canary
```

이 그림에서 봐야 할 핵심은 prod에서 새 이미지를 다시 빌드하지 않는다는 점입니다. dev에서
검증한 동일 digest를 복사해야 공급망과 승격 이력을 추적할 수 있습니다.

## 엔드포인트와 장애 주입

| 경로 | 역할 |
| --- | --- |
| `GET /` | 버전 응답, `FAILURE_RATE`와 `LATENCY_MS` 적용 |
| `GET /healthz` | liveness probe |
| `GET /readyz` | readiness probe |
| `GET /version` | digest와 연결할 build metadata 확인 |
| `GET /config` | secret 값은 숨기고 키 존재 여부·길이만 반환 |
| `GET /metrics` | AMP로 수집할 Prometheus metrics |

`FAILURE_RATE`는 `/`에만 적용됩니다. Probe까지 실패시키면 카나리 분석이 아니라
`CrashLoopBackOff` 실습이 되므로 의도적으로 분리했습니다.

## 로컬 검증

의존성은 lock 파일 그대로 설치합니다.

```bash
npm ci
npm run lint
npm test
bash test/curl-loop.test.sh
```

애플리케이션 실행:

```bash
npm start
curl -fsS http://127.0.0.1:3000/readyz
curl -fsS http://127.0.0.1:3000/version
```

장애 응답을 생성할 때는 별도 shell에서 요청 부하를 유지합니다.

```bash
FAILURE_RATE=0.5 npm start
bash scripts/curl-loop.sh http://127.0.0.1:3000/ 0.2
```

종료 시 애플리케이션은 먼저 readiness를 내리고 `SHUTDOWN_DELAY_MS` 동안 in-flight 요청을
기다린 뒤 종료합니다. Kubernetes의 `terminationGracePeriodSeconds`는 이 값보다 커야 합니다.

## Container image 계약

Dockerfile은 Node `24.20.0-alpine3.23`의 multi-architecture index digest로 base image를
고정합니다. 로컬 단일 아키텍처 확인은 다음과 같습니다.

```bash
docker build \
  --build-arg APP_VERSION=local \
  --build-arg GIT_SHA=local \
  --build-arg BUILD_DATE=2026-09-01T00:00:00Z \
  -t sample-app:local .
```

CI에서는 `linux/amd64,linux/arm64`를 동시에 push하며 action 출력의 digest를 다시 inspect합니다.

```bash
docker buildx imagetools inspect \
  <account>.dkr.ecr.<region>.amazonaws.com/playdevops/sample-app@sha256:<digest>
```

정상 결과에는 `linux/amd64`와 `linux/arm64` platform manifest가 모두 보여야 합니다.

## GitHub repository 설정

Repository variables:

| 이름 | 값 |
| --- | --- |
| `AWS_REGION` | 예: `us-east-1` |
| `AWS_ROLE_ARN` | EKS-infra의 `sample_app_push_role_arn` 출력 |
| `ECR_REPOSITORY` | `playdevops/sample-app` |
| `GITOPS_APP_ID` | GitOps용 GitHub App ID |
| `GITOPS_OWNER` | GitOps 저장소 owner |
| `GITOPS_REPOSITORY_NAME` | GitOps 저장소 이름 |

Repository secret:

| 이름 | 값 |
| --- | --- |
| `GITOPS_APP_PRIVATE_KEY` | GitHub App private key PEM 전체 |

GitHub App은 `argocd-gitops` 저장소에 설치하고 최소한 다음 repository permission을 줍니다.

- Contents: Read and write
- Pull requests: Read and write

`ci.yml`의 AWS 접근은 장기 access key가 아니라 GitHub OIDC를 사용합니다. Trust policy는
`main`과 `dev` branch ref만 허용하며 PR workflow에는 AWS 권한이 없습니다.

## Workflow 책임

| 파일 | 실행 시점 | 결과 |
| --- | --- | --- |
| `.github/workflows/test.yml` | application PR | lint, unit/integration test, image build |
| `.github/workflows/ci.yml` | `main`/`dev` push | ECR push, dev digest PR, validation 후 auto-merge |
| `.github/workflows/promote.yml` | 수동 dispatch | 현재 dev digest를 prod에 복사한 승인 PR |

GitHub App token의 push가 GitOps validate workflow를 한 번 실행하는 것은 정상입니다. 자동화가
같은 digest를 다시 쓰지 않도록 `gitops-values.mjs`가 idempotent하게 동작하므로 무한 trigger
loop가 생기지 않습니다. `envs/dev/**`를 `paths-ignore`하거나 `[skip ci]`로 validation을
우회하지 않습니다.

## 정상 결과와 실패 확인

정상 CI 결과:

- `npm ci`, lint, test 모두 성공
- ECR image가 immutable tag와 index digest를 가짐
- dev PR diff는 `envs/dev/values.yaml`의 repository/digest 두 값뿐임
- prod promotion은 dev와 byte-for-byte 동일한 digest를 사용함

주요 실패 원인:

- `AccessDenied`: `AWS_ROLE_ARN`, OIDC subject, ECR push policy 확인
- `ImageTagAlreadyExistsException`: 재실행 tag에 run ID/attempt가 포함됐는지 확인
- `ImagePullBackOff`: index digest인지와 worker node role의 ECR pull policy 확인
- GitOps PR 생성 실패: GitHub App 설치 대상과 Contents/PR permission 확인

버전 계약은 [versions.lock.yaml](./versions.lock.yaml)에 있으며, 배포 manifest는 이 저장소가
아니라 `argocd-gitops`에서 관리합니다.

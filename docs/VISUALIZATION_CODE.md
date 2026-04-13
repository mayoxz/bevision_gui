# 시각화 코드(JSX) 동작 설명

BEVision GUI 프론트엔드 (`frontend/src/`) 시각화 코드 분석 (2026-04-13 기준)

---

## 아키텍처 개요

```
App.jsx
└── SpaViewport.jsx          # dataset × runKind 조합으로 lazy 라우팅
    ├── nuscenes-mini-eval/
    │   ├── index.jsx         # 페이지 진입점 (레이아웃 래퍼)
    │   └── EvalDashboard.jsx # 평가 메트릭 시각화
    └── nuscenes-mini-smoke/
        ├── index.jsx         # 페이지 진입점
        └── SmokeDashboard.jsx # 학습 스칼라 시각화
```

데이터 URL 해석은 `config/dataUrl.js`에서 전담한다.

---

## 파일별 동작

### `App.jsx`

최상위 레이아웃 컴포넌트.

- **헤더**: `데이터셋` 셀렉터(현재 `nus-mini`만 제공) + `실행 결과` 셀렉터(`eval` / `smoke`)
- `runKind` 셀렉터는 `dataset === 'nus-mini'`일 때만 표시된다
- 선택값을 `SpaViewport`에 props로 전달

---

### `viz/SpaViewport.jsx`

`dataset:runKind` 문자열 키로 대시보드 컴포넌트를 **lazy load**한다.

```
'nus-mini:eval'  → nuscenes-mini-eval/index.jsx
'nus-mini:smoke' → nuscenes-mini-smoke/index.jsx
```

- `React.lazy` + `Suspense`로 코드 스플리팅 처리
- 알 수 없는 조합이면 에러 메시지 표시

---

### `config/dataUrl.js`

데이터 파일 URL을 환경에 따라 분기하는 유틸리티.

```js
resolveDataUrl('nus-mini/eval/20260410_212913/20260410_212913.json')
// 개발: /data/nus-mini/eval/...
// 프로덕션: ${VITE_DATA_BASE_URL}/nus-mini/eval/...
```

- 환경 변수 `VITE_DATA_BASE_URL`이 없으면 `/data/<path>` (Vite 정적 서빙)
- 있으면 절대 URL 프리픽스 + 동일 상대 경로 (R2 등 CDN 배포용)

---

### `spa/nuscenes-mini-eval/EvalDashboard.jsx`

NuScenes **평가(eval)** 결과를 시각화하는 대시보드.

#### 데이터 흐름

1. `fetchTimestamps()` — 현재 하드코딩 `['20260410_212913']`
2. `fetchEvalResult(timestamp)` — `nus-mini/eval/<ts>/<ts>.json` fetch  
   JSON 내 `NaN` 리터럴을 `null`로 치환 후 파싱
3. `parseEvalJson(raw)` — raw 객체를 시각화용 구조로 변환

#### `parseEvalJson` 변환 결과

| 출력 필드 | 내용 |
|-----------|------|
| `mAP` | 단일 float |
| `NDS` | 단일 float |
| `apMatrix` | 10클래스 × 4거리임계값 2D 배열 |
| `errorMatrix` | 10클래스 × 5오류지표(trans/scale/orient/vel/attr) 2D 배열 |
| `means` | mATE/mASE/mAOE/mAVE/mAAE 5개 float |
| `radarData` | 클래스별 AP 평균 (막대 차트용) |

#### 렌더링 컴포넌트

| 컴포넌트 | 시각화 내용 |
|----------|-------------|
| `SummaryCards` | NDS · mAP 수치 카드 |
| `ApHeatmap` | 클래스×거리 AP 히트맵 테이블 (값 높을수록 accent 색) |
| `ApRadar` | 클래스별 평균 AP 가로 막대 차트 |
| `ErrorTable` | 클래스×오류지표 테이블 (값 높을수록 적색) + 평균(mA*) 행 |

- 셀 배경색: `color-mix(in srgb, ...)` CSS 함수로 0~1 범위를 색상 강도로 매핑
- `null` 값은 `—`으로 표시

---

### `spa/nuscenes-mini-smoke/SmokeDashboard.jsx`

NuScenes **학습(smoke/train)** 스칼라 로그를 시각화하는 대시보드.

#### 데이터 흐름

1. `fetchTimestamps()` — 현재 하드코딩 `['20260410_210326']`
2. `fetchScalars(timestamp)` — `nus-mini/smoke/<ts>/vis_data/scalars.json` fetch
3. `parseJsonl(text)` — JSONL 텍스트를 파싱, `NaN` → `null` 치환 후 각 줄 JSON.parse

#### 렌더링 컴포넌트

| 컴포넌트 | 시각화 내용 |
|----------|-------------|
| `SummaryStrip` | 마지막 스텝의 records 수 · step · loss · lr · GPU memory max 요약 카드 |
| `ScalarLineChart` (Loss) | `loss`, `loss_heatmap`, `layer_-1_loss_cls`, `layer_-1_loss_bbox` (x축: step) |
| `ScalarLineChart` (LR) | `lr` 스케줄 곡선 |
| `ScalarLineChart` (Grad) | `grad_norm` (NaN 구간은 선 끊김으로 처리) |
| `ScalarLineChart` (Timing) | `data_time`, `time` (초/step) |
| `ScalarLineChart` (Memory) | `memory` (MB) |

#### `ScalarLineChart` 내부 로직

- SVG viewBox `720×220`, padding L/R/T/B = 52/16/12/32
- x축: `step` 필드, y축: 시리즈 키들의 유한값(finite) 범위 ± 5% padding
- `NaN`/`null` 포인트는 건너뜀 → 자동으로 선이 끊김
- `useMemo`로 path 문자열 캐시 (rows/series 변경 시만 재계산)
- 유효 포인트가 하나도 없으면 "표시할 유효한 숫자 값이 없습니다." 메시지 표시

#### 시리즈 색상표

| 시리즈 | 색상 |
|--------|------|
| loss | `#a855f7` (보라) |
| loss_heatmap | `#22c55e` (녹색) |
| layer_-1_loss_cls | `#3b82f6` (파랑) |
| layer_-1_loss_bbox | `#f97316` (주황) |
| lr | `#a855f7` (보라) |
| grad_norm | `#eab308` (황색) |
| data_time | `#38bdf8` (하늘) |
| time | `#f472b6` (분홍) |
| memory | `#94a3b8` (회색) |

---

## 공통 패턴

- 모든 대시보드는 `loading` / `error` / `data` 3-state 패턴을 사용
- `NaN` JSON 리터럴 파싱 전처리: `.replace(/\bNaN\b/g, 'null')`
- Run 셀렉터(`<select>`)로 타임스탬프 전환 (현재 타임스탬프는 하드코딩, 추후 API/index 파일로 동적화 예정)

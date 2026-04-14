# BEVision Work Dirs 데이터 구조 문서

Web GUI 시각화를 위한 출력 데이터 구조 분석 (2026-04-14 기준)

**배치 위치**: 리포지토리에서는 `frontend/public/data/nus-mini/` 아래에 둔다. Vite 개발/배포 시 정적 URL은 **`/data/nus-mini/`** (로컬 전용). 프로덕션에서는 R2 등 공개 URL을 코드에서 `VITE_DATA_BASE_URL` 등으로 바꿔 같은 상대 경로(`nus-mini/...`)를 붙여 읽는 방식을 권장한다.

---

## 디렉토리 개요

```
data/nus-mini/
├── eval/                          # 평가(eval) 실행 결과
│   ├── bevfusion_mini_debug.py    # 실험 config (복사본)
│   └── 20260410_212913/           # 실행 타임스탬프 디렉토리
│       ├── 20260410_212913.json   # 평가 메트릭 결과 (1줄 JSON)
│       ├── 20260410_212913.log    # 전체 실행 로그
│       └── vis_data/
│           └── config.py          # 실험 설정 스냅샷
│
└── smoke/                         # 학습(train) smoke test 실행 결과
    ├── bevfusion_mini_debug.py    # 실험 config (복사본)
    ├── last_checkpoint            # 마지막 체크포인트 경로
    └── 20260410_210326/           # 실행 타임스탬프 디렉토리
        ├── 20260410_210326.log    # 전체 실행 로그
        └── vis_data/
            ├── 20260410_210326.json  # 학습 스칼라 로그 (JSONL)
            ├── scalars.json          # 동일한 학습 스칼라 (중복)
            └── config.py             # 실험 설정 스냅샷
```

---

## 1. `eval/` (평가 모드)

### 핵심 파일: `<timestamp>/<timestamp>.json`

- **형식**: 단일 JSON 객체 (1줄)
- **내용**: NuScenes 평가 메트릭 전체

#### JSON 필드 구조

| 필드 패턴 | 예시 | 설명 |
|-----------|------|------|
| `NuScenes metric/pred_instances_3d_NuScenes/<class>_AP_dist_<d>` | `car_AP_dist_0.5` | 클래스별 거리 임계값(0.5/1.0/2.0/4.0m) AP |
| `NuScenes metric/pred_instances_3d_NuScenes/<class>_trans_err` | `car_trans_err` | 클래스별 Translation Error |
| `NuScenes metric/pred_instances_3d_NuScenes/<class>_scale_err` | `car_scale_err` | 클래스별 Scale Error |
| `NuScenes metric/pred_instances_3d_NuScenes/<class>_orient_err` | `car_orient_err` | 클래스별 Orientation Error |
| `NuScenes metric/pred_instances_3d_NuScenes/<class>_vel_err` | `car_vel_err` | 클래스별 Velocity Error |
| `NuScenes metric/pred_instances_3d_NuScenes/<class>_attr_err` | `car_attr_err` | 클래스별 Attribute Error |
| `NuScenes metric/pred_instances_3d_NuScenes/mATE` | `0.9995` | Mean Average Translation Error |
| `NuScenes metric/pred_instances_3d_NuScenes/mASE` | `0.9255` | Mean Average Scale Error |
| `NuScenes metric/pred_instances_3d_NuScenes/mAOE` | `1.1179` | Mean Average Orientation Error |
| `NuScenes metric/pred_instances_3d_NuScenes/mAVE` | `0.9396` | Mean Average Velocity Error |
| `NuScenes metric/pred_instances_3d_NuScenes/mAAE` | `0.8767` | Mean Average Attribute Error |
| `NuScenes metric/pred_instances_3d_NuScenes/NDS` | `0.02722` | NuScenes Detection Score (종합) |
| `NuScenes metric/pred_instances_3d_NuScenes/mAP` | `0.00270` | mean Average Precision (종합) |
| `data_time` | `0.5225` | 데이터 로딩 시간(초) |
| `time` | `0.7235` | 전체 inference 시간(초) |

#### 대상 클래스 (10개)

`car`, `truck`, `construction_vehicle`, `bus`, `trailer`, `barrier`, `motorcycle`, `bicycle`, `pedestrian`, `traffic_cone`

#### 특이사항

- `NaN` 값 존재: 일부 클래스에서 해당 없는 오류 항목(`vel_err`, `attr_err`, `orient_err`)은 `NaN`으로 기록됨
- Web GUI에서 파싱 시 `NaN` → `null` 또는 `"-"` 처리 필요

---

## 2. `smoke/` (학습 모드)

### 핵심 파일: `<timestamp>/vis_data/<timestamp>.json` (= `scalars.json`)

- **형식**: JSONL (JSON Lines) — 한 줄 = 한 step의 스칼라
- **내용**: 학습 중 스텝별 loss / lr / 메모리 등 트레이닝 지표
- `vis_data/20260410_210326.json`과 `vis_data/scalars.json`은 **완전히 동일한 파일** (현재 163 레코드)

#### 1줄(1 step) JSON 필드 구조

| 필드 | 타입 | 설명 |
|------|------|------|
| `step` | int | 글로벌 iteration 번호 |
| `iter` | int | 현재 epoch 내 iteration (= step과 동일, 1-epoch만 있으면) |
| `epoch` | int | 현재 epoch 번호 |
| `lr` | float | 현재 learning rate |
| `loss` | float | 전체 loss 합계 |
| `loss_heatmap` | float | Heatmap loss |
| `layer_-1_loss_cls` | float | 마지막 디코더 레이어 분류 loss |
| `layer_-1_loss_bbox` | float | 마지막 디코더 레이어 bbox regression loss |
| `matched_ious` | float | 매칭된 prediction의 평균 IoU |
| `grad_norm` | float \| NaN | Gradient norm (초반 NaN → 이후 수렴) |
| `data_time` | float | 데이터 로딩 시간(초) |
| `time` | float | 1 step 처리 시간(초) |
| `memory` | int | GPU 메모리 사용량 (MB) |

#### 데이터 범위 (현재 실행 기준)

- step: 10 ~ 1630 (step=10 간격, 총 163 records)
- epoch: 1 (단일 epoch smoke test)
- loss 초반: ~2346 → 이후 ~7.5 수준으로 빠르게 수렴
- grad_norm: 초반 50 step은 NaN, 이후 정상화

---

## 3. 공통 파일

### `vis_data/config.py`

- **형식**: Python dict 표현식 (MMEngine config 포맷)
- **내용**: 실험에 사용된 전체 하이퍼파라미터 및 파이프라인 설정
- eval/smoke 양쪽 모두 존재하며 구조 동일

주요 포함 정보:
- `class_names`: 10개 클래스 리스트
- `data_root`, `data_prefix`: 데이터 경로
- `model`, `train_cfg`, `test_cfg`: 모델 및 학습/추론 설정
- `optim_wrapper`, `param_scheduler`: 옵티마이저 설정

### `<timestamp>.log`

- **형식**: 텍스트 로그
- **내용**: 실행 환경 정보(GPU, CUDA, PyTorch 버전), config 덤프, 스텝별 로그

---

## 4. eval vs smoke 구조 비교

| 항목 | eval | smoke (train) |
|------|------|---------------|
| 주요 JSON 위치 | `<ts>/<ts>.json` | `<ts>/vis_data/<ts>.json` |
| JSON 형식 | 단일 JSON (1줄) | JSONL (N줄, 스텝별) |
| 데이터 성격 | 평가 완료 후 메트릭 스냅샷 | 학습 중 시계열 스칼라 |
| `vis_data/` 내 추가 파일 | 없음 | `scalars.json` (동일 내용 중복) |
| `last_checkpoint` | 없음 | 있음 (체크포인트 경로) |
| 로그 파일 위치 | `<ts>/<ts>.log` | `<ts>/<ts>.log` |

---

## 5. Web GUI 시각화 권장 구성

### eval 결과 시각화

- **테이블**: 클래스별 AP (dist 4단계) + 오류 지표 5종
- **요약 카드**: `mAP`, `NDS` 강조 표시
- **레이더 차트**: 클래스별 AP 비교
- **NaN 처리**: 파싱 시 `null` 변환 후 `"-"` 표시

### smoke (train) 결과 시각화

- **라인 차트**: `loss`, `loss_heatmap`, `layer_-1_loss_cls`, `layer_-1_loss_bbox` (x축: step)
- **라인 차트**: `lr` 스케줄 (x축: step)
- **라인 차트**: `grad_norm` (NaN 구간 처리 필요)
- **라인 차트**: `memory`, `data_time`, `time`
- **데이터 소스**: `vis_data/scalars.json` 사용 권장 (경로가 더 일관적)

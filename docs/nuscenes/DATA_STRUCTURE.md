# NuScenes (full) 데이터 구조 문서

Web GUI 시각화를 위한 `data/nuscenes/` 출력 데이터 구조 분석 (2026-04-13 기준)

**배치 위치**: `frontend/public/data/nuscenes/` 아래.  
Vite 개발/배포 시 정적 URL은 **`/data/nuscenes/`** (로컬 전용).  
프로덕션에서는 `VITE_DATA_BASE_URL` 환경 변수로 베이스 URL을 교체한다.

---

## 디렉토리 개요

```
data/nuscenes/
└── 20260411_211747/                       # 실행 타임스탬프 디렉토리
    ├── 20260411_211747.json               # 평가 메트릭 결과 (1줄 JSON)
    ├── 20260411_211747.log                # 전체 실행 로그
    └── vis_data/
    │   └── config.py                      # 실험 설정 스냅샷 (MMEngine)
    └── vis_final_integrated/
        └── <scene>__<camera>__<token>.jpg # 카메라별 시각화 이미지
```

---

## 1. `<timestamp>/<timestamp>.json` (평가 메트릭)

- **형식**: 단일 JSON 객체 (1줄)
- **내용**: NuScenes eval 메트릭. nus-mini/eval과 동일한 키 스키마
- **현재 파일 내용**: `data_time` + `time` 두 필드만 존재 (조기 종료 또는 partial eval)

| 필드 | 타입 | 설명 |
|------|------|------|
| `data_time` | float | 데이터 로딩 시간(초) |
| `time` | float | 전체 inference 시간(초) |

완전한 eval JSON은 nus-mini와 동일하게 아래 필드 패턴을 따른다:

| 필드 패턴 | 설명 |
|-----------|------|
| `NuScenes metric/pred_instances_3d_NuScenes/<class>_AP_dist_<d>` | 클래스별 거리 임계값(0.5/1.0/2.0/4.0m) AP |
| `NuScenes metric/pred_instances_3d_NuScenes/<class>_{trans,scale,orient,vel,attr}_err` | 클래스별 오류 지표 |
| `NuScenes metric/pred_instances_3d_NuScenes/{mATE,mASE,mAOE,mAVE,mAAE}` | 평균 오류 지표 |
| `NuScenes metric/pred_instances_3d_NuScenes/NDS` | NuScenes Detection Score |
| `NuScenes metric/pred_instances_3d_NuScenes/mAP` | mean Average Precision |

---

## 2. `vis_data/config.py` (실험 설정)

- **형식**: Python dict 표현식 (MMEngine config 포맷)
- nus-mini config와 동일한 구조. BEVFusion 모델 전체 설정 포함

주요 포함 정보:
- `class_names`: 10개 클래스 (`car`, `truck`, `construction_vehicle`, `bus`, `trailer`, `barrier`, `motorcycle`, `bicycle`, `pedestrian`, `traffic_cone`)
- `data_root`: `data/nuscenes/` (full NuScenes)
- `model`: BEVFusion (SwinTransformer img_backbone + BEVFusionSparseEncoder pts_middle_encoder + TransFusionHead)
- `input_modality`: `use_camera=True, use_lidar=True`
- `point_cloud_range`: `[-54, -54, -5, 54, 54, 3]`
- `voxel_size`: `[0.075, 0.075, 0.2]`

---

## 3. `vis_final_integrated/` (시각화 이미지)

- **형식**: JPEG 이미지
- **파일명 패턴**: `<scene_token>__<camera_name>__<timestamp_token>.jpg`
  - 예: `n008-2018-08-01-15-34-25-0400__CAM_FRONT__1533152214512404.jpg`
- **내용**: BEVFusion inference 결과가 3D bounding box로 오버레이된 카메라 뷰 이미지
- 현재 1개 샘플 이미지 포함 (`CAM_FRONT`)

---

## 4. `<timestamp>.log`

- **형식**: 텍스트 로그
- **내용**: 실행 환경 정보 (GPU, CUDA, PyTorch), config 덤프, step별 로그

---

## 5. nus-mini vs nuscenes 비교

| 항목 | nus-mini | nuscenes (full) |
|------|----------|-----------------|
| 데이터셋 | NuScenes mini (소규모) | NuScenes full |
| ann_file | `nuscenes_mini_infos_*.pkl` | `nuscenes_infos_*.pkl` |
| eval JSON | 완전한 메트릭 (10클래스 × 4dist + 오류) | 현재는 partial (data_time, time만) |
| vis 이미지 | 없음 | `vis_final_integrated/*.jpg` |
| smoke (학습) | JSONL scalars 포함 | 해당 없음 (eval only) |

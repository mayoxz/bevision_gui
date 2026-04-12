// 스켈레톤·초안 — 실제 구현은 아래를 사용합니다.
//   src/spa/nuscenes-mini-eval/EvalDashboard.jsx
//   src/spa/nuscenes-mini-eval/index.jsx
//
// EvalDashboard.jsx — BEVision eval 결과 시각화 대시보드 (참고용 보관)

import { useEffect, useState } from "react";

// ─── 상수 ────────────────────────────────────────────────────────────────────

const BASE_URL = import.meta.env.VITE_DATA_BASE_URL ?? "/data/nus-mini";

const CLASSES = [
  "car", "truck", "construction_vehicle", "bus", "trailer",
  "barrier", "motorcycle", "bicycle", "pedestrian", "traffic_cone",
];

const DIST_THRESHOLDS = [0.5, 1.0, 2.0, 4.0];

const ERROR_KEYS = [
  { key: "trans_err",   label: "Trans"  },
  { key: "scale_err",   label: "Scale"  },
  { key: "orient_err",  label: "Orient" },
  { key: "vel_err",     label: "Vel"    },
  { key: "attr_err",    label: "Attr"   },
];

const MEAN_KEYS = ["mATE", "mASE", "mAOE", "mAVE", "mAAE"];

// ─── 데이터 로딩 ──────────────────────────────────────────────────────────────

/**
 * eval/<timestamp>/<timestamp>.json 을 fetch해서 파싱
 * NaN → null 변환 포함
 */
async function fetchEvalResult(timestamp) {
  const url = `${BASE_URL}/eval/${timestamp}/${timestamp}.json`;
  const res = await fetch(url);
  const text = await res.text();
  // JSON 표준은 NaN 미지원 → 문자열 치환 후 파싱
  const sanitized = text.replace(/\bNaN\b/g, "null");
  return JSON.parse(sanitized);
}

/**
 * eval/ 디렉토리에서 사용 가능한 timestamp 목록을 반환
 * TODO: 실제 디렉토리 listing API 또는 manifest.json 방식으로 구현
 * 현재는 하드코딩 예시
 */
async function fetchTimestamps() {
  // TODO: GET /data/nus-mini/eval/manifest.json 등으로 교체
  return ["20260410_212913"];
}

// ─── 데이터 변환 헬퍼 ─────────────────────────────────────────────────────────

const prefix = "NuScenes metric/pred_instances_3d_NuScenes";

/** raw JSON → { mAP, NDS, apMatrix, errorMatrix, means } */
function parseEvalJson(raw) {
  // 요약 지표
  const mAP = raw[`${prefix}/mAP`];
  const NDS = raw[`${prefix}/NDS`];

  // 클래스별 AP (행: class, 열: dist threshold)
  const apMatrix = CLASSES.map((cls) =>
    DIST_THRESHOLDS.map((d) => raw[`${prefix}/${cls}_AP_dist_${d}`] ?? null)
  );

  // 클래스별 오류 지표
  const errorMatrix = CLASSES.map((cls) =>
    ERROR_KEYS.map(({ key }) => raw[`${prefix}/${cls}_${key}`] ?? null)
  );

  // 전체 평균 오류
  const means = MEAN_KEYS.map((k) => raw[`${prefix}/${k}`] ?? null);

  // 레이더용: 클래스별 평균 AP (4개 threshold 평균, null 제외)
  const radarData = CLASSES.map((_, i) => {
    const vals = apMatrix[i].filter((v) => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  });

  return { mAP, NDS, apMatrix, errorMatrix, means, radarData };
}

// ─── 서브 컴포넌트 ────────────────────────────────────────────────────────────

/** mAP / NDS 요약 카드 2개 */
function SummaryCards({ mAP, NDS }) {
  // TODO: Cursor — 카드 스타일링 및 포맷팅 구현
  return (
    <section>
      <h2>종합 지표</h2>
      <div className="metric-row">
        <div className="metric-card">
          <span className="label">NDS</span>
          <span className="value">{NDS?.toFixed(4) ?? "—"}</span>
        </div>
        <div className="metric-card">
          <span className="label">mAP</span>
          <span className="value">{mAP?.toFixed(4) ?? "—"}</span>
        </div>
      </div>
    </section>
  );
}

/**
 * 클래스 × dist threshold AP 히트맵 테이블
 * 값에 따라 셀 컬러 인코딩 필요
 */
function ApHeatmap({ apMatrix }) {
  // TODO: Cursor — 셀 컬러 인코딩 (값 범위에 따라 색상 분기)
  return (
    <section>
      <h2>클래스별 AP — 거리 임계값(m)</h2>
      <table>
        <thead>
          <tr>
            <th>클래스</th>
            {DIST_THRESHOLDS.map((d) => <th key={d}>{d}m</th>)}
            <th>평균</th>
          </tr>
        </thead>
        <tbody>
          {CLASSES.map((cls, i) => {
            const vals = apMatrix[i];
            const validVals = vals.filter((v) => v !== null);
            const avg = validVals.length
              ? validVals.reduce((a, b) => a + b, 0) / validVals.length
              : null;
            return (
              <tr key={cls}>
                <td>{cls}</td>
                {vals.map((v, j) => (
                  <td key={j}>{v !== null ? v.toFixed(3) : "—"}</td>
                ))}
                <td>{avg !== null ? avg.toFixed(3) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/**
 * 클래스별 평균 AP 레이더 차트
 * TODO: Cursor — Chart.js or Recharts RadarChart 연결
 */
function ApRadar({ radarData }) {
  return (
    <section>
      <h2>클래스별 AP 비교</h2>
      {/* TODO: Cursor — <RadarChart> 또는 Chart.js canvas 연결
          labels: CLASSES
          data: radarData
      */}
      <div style={{ height: 280 }} id="radar-canvas-placeholder" />
    </section>
  );
}

/**
 * 클래스별 오류 지표 테이블
 * null → "—" 표시, 값이 높을수록 나쁨 (컬러 반영)
 */
function ErrorTable({ errorMatrix, means }) {
  // TODO: Cursor — 오류 값 컬러 인코딩 (1.0 근접 = 빨강, 낮음 = 초록)
  return (
    <section>
      <h2>클래스별 오류 지표 (낮을수록 좋음)</h2>
      <table>
        <thead>
          <tr>
            <th>클래스</th>
            {ERROR_KEYS.map(({ label }) => <th key={label}>{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {CLASSES.map((cls, i) => (
            <tr key={cls}>
              <td>{cls}</td>
              {errorMatrix[i].map((v, j) => (
                <td key={j}>{v !== null ? v.toFixed(3) : "—"}</td>
              ))}
            </tr>
          ))}
          {/* 평균 행 */}
          <tr className="mean-row">
            <td>평균</td>
            {means.map((v, i) => (
              <td key={i}>{v !== null ? v.toFixed(4) : "—"}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </section>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function EvalDashboard() {
  const [timestamps, setTimestamps] = useState([]);
  const [selected, setSelected] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // timestamp 목록 초기 로딩
  useEffect(() => {
    fetchTimestamps().then((ts) => {
      setTimestamps(ts);
      if (ts.length > 0) setSelected(ts[ts.length - 1]); // 최신 run 기본 선택
    });
  }, []);

  // 선택된 timestamp에 맞는 eval JSON 로딩
  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    fetchEvalResult(selected)
      .then((raw) => setParsed(parseEvalJson(raw)))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selected]);

  return (
    <div className="eval-dashboard">
      {/* Run 선택 드롭다운 — run이 쌓이면 비교에 활용 */}
      <div className="run-selector">
        <label>Run</label>
        <select value={selected ?? ""} onChange={(e) => setSelected(e.target.value)}>
          {timestamps.map((ts) => (
            <option key={ts} value={ts}>{ts}</option>
          ))}
        </select>
      </div>

      {loading && <p>로딩 중...</p>}
      {error   && <p className="error">{error}</p>}

      {parsed && !loading && (
        <>
          <SummaryCards mAP={parsed.mAP} NDS={parsed.NDS} />
          <ApHeatmap    apMatrix={parsed.apMatrix} />
          <ApRadar      radarData={parsed.radarData} />
          <ErrorTable   errorMatrix={parsed.errorMatrix} means={parsed.means} />
        </>
      )}
    </div>
  );
}

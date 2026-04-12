/**
 * NuScenes-mini eval 메트릭 대시보드
 * (docs/architecture/nus-mini/EvalDashboard.jsx 스켈레톤 기준)
 */

import { useEffect, useState } from 'react'
import { resolveDataUrl } from '../../config/dataUrl.js'

const CLASSES = [
  'car',
  'truck',
  'construction_vehicle',
  'bus',
  'trailer',
  'barrier',
  'motorcycle',
  'bicycle',
  'pedestrian',
  'traffic_cone',
]

const DIST_THRESHOLDS = [0.5, 1.0, 2.0, 4.0]

const ERROR_KEYS = [
  { key: 'trans_err', label: 'Trans' },
  { key: 'scale_err', label: 'Scale' },
  { key: 'orient_err', label: 'Orient' },
  { key: 'vel_err', label: 'Vel' },
  { key: 'attr_err', label: 'Attr' },
]

const MEAN_KEYS = ['mATE', 'mASE', 'mAOE', 'mAVE', 'mAAE']

const prefix = 'NuScenes metric/pred_instances_3d_NuScenes'

async function fetchEvalResult(timestamp) {
  const url = resolveDataUrl(`nus-mini/eval/${timestamp}/${timestamp}.json`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  const sanitized = text.replace(/\bNaN\b/g, 'null')
  return JSON.parse(sanitized)
}

async function fetchTimestamps() {
  return ['20260410_212913']
}

function parseEvalJson(raw) {
  const mAP = raw[`${prefix}/mAP`]
  const NDS = raw[`${prefix}/NDS`]

  const apMatrix = CLASSES.map((cls) =>
    DIST_THRESHOLDS.map((d) => raw[`${prefix}/${cls}_AP_dist_${d}`] ?? null),
  )

  const errorMatrix = CLASSES.map((cls) =>
    ERROR_KEYS.map(({ key }) => raw[`${prefix}/${cls}_${key}`] ?? null),
  )

  const means = MEAN_KEYS.map((k) => raw[`${prefix}/${k}`] ?? null)

  const radarData = CLASSES.map((_, i) => {
    const vals = apMatrix[i].filter((v) => v !== null)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
  })

  return { mAP, NDS, apMatrix, errorMatrix, means, radarData }
}

function apCellStyle(v) {
  if (v === null) return {}
  const t = Math.max(0, Math.min(1, v))
  return {
    background: `color-mix(in srgb, var(--accent) ${Math.round(t * 85)}%, var(--code-bg))`,
  }
}

function errorCellStyle(v) {
  if (v === null) return {}
  const t = Math.max(0, Math.min(1, v))
  return {
    background: `color-mix(in srgb, #ef4444 ${Math.round(t * 70)}%, var(--code-bg))`,
  }
}

function SummaryCards({ mAP, NDS }) {
  return (
    <section className="eval-dash__section">
      <h2 className="eval-dash__h2">종합 지표</h2>
      <div className="eval-dash__metric-row">
        <div className="eval-dash__metric-card">
          <span className="eval-dash__metric-label">NDS</span>
          <span className="eval-dash__metric-value">{NDS != null ? NDS.toFixed(4) : '—'}</span>
        </div>
        <div className="eval-dash__metric-card">
          <span className="eval-dash__metric-label">mAP</span>
          <span className="eval-dash__metric-value">{mAP != null ? mAP.toFixed(4) : '—'}</span>
        </div>
      </div>
    </section>
  )
}

function ApHeatmap({ apMatrix }) {
  return (
    <section className="eval-dash__section">
      <h2 className="eval-dash__h2">클래스별 AP — 거리 임계값(m)</h2>
      <div className="eval-dash__table-wrap">
        <table className="eval-dash__table">
          <thead>
            <tr>
              <th>클래스</th>
              {DIST_THRESHOLDS.map((d) => (
                <th key={d}>{d}m</th>
              ))}
              <th>평균</th>
            </tr>
          </thead>
          <tbody>
            {CLASSES.map((cls, i) => {
              const vals = apMatrix[i]
              const validVals = vals.filter((v) => v !== null)
              const avg = validVals.length
                ? validVals.reduce((a, b) => a + b, 0) / validVals.length
                : null
              return (
                <tr key={cls}>
                  <td>{cls}</td>
                  {vals.map((v, j) => (
                    <td key={j} className="eval-dash__td-num" style={apCellStyle(v)}>
                      {v !== null ? v.toFixed(3) : '—'}
                    </td>
                  ))}
                  <td className="eval-dash__td-num">{avg !== null ? avg.toFixed(3) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ApRadar({ radarData }) {
  const max = Math.max(...radarData, 1e-6)
  return (
    <section className="eval-dash__section">
      <h2 className="eval-dash__h2">클래스별 평균 AP (막대)</h2>
      <ul className="eval-dash__radar-bars">
        {CLASSES.map((cls, i) => (
          <li key={cls} className="eval-dash__radar-row">
            <span className="eval-dash__radar-label">{cls}</span>
            <div className="eval-dash__radar-track">
              <div
                className="eval-dash__radar-fill"
                style={{ width: `${(radarData[i] / max) * 100}%` }}
              />
            </div>
            <span className="eval-dash__radar-val">{radarData[i].toFixed(3)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ErrorTable({ errorMatrix, means }) {
  return (
    <section className="eval-dash__section">
      <h2 className="eval-dash__h2">클래스별 오류 지표 (낮을수록 좋음)</h2>
      <div className="eval-dash__table-wrap">
        <table className="eval-dash__table">
          <thead>
            <tr>
              <th>클래스</th>
              {ERROR_KEYS.map(({ label }) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CLASSES.map((cls, i) => (
              <tr key={cls}>
                <td>{cls}</td>
                {errorMatrix[i].map((v, j) => (
                  <td key={j} className="eval-dash__td-num" style={errorCellStyle(v)}>
                    {v !== null ? v.toFixed(3) : '—'}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="eval-dash__mean-row">
              <td>평균 (mA*)</td>
              {means.map((v, i) => (
                <td key={i} className="eval-dash__td-num">
                  {v !== null ? v.toFixed(4) : '—'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function EvalDashboard() {
  const [timestamps, setTimestamps] = useState([])
  const [selected, setSelected] = useState(null)
  const [parsed, setParsed] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchTimestamps().then((ts) => {
      setTimestamps(ts)
      if (ts.length > 0) setSelected(ts[ts.length - 1])
    })
  }, [])

  useEffect(() => {
    if (!selected) return
    setLoading(true)
    setError(null)
    fetchEvalResult(selected)
      .then((raw) => setParsed(parseEvalJson(raw)))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [selected])

  return (
    <div className="eval-dashboard">
      <div className="eval-dash__run">
        <label className="eval-dash__run-label" htmlFor="eval-run-select">
          Run
        </label>
        <select
          id="eval-run-select"
          className="eval-dash__run-select"
          value={selected ?? ''}
          onChange={(e) => setSelected(e.target.value)}
        >
          {timestamps.map((ts) => (
            <option key={ts} value={ts}>
              {ts}
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="eval-dash__status">로딩 중…</p>}
      {error && <p className="eval-dash__error">{error}</p>}

      {parsed && !loading && (
        <>
          <SummaryCards mAP={parsed.mAP} NDS={parsed.NDS} />
          <ApHeatmap apMatrix={parsed.apMatrix} />
          <ApRadar radarData={parsed.radarData} />
          <ErrorTable errorMatrix={parsed.errorMatrix} means={parsed.means} />
        </>
      )}
    </div>
  )
}

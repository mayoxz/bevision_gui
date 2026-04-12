/**
 * NuScenes-mini smoke(train) 스칼라 시각화 — vis_data/scalars.json (JSONL)
 */

import { useEffect, useMemo, useState } from 'react'
import { resolveDataUrl } from '../../config/dataUrl.js'

const LOSS_SERIES = [
  { key: 'loss', label: 'loss', color: '#a855f7' },
  { key: 'loss_heatmap', label: 'loss_heatmap', color: '#22c55e' },
  { key: 'layer_-1_loss_cls', label: 'layer_-1_loss_cls', color: '#3b82f6' },
  { key: 'layer_-1_loss_bbox', label: 'layer_-1_loss_bbox', color: '#f97316' },
]

const TIMING_SERIES = [
  { key: 'data_time', label: 'data_time', color: '#38bdf8' },
  { key: 'time', label: 'time', color: '#f472b6' },
]

const LR_SERIES = [{ key: 'lr', label: 'lr', color: '#a855f7' }]
const GRAD_SERIES = [{ key: 'grad_norm', label: 'grad_norm', color: '#eab308' }]
const MEM_SERIES = [{ key: 'memory', label: 'memory', color: '#94a3b8' }]

async function fetchTimestamps() {
  return ['20260410_210326']
}

function parseJsonl(text) {
  const rows = []
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    const sanitized = t.replace(/\bNaN\b/g, 'null')
    try {
      rows.push(JSON.parse(sanitized))
    } catch {
      /* skip */
    }
  }
  return rows
}

async function fetchScalars(timestamp) {
  const url = resolveDataUrl(`nus-mini/smoke/${timestamp}/vis_data/scalars.json`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return parseJsonl(await res.text())
}

function finiteMinMax(rows, keys) {
  let min = Infinity
  let max = -Infinity
  for (const row of rows) {
    for (const k of keys) {
      const v = row[k]
      if (typeof v === 'number' && Number.isFinite(v)) {
        if (v < min) min = v
        if (v > max) max = v
      }
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 }
  if (min === max) {
    const d = Math.abs(min) || 1
    return { min: min - d * 0.05, max: max + d * 0.05 }
  }
  const pad = (max - min) * 0.05
  return { min: min - pad, max: max + pad }
}

function stepRange(rows) {
  if (!rows.length) return { min: 0, max: 1 }
  const steps = rows.map((r) => r.step).filter((s) => typeof s === 'number' && Number.isFinite(s))
  if (!steps.length) return { min: 0, max: 1 }
  return { min: Math.min(...steps), max: Math.max(...steps) }
}

function ScalarLineChart({ title, rows, series, xKey = 'step' }) {
  const W = 720
  const H = 220
  const padL = 52
  const padR = 16
  const padT = 12
  const padB = 32

  const innerW = W - padL - padR
  const innerH = H - padT - padB

  const xR = stepRange(rows)
  const keys = series.map((s) => s.key)
  const yR = finiteMinMax(rows, keys)

  const sx = (x) => padL + ((x - xR.min) / (xR.max - xR.min || 1)) * innerW
  const sy = (y) => padT + innerH - ((y - yR.min) / (yR.max - yR.min || 1)) * innerH

  const paths = useMemo(() => {
    return series.map(({ key }) => {
      const pts = rows
        .map((row) => {
          const xv = row[xKey]
          const yv = row[key]
          if (typeof xv !== 'number' || !Number.isFinite(xv)) return null
          if (typeof yv !== 'number' || !Number.isFinite(yv)) return null
          return { x: xv, y: yv }
        })
        .filter(Boolean)
      if (pts.length === 0) return { d: '', empty: true }
      let d = `M ${sx(pts[0].x)} ${sy(pts[0].y)}`
      for (let i = 1; i < pts.length; i++) {
        d += ` L ${sx(pts[i].x)} ${sy(pts[i].y)}`
      }
      return { d, empty: false }
    })
  }, [rows, series, xKey, xR.min, xR.max, yR.min, yR.max])

  const hasAny = paths.some((p) => !p.empty)

  return (
    <section className="eval-dash__section">
      <h2 className="eval-dash__h2">{title}</h2>
      {!hasAny ? (
        <p className="eval-dash__status">표시할 유효한 숫자 값이 없습니다.</p>
      ) : (
        <>
          <div className="smoke-chart">
            <svg
              className="smoke-chart__svg"
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="xMidYMid meet"
              aria-hidden
            >
              <rect x={padL} y={padT} width={innerW} height={innerH} fill="none" stroke="var(--border)" strokeWidth="1" />
              <text x={padL} y={H - 8} fontSize="11" fill="var(--text)" fontFamily="var(--mono)">
                step {Math.round(xR.min)} — {Math.round(xR.max)}
              </text>
              <text x={8} y={padT + 12} fontSize="11" fill="var(--text)" fontFamily="var(--mono)">
                {yR.max.toPrecision(4)}
              </text>
              <text x={8} y={padT + innerH} fontSize="11" fill="var(--text)" fontFamily="var(--mono)">
                {yR.min.toPrecision(4)}
              </text>
              {series.map((s, i) =>
                paths[i].empty ? null : (
                  <path
                    key={s.key}
                    d={paths[i].d}
                    fill="none"
                    stroke={s.color}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ),
              )}
            </svg>
            <div className="smoke-chart__legend">
              {series.map((s) => (
                <span key={s.key} className="smoke-chart__legend-item">
                  <span className="smoke-chart__swatch" style={{ background: s.color }} />
                  {s.label}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function SummaryStrip({ rows }) {
  const last = rows.length ? rows[rows.length - 1] : null
  const maxMem = useMemo(() => {
    let m = -Infinity
    for (const r of rows) {
      if (typeof r.memory === 'number' && Number.isFinite(r.memory) && r.memory > m) m = r.memory
    }
    return Number.isFinite(m) ? m : null
  }, [rows])

  return (
    <section className="eval-dash__section">
      <h2 className="eval-dash__h2">요약 (마지막 스텝)</h2>
      <div className="eval-dash__metric-row">
        <div className="eval-dash__metric-card">
          <span className="eval-dash__metric-label">records</span>
          <span className="eval-dash__metric-value">{rows.length}</span>
        </div>
        <div className="eval-dash__metric-card">
          <span className="eval-dash__metric-label">step</span>
          <span className="eval-dash__metric-value">{last?.step ?? '—'}</span>
        </div>
        <div className="eval-dash__metric-card">
          <span className="eval-dash__metric-label">loss</span>
          <span className="eval-dash__metric-value">
            {last != null && typeof last.loss === 'number' && Number.isFinite(last.loss)
              ? last.loss.toFixed(4)
              : '—'}
          </span>
        </div>
        <div className="eval-dash__metric-card">
          <span className="eval-dash__metric-label">lr</span>
          <span className="eval-dash__metric-value">
            {last != null && typeof last.lr === 'number' && Number.isFinite(last.lr)
              ? last.lr.toExponential(2)
              : '—'}
          </span>
        </div>
        <div className="eval-dash__metric-card">
          <span className="eval-dash__metric-label">memory max (MB)</span>
          <span className="eval-dash__metric-value">{maxMem != null ? String(Math.round(maxMem)) : '—'}</span>
        </div>
      </div>
    </section>
  )
}

export default function SmokeDashboard() {
  const [timestamps, setTimestamps] = useState([])
  const [selected, setSelected] = useState(null)
  const [rows, setRows] = useState([])
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
    fetchScalars(selected)
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [selected])

  return (
    <div className="eval-dashboard">
      <div className="eval-dash__run">
        <label className="eval-dash__run-label" htmlFor="smoke-run-select">
          Run
        </label>
        <select
          id="smoke-run-select"
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

      {!loading && rows.length > 0 && (
        <>
          <SummaryStrip rows={rows} />
          <ScalarLineChart title="Loss 구성 요소 (step)" rows={rows} series={LOSS_SERIES} />
          <ScalarLineChart title="Learning rate" rows={rows} series={LR_SERIES} />
          <ScalarLineChart
            title="Gradient norm (NaN 구간 제외)"
            rows={rows}
            series={GRAD_SERIES}
          />
          <ScalarLineChart title="시간 (초 / step)" rows={rows} series={TIMING_SERIES} />
          <ScalarLineChart title="GPU memory (MB)" rows={rows} series={MEM_SERIES} />
        </>
      )}

      {!loading && !error && rows.length === 0 && selected && (
        <p className="eval-dash__status">스칼라 레코드가 없습니다.</p>
      )}
    </div>
  )
}

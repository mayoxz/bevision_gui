/**
 * NuScenes (full) eval 대시보드
 * - 이미지 뷰어 (vis_final_integrated)
 * - Inference timing 라인차트 (로그 파싱)
 * - 요약 카드
 */

import { useEffect, useMemo, useState } from 'react'
import { resolveDataUrl } from '../../config/dataUrl.js'

const TIMESTAMPS = ['20260411_211747']

// ─── 로그 파싱 ────────────────────────────────────────────────────────────────

// "Epoch(test) [50/6008]  ... time: 1.02  data_time: 0.80  memory: 2227"
const LOG_LINE_RE = /Epoch\(test\)\s+\[(\d+)\/(\d+)\].*?time:\s*([\d.]+).*?data_time:\s*([\d.]+)(?:.*?memory:\s*(\d+))?/

function parseLog(text) {
  const rows = []
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(LOG_LINE_RE)
    if (!m) continue
    rows.push({
      step: parseInt(m[1], 10),
      total: parseInt(m[2], 10),
      time: parseFloat(m[3]),
      data_time: parseFloat(m[4]),
      memory: m[5] ? parseInt(m[5], 10) : null,
    })
  }
  return rows
}

async function fetchLog(timestamp) {
  const url = resolveDataUrl(`nuscenes/${timestamp}/${timestamp}.log`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return parseLog(await res.text())
}

async function fetchImages(timestamp) {
  const url = resolveDataUrl(`nuscenes/${timestamp}/vis_final_integrated/index.json`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const { images } = await res.json()
  return images.map((f) => ({
    filename: f,
    url: resolveDataUrl(`nuscenes/${timestamp}/vis_final_integrated/${f}`),
    label: f.replace(/__CAM_FRONT.*$/, '').slice(0, 35) + '…',
  }))
}

// ─── 차트 ─────────────────────────────────────────────────────────────────────

function finiteMinMax(rows, key) {
  let min = Infinity, max = -Infinity
  for (const r of rows) {
    const v = r[key]
    if (typeof v === 'number' && Number.isFinite(v)) {
      if (v < min) min = v
      if (v > max) max = v
    }
  }
  if (!Number.isFinite(min)) return { min: 0, max: 1 }
  if (min === max) { const d = Math.abs(min) || 1; return { min: min - d * 0.05, max: max + d * 0.05 } }
  const pad = (max - min) * 0.05
  return { min: min - pad, max: max + pad }
}

function TimingChart({ title, rows, seriesKey, color }) {
  const W = 720, H = 200
  const padL = 52, padR = 16, padT = 12, padB = 32
  const innerW = W - padL - padR
  const innerH = H - padT - padB

  const xMin = rows.length ? rows[0].step : 0
  const xMax = rows.length ? rows[rows.length - 1].step : 1
  const yR = finiteMinMax(rows, seriesKey)

  const sx = (x) => padL + ((x - xMin) / (xMax - xMin || 1)) * innerW
  const sy = (y) => padT + innerH - ((y - yR.min) / (yR.max - yR.min || 1)) * innerH

  const d = useMemo(() => {
    const pts = rows.filter((r) => typeof r[seriesKey] === 'number' && Number.isFinite(r[seriesKey]))
    if (!pts.length) return ''
    return pts.map((r, i) => `${i === 0 ? 'M' : 'L'} ${sx(r.step)} ${sy(r[seriesKey])}`).join(' ')
  }, [rows, seriesKey])

  return (
    <section className="eval-dash__section">
      <h2 className="eval-dash__h2">{title}</h2>
      <div className="smoke-chart">
        <svg className="smoke-chart__svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
          <rect x={padL} y={padT} width={innerW} height={innerH} fill="none" stroke="var(--border)" strokeWidth="1" />
          <text x={padL} y={H - 8} fontSize="11" fill="var(--text)" fontFamily="var(--mono)">
            sample {xMin} — {xMax}
          </text>
          <text x={8} y={padT + 12} fontSize="11" fill="var(--text)" fontFamily="var(--mono)">{yR.max.toPrecision(4)}</text>
          <text x={8} y={padT + innerH} fontSize="11" fill="var(--text)" fontFamily="var(--mono)">{yR.min.toPrecision(4)}</text>
          {d && <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
        </svg>
      </div>
    </section>
  )
}

// ─── 이미지 뷰어 ──────────────────────────────────────────────────────────────

function ImageViewer({ images }) {
  const [idx, setIdx] = useState(0)
  if (!images.length) return null
  const cur = images[idx]

  return (
    <section className="eval-dash__section">
      <h2 className="eval-dash__h2">Inference 시각화 (BEV 콜라주)</h2>
      {images.length > 1 && (
        <div className="eval-dash__run" style={{ marginBottom: '8px' }}>
          {images.map((img, i) => (
            <button
              key={img.filename}
              onClick={() => setIdx(i)}
              className={`eval-dash__run-select${i === idx ? ' eval-dash__run-select--active' : ''}`}
              style={{ marginRight: '6px', cursor: 'pointer', opacity: i === idx ? 1 : 0.5 }}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
      <img
        src={cur.url}
        alt={cur.filename}
        style={{ width: '100%', borderRadius: '4px', display: 'block' }}
      />
      <p style={{ fontSize: '11px', color: 'var(--text-muted, #888)', marginTop: '4px', fontFamily: 'var(--mono)' }}>
        {cur.filename}
      </p>
    </section>
  )
}

// ─── 요약 카드 ────────────────────────────────────────────────────────────────

function SummaryStrip({ rows }) {
  const last = rows.length ? rows[rows.length - 1] : null
  const avgTime = useMemo(() => {
    const vals = rows.map((r) => r.time).filter(Number.isFinite)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }, [rows])
  const maxMem = useMemo(() => {
    let m = -Infinity
    for (const r of rows) if (typeof r.memory === 'number' && r.memory > m) m = r.memory
    return Number.isFinite(m) ? m : null
  }, [rows])

  return (
    <section className="eval-dash__section">
      <h2 className="eval-dash__h2">요약</h2>
      <div className="eval-dash__metric-row">
        <div className="eval-dash__metric-card">
          <span className="eval-dash__metric-label">총 샘플</span>
          <span className="eval-dash__metric-value">{last?.total ?? '—'}</span>
        </div>
        <div className="eval-dash__metric-card">
          <span className="eval-dash__metric-label">평균 time (s)</span>
          <span className="eval-dash__metric-value">{avgTime != null ? avgTime.toFixed(3) : '—'}</span>
        </div>
        <div className="eval-dash__metric-card">
          <span className="eval-dash__metric-label">GPU memory max (MB)</span>
          <span className="eval-dash__metric-value">{maxMem != null ? String(maxMem) : '—'}</span>
        </div>
        <div className="eval-dash__metric-card">
          <span className="eval-dash__metric-label">log 포인트</span>
          <span className="eval-dash__metric-value">{rows.length}</span>
        </div>
      </div>
    </section>
  )
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────

export default function NuscenesEvalDashboard() {
  const [selected, setSelected] = useState(TIMESTAMPS[TIMESTAMPS.length - 1])
  const [rows, setRows] = useState([])
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!selected) return
    setLoading(true)
    setError(null)
    Promise.all([fetchLog(selected), fetchImages(selected)])
      .then(([logRows, imgs]) => { setRows(logRows); setImages(imgs) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [selected])

  return (
    <div className="eval-dashboard">
      <div className="eval-dash__run">
        <label className="eval-dash__run-label" htmlFor="nuscenes-run-select">Run</label>
        <select
          id="nuscenes-run-select"
          className="eval-dash__run-select"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          {TIMESTAMPS.map((ts) => (
            <option key={ts} value={ts}>{ts}</option>
          ))}
        </select>
      </div>

      {loading && <p className="eval-dash__status">로딩 중…</p>}
      {error && <p className="eval-dash__error">{error}</p>}

      {!loading && !error && (
        <>
          {rows.length > 0 && <SummaryStrip rows={rows} />}
          {images.length > 0 && <ImageViewer images={images} />}
          {rows.length > 0 && (
            <>
              <TimingChart title="Inference time (s / batch)" rows={rows} seriesKey="time" color="#f97316" />
              <TimingChart title="Data loading time (s / batch)" rows={rows} seriesKey="data_time" color="#38bdf8" />
              <TimingChart title="GPU memory (MB)" rows={rows} seriesKey="memory" color="#94a3b8" />
            </>
          )}
        </>
      )}
    </div>
  )
}

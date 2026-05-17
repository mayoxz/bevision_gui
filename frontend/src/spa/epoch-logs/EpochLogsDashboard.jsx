/**
 * Epoch summary logs (epoch_logs/*.txt)
 */

import { useEffect, useMemo, useState } from 'react'
import { resolveDataUrl } from '../../config/dataUrl.js'

const EPOCH_IDS = Array.from({ length: 8 }, (_, i) => String(i + 1).padStart(2, '0'))

const LOSS_SERIES = [
  { key: 'loss', label: 'Total Loss', color: '#a855f7' },
  { key: 'loss_cls', label: 'Loss_cls', color: '#3b82f6' },
  { key: 'loss_bbox', label: 'Loss_bbox', color: '#f97316' },
  { key: 'loss_dir', label: 'Loss_dir', color: '#22c55e' },
]

function parseEpochLog(text, epochId) {
  const epoch = parseInt(epochId, 10)
  const pick = (re) => {
    const m = text.match(re)
    return m ? parseFloat(m[1]) : null
  }
  return {
    epoch,
    loss: pick(/Total Loss\s*:\s*([\d.]+)/i),
    loss_cls: pick(/Loss_cls[^:]*:\s*([\d.]+)/i),
    loss_bbox: pick(/Loss_bbox[^:]*:\s*([\d.]+)/i),
    loss_dir: pick(/Loss_dir[^:]*:\s*([\d.]+)/i),
  }
}

async function fetchEpochLog(epochId) {
  const url = resolveDataUrl(`epoch_logs/epoch_${epochId}_log.txt`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`epoch_${epochId}: HTTP ${res.status}`)
  return parseEpochLog(await res.text(), epochId)
}

async function fetchAllEpochLogs() {
  const results = await Promise.allSettled(EPOCH_IDS.map(fetchEpochLog))
  const rows = []
  const errors = []
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    if (r.status === 'fulfilled') rows.push(r.value)
    else errors.push(r.reason?.message ?? String(r.reason))
  }
  rows.sort((a, b) => a.epoch - b.epoch)
  if (!rows.length) throw new Error(errors[0] ?? 'Failed to load logs')
  return { rows, errors }
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

function epochRange(rows) {
  if (!rows.length) return { min: 1, max: 1 }
  return { min: rows[0].epoch, max: rows[rows.length - 1].epoch }
}

function fmtNum(v) {
  return v != null && Number.isFinite(v) ? v.toFixed(4) : '-'
}

function EpochSortIcon({ direction }) {
  const active = 'currentColor'
  const muted = 'color-mix(in srgb, currentColor 35%, transparent)'
  return (
    <svg className="eval-dash__sort-icon" width="12" height="14" viewBox="0 0 12 14" aria-hidden>
      <path d="M6 1.5 10.5 7.5H1.5Z" fill={direction === 'asc' ? active : muted} />
      <path d="M6 12.5 1.5 6.5h9Z" fill={direction === 'desc' ? active : muted} />
    </svg>
  )
}

function LossLineChart({ title, rows, series }) {
  const W = 720
  const H = 220
  const padL = 52
  const padR = 16
  const padT = 12
  const padB = 32
  const innerW = W - padL - padR
  const innerH = H - padT - padB

  const xR = epochRange(rows)
  const keys = series.map((s) => s.key)
  const yR = finiteMinMax(rows, keys)

  const sx = (x) => padL + ((x - xR.min) / (xR.max - xR.min || 1)) * innerW
  const sy = (y) => padT + innerH - ((y - yR.min) / (yR.max - yR.min || 1)) * innerH

  const seriesData = useMemo(() => {
    return series.map(({ key }) => {
      const pts = rows
        .map((row) => {
          const yv = row[key]
          if (typeof yv !== 'number' || !Number.isFinite(yv)) return null
          return { x: row.epoch, y: yv }
        })
        .filter(Boolean)
      if (!pts.length) return { d: '', dots: [], empty: true }
      let d = `M ${sx(pts[0].x)} ${sy(pts[0].y)}`
      for (let i = 1; i < pts.length; i++) d += ` L ${sx(pts[i].x)} ${sy(pts[i].y)}`
      const dots = pts.map((p) => ({ cx: sx(p.x), cy: sy(p.y) }))
      return { d, dots, empty: false }
    })
  }, [rows, series, xR.min, xR.max, yR.min, yR.max])

  const hasAny = seriesData.some((p) => !p.empty)

  return (
    <section className="eval-dash__section">
      <h2 className="eval-dash__h2">{title}</h2>
      {!hasAny ? (
        <p className="eval-dash__status">No loss values to display.</p>
      ) : (
        <div className="smoke-chart">
          <svg className="smoke-chart__svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
            <rect x={padL} y={padT} width={innerW} height={innerH} fill="none" stroke="var(--border)" strokeWidth="1" />
            <text x={padL} y={H - 8} fontSize="11" fill="var(--text)" fontFamily="var(--mono)">
              epoch {xR.min}-{xR.max}
            </text>
            <text x={8} y={padT + 12} fontSize="11" fill="var(--text)" fontFamily="var(--mono)">
              {yR.max.toPrecision(4)}
            </text>
            <text x={8} y={padT + innerH} fontSize="11" fill="var(--text)" fontFamily="var(--mono)">
              {yR.min.toPrecision(4)}
            </text>
            {series.map((s, i) =>
              seriesData[i].empty ? null : (
                <g key={s.key}>
                  <path
                    d={seriesData[i].d}
                    fill="none"
                    stroke={s.color}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {seriesData[i].dots.map((dot, j) => (
                    <circle
                      key={j}
                      cx={dot.cx}
                      cy={dot.cy}
                      r={4}
                      fill={s.color}
                      stroke="var(--bg, #0f1419)"
                      strokeWidth="1.5"
                    />
                  ))}
                </g>
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
      )}
    </section>
  )
}

function SummaryStrip({ rows }) {
  const first = rows[0]
  const last = rows[rows.length - 1]
  const delta =
    first?.loss != null && last?.loss != null && Number.isFinite(first.loss) && Number.isFinite(last.loss)
      ? last.loss - first.loss
      : null

  return (
    <section className="eval-dash__section">
      <h2 className="eval-dash__h2">Summary</h2>
      <div className="eval-dash__metric-row">
        <div className="eval-dash__metric-card">
          <span className="eval-dash__metric-label">epochs</span>
          <span className="eval-dash__metric-value">{rows.length}</span>
        </div>
        <div className="eval-dash__metric-card">
          <span className="eval-dash__metric-label">Total Loss (last)</span>
          <span className="eval-dash__metric-value">{fmtNum(last?.loss)}</span>
        </div>
        <div className="eval-dash__metric-card">
          <span className="eval-dash__metric-label">Total Loss (first)</span>
          <span className="eval-dash__metric-value">{fmtNum(first?.loss)}</span>
        </div>
        <div className="eval-dash__metric-card">
          <span className="eval-dash__metric-label">delta loss</span>
          <span className="eval-dash__metric-value">{delta != null ? delta.toFixed(4) : '-'}</span>
        </div>
      </div>
    </section>
  )
}

function EpochTable({ rows }) {
  const [epochSort, setEpochSort] = useState('asc')

  const sortedRows = useMemo(() => {
    const copy = [...rows]
    copy.sort((a, b) => (epochSort === 'asc' ? a.epoch - b.epoch : b.epoch - a.epoch))
    return copy
  }, [rows, epochSort])

  const epochRangeLabel =
    sortedRows.length > 0
      ? `(${sortedRows[0].epoch}-${sortedRows[sortedRows.length - 1].epoch})`
      : ''

  return (
    <section className="eval-dash__section">
      <h2 className="eval-dash__h2">Per epoch</h2>
      <div className="eval-dash__table-wrap">
        <table className="eval-dash__table">
          <thead>
            <tr>
              <th>
                <button
                  type="button"
                  className="eval-dash__th-sort"
                  onClick={() => setEpochSort((s) => (s === 'asc' ? 'desc' : 'asc'))}
                  aria-sort={epochSort === 'asc' ? 'ascending' : 'descending'}
                  aria-label={`Epoch sort ${epochSort === 'asc' ? 'ascending' : 'descending'}`}
                >
                  <span>Epoch {epochRangeLabel}</span>
                  <EpochSortIcon direction={epochSort} />
                </button>
              </th>
              <th>Total</th>
              <th>cls</th>
              <th>bbox</th>
              <th>dir</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => (
              <tr key={r.epoch}>
                <td>{r.epoch}</td>
                <td className="eval-dash__td-num">{fmtNum(r.loss)}</td>
                <td className="eval-dash__td-num">{fmtNum(r.loss_cls)}</td>
                <td className="eval-dash__td-num">{fmtNum(r.loss_bbox)}</td>
                <td className="eval-dash__td-num">{fmtNum(r.loss_dir)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function EpochLogsDashboard() {
  const [rows, setRows] = useState([])
  const [warnings, setWarnings] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchAllEpochLogs()
      .then(({ rows: data, errors }) => {
        setRows(data)
        setWarnings(errors)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="eval-dashboard">
      {loading && <p className="eval-dash__status">Loading...</p>}
      {error && <p className="eval-dash__error">{error}</p>}
      {warnings.length > 0 && (
        <p className="eval-dash__status">Some files failed: {warnings.join('; ')}</p>
      )}

      {!loading && !error && rows.length > 0 && (
        <>
          <SummaryStrip rows={rows} />
          <LossLineChart title="Loss by epoch" rows={rows} series={LOSS_SERIES} />
          <EpochTable rows={rows} />
        </>
      )}
    </div>
  )
}

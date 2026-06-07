/**
 * Epoch summary logs (epoch_logs/*.txt)
 */

import { useEffect, useId, useMemo, useState } from 'react'
import { resolveDataUrl } from '../../config/dataUrl.js'

const EPOCH_SCAN_MAX = 24
const EPOCH_SCAN_MISS_LIMIT = 5

const LOSS_SERIES = [
  { key: 'loss', label: 'Total Loss', color: '#a855f7' },
]

const DETAIL_LOSS_SERIES = [
  { key: 'loss_cls', label: 'Loss_cls', color: '#3b82f6' },
  { key: 'loss_bbox', label: 'Loss_bbox', color: '#f97316' },
  { key: 'loss_dir', label: 'Loss_dir', color: '#22c55e' },
]

const SVG_STYLE_PROPS = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'letter-spacing',
  'text-anchor',
]

function parseEpochLog(text, epochId) {
  const epoch = parseInt(epochId, 10)
  const pick = (re) => {
    const m = text.match(re)
    return m ? parseFloat(m[1]) : null
  }
  return {
    epoch,
    loss: pick(/Total Loss[^:]*:\s*([+-]?\d+(?:\.\d+)?)/i),
    loss_cls: pick(/Loss_cls[^:]*:\s*([+-]?\d+(?:\.\d+)?)/i),
    loss_bbox: pick(/Loss_bbox[^:]*:\s*([+-]?\d+(?:\.\d+)?)/i),
    loss_dir: pick(/Loss_dir[^:]*:\s*([+-]?\d+(?:\.\d+)?)/i),
  }
}

function hasParsedMetrics(row) {
  return ['loss', 'loss_cls', 'loss_bbox', 'loss_dir'].some((key) => Number.isFinite(row[key]))
}

function epochIdToCandidates(epochId) {
  return [`epoch_${epochId}_log.txt`, `epoch_${epochId}_train.txt`]
}

async function fetchTextIfExists(path) {
  const url = resolveDataUrl(path)
  const res = await fetch(url)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  return res.text()
}

async function fetchEpochLog(epochId) {
  const candidates = epochIdToCandidates(epochId)
  for (const name of candidates) {
    const text = await fetchTextIfExists(`epoch_logs/${name}`)
    if (text == null) continue
    const row = parseEpochLog(await text, epochId)
    if (hasParsedMetrics(row)) return row
  }
  return null
}

async function fetchAllEpochLogs() {
  const rows = []
  const errors = []
  let misses = 0

  for (let epoch = 1; epoch <= EPOCH_SCAN_MAX; epoch++) {
    const epochId = String(epoch).padStart(2, '0')
    try {
      const row = await fetchEpochLog(epochId)
      if (row) {
        rows.push(row)
        misses = 0
      } else {
        misses += 1
        if (rows.length > 0 && misses >= EPOCH_SCAN_MISS_LIMIT) break
      }
    } catch (e) {
      errors.push(e.message ?? String(e))
    }
  }

  rows.sort((a, b) => a.epoch - b.epoch)
  if (!rows.length) throw new Error(errors[0] ?? 'Failed to load logs')
  return { rows, errors }
}

function finiteMinMax(rows, keys) {
  let max = -Infinity
  for (const row of rows) {
    for (const k of keys) {
      const v = row[k]
      if (typeof v === 'number' && Number.isFinite(v)) {
        if (v > max) max = v
      }
    }
  }
  if (!Number.isFinite(max)) return { min: 0, max: 1 }
  if (max === 0) return { min: 0, max: 1 }
  return { min: 0, max: max * 1.05 }
}

function epochRange(rows) {
  if (!rows.length) return { min: 1, max: 1 }
  return { min: rows[0].epoch, max: rows[rows.length - 1].epoch }
}

function fmtNum(v) {
  return v != null && Number.isFinite(v) ? v.toFixed(4) : '-'
}

const INCREASE_ALERT_COLOR = '#dc2626'

function formatExportTimestamp(date = new Date()) {
  const yy = String(date.getFullYear()).slice(-2)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  return `${yy}${mm}${dd}_${hh}${mi}`
}

function sanitizeChartTitle(title) {
  return title
    .replace(/\s+/g, '_')
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/_+/g, '_')
}

function inlineSvgStyles(sourceSvg, targetSvg) {
  const sourceNodes = [sourceSvg, ...sourceSvg.querySelectorAll('*')]
  const targetNodes = [targetSvg, ...targetSvg.querySelectorAll('*')]
  for (let i = 0; i < sourceNodes.length; i++) {
    const sourceNode = sourceNodes[i]
    const targetNode = targetNodes[i]
    if (!sourceNode || !targetNode) continue
    const computed = window.getComputedStyle(sourceNode)
    for (const prop of SVG_STYLE_PROPS) {
      targetNode.style.setProperty(prop, computed.getPropertyValue(prop))
    }
  }
}

function getExportColors() {
  const rootStyles = window.getComputedStyle(document.documentElement)
  const pick = (name, fallback) => rootStyles.getPropertyValue(name).trim() || fallback
  return {
    cardBg: pick('--code-bg', '#f8fafc'),
    text: pick('--text', '#4b5563'),
    textHeading: pick('--text-h', '#111827'),
    border: pick('--border', '#d1d5db'),
  }
}

async function saveSvgAsPng(svgElement, title, series) {
  const serializer = new XMLSerializer()
  const clonedSvg = svgElement.cloneNode(true)
  const viewBox = svgElement.viewBox.baseVal
  const chartWidth = Math.ceil(viewBox?.width || svgElement.clientWidth || 720)
  const chartHeight = Math.ceil(viewBox?.height || svgElement.clientHeight || 220)
  const exportColors = getExportColors()
  const legendItems = [...series, { key: 'increase-alert', label: 'Increase alert', color: INCREASE_ALERT_COLOR }]
  const legendRows = Math.max(1, Math.ceil(legendItems.length / 3))
  const width = chartWidth
  const height = chartHeight + 44 + legendRows * 22 + 20
  const cardRadius = 8

  clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clonedSvg.setAttribute('width', String(chartWidth))
  clonedSvg.setAttribute('height', String(chartHeight))
  clonedSvg.style.backgroundColor = exportColors.cardBg
  inlineSvgStyles(svgElement, clonedSvg)

  const exportSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  exportSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  exportSvg.setAttribute('width', String(width))
  exportSvg.setAttribute('height', String(height))
  exportSvg.setAttribute('viewBox', `0 0 ${width} ${height}`)

  const cardRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  cardRect.setAttribute('x', '0.5')
  cardRect.setAttribute('y', '0.5')
  cardRect.setAttribute('width', String(width - 1))
  cardRect.setAttribute('height', String(height - 1))
  cardRect.setAttribute('rx', String(cardRadius))
  cardRect.setAttribute('fill', exportColors.cardBg)
  cardRect.setAttribute('stroke', exportColors.border)
  cardRect.setAttribute('stroke-width', '1')
  exportSvg.appendChild(cardRect)

  const titleText = document.createElementNS('http://www.w3.org/2000/svg', 'text')
  titleText.setAttribute('x', '16')
  titleText.setAttribute('y', '24')
  titleText.setAttribute('fill', exportColors.textHeading)
  titleText.setAttribute('opacity', '1')
  titleText.setAttribute('font-family', 'Segoe UI, sans-serif')
  titleText.setAttribute('font-size', '18')
  titleText.setAttribute('font-weight', '600')
  titleText.textContent = title
  exportSvg.appendChild(titleText)

  const chartGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  chartGroup.setAttribute('transform', 'translate(0 36)')
  chartGroup.appendChild(clonedSvg)
  exportSvg.appendChild(chartGroup)

  const legendTop = 36 + chartHeight + 18
  legendItems.forEach((item, index) => {
    const col = index % 3
    const row = Math.floor(index / 3)
    const x = 16 + col * 220
    const y = legendTop + row * 22

    const swatch = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    swatch.setAttribute('x', String(x))
    swatch.setAttribute('y', String(y - 9))
    swatch.setAttribute('width', '10')
    swatch.setAttribute('height', '10')
    swatch.setAttribute('rx', '2')
    swatch.setAttribute('fill', item.color)
    exportSvg.appendChild(swatch)

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    label.setAttribute('x', String(x + 18))
    label.setAttribute('y', String(y))
    label.setAttribute('fill', exportColors.textHeading)
    label.setAttribute('opacity', '1')
    label.setAttribute('font-family', 'Segoe UI, sans-serif')
    label.setAttribute('font-size', '12')
    label.setAttribute('font-weight', '500')
    label.textContent = item.label
    exportSvg.appendChild(label)
  })

  const svgText = serializer.serializeToString(exportSvg)
  const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  try {
    await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = width * 2
        canvas.height = height * 2
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas context unavailable'))
          return
        }
        ctx.scale(2, 2)
        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob((pngBlob) => {
          if (!pngBlob) {
            reject(new Error('PNG export failed'))
            return
          }
          const downloadUrl = URL.createObjectURL(pngBlob)
          const a = document.createElement('a')
          a.href = downloadUrl
          a.download = `${formatExportTimestamp()}_${sanitizeChartTitle(title)}.png`
          a.click()
          URL.revokeObjectURL(downloadUrl)
          resolve()
        }, 'image/png')
      }
      img.onerror = () => reject(new Error('SVG image load failed'))
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
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
  const chartId = useId()
  const [saving, setSaving] = useState(false)
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
      if (!pts.length) return { d: '', dots: [], increaseSegments: [], increaseDots: [], empty: true }
      let d = `M ${sx(pts[0].x)} ${sy(pts[0].y)}`
      for (let i = 1; i < pts.length; i++) d += ` L ${sx(pts[i].x)} ${sy(pts[i].y)}`
      const dots = pts.map((p) => ({ cx: sx(p.x), cy: sy(p.y), x: p.x, y: p.y }))
      const increaseSegments = []
      const increaseDots = []
      for (let i = 1; i < pts.length; i++) {
        if (pts[i].y > pts[i - 1].y) {
          increaseSegments.push({
            d: `M ${sx(pts[i - 1].x)} ${sy(pts[i - 1].y)} L ${sx(pts[i].x)} ${sy(pts[i].y)}`,
            color: INCREASE_ALERT_COLOR,
          })
          increaseDots.push({ cx: sx(pts[i].x), cy: sy(pts[i].y), x: pts[i].x, y: pts[i].y })
        }
      }
      return { d, dots, increaseSegments, increaseDots, empty: false }
    })
  }, [rows, series, xR.min, xR.max, yR.min, yR.max])

  const hasAny = seriesData.some((p) => !p.empty)

  return (
    <section className="eval-dash__section">
      <div className="eval-dash__section-head">
        <h2 className="eval-dash__h2">{title}</h2>
        <button
          type="button"
          className="eval-dash__export-btn"
          disabled={!hasAny || saving}
          onClick={async () => {
            const svg = document.getElementById(chartId)
            if (!(svg instanceof SVGSVGElement)) return
            try {
              setSaving(true)
              await saveSvgAsPng(svg, title, series)
            } finally {
              setSaving(false)
            }
          }}
        >
          {saving ? 'Saving...' : 'Save PNG'}
        </button>
      </div>
      {!hasAny ? (
        <p className="eval-dash__status">No loss values to display.</p>
      ) : (
        <div className="smoke-chart">
          <svg
            id={chartId}
            className="smoke-chart__svg"
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="xMidYMid meet"
            aria-hidden
          >
            <rect x={padL} y={padT} width={innerW} height={innerH} fill="none" stroke="var(--border)" strokeWidth="1" />
            <text
              x={padL + innerW / 2}
              y={H - 8}
              fontSize="11"
              fill="var(--text)"
              fontFamily="var(--mono)"
              textAnchor="middle"
            >
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
                  {seriesData[i].increaseSegments.map((segment, segmentIndex) => (
                    <path
                      key={`${s.key}-inc-${segmentIndex}`}
                      d={segment.d}
                      fill="none"
                      stroke={segment.color}
                      strokeWidth="3"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  ))}
                  {seriesData[i].increaseDots.map((dot, j) => (
                    <g key={`${s.key}-alert-${j}`}>
                      <circle cx={dot.cx} cy={dot.cy} r={8} fill={INCREASE_ALERT_COLOR} opacity="0.14" />
                      <circle cx={dot.cx} cy={dot.cy} r={5} fill={INCREASE_ALERT_COLOR} />
                      <path
                        d={`M ${dot.cx} ${dot.cy - 2.6} L ${dot.cx} ${dot.cy + 1.1}`}
                        stroke="#fff"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                      <circle cx={dot.cx} cy={dot.cy + 3.1} r={0.9} fill="#fff" />
                      <title>{`Increase detected\nEpoch ${dot.x}\n${s.label}: ${fmtNum(dot.y)}`}</title>
                    </g>
                  ))}
                  {seriesData[i].dots.map((dot, j) => (
                    <circle
                      key={j}
                      cx={dot.cx}
                      cy={dot.cy}
                      r={4}
                      fill={s.color}
                      stroke="var(--bg, #252525)"
                      strokeWidth="1.5"
                    >
                      <title>{`Epoch ${dot.x}\n${s.label}: ${fmtNum(dot.y)}`}</title>
                    </circle>
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
            <span className="smoke-chart__legend-item">
              <span className="smoke-chart__swatch" style={{ background: INCREASE_ALERT_COLOR }} />
              Increase alert
            </span>
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
          <LossLineChart title="Total Loss by epoch" rows={rows} series={LOSS_SERIES} />
          <LossLineChart title="Loss components by epoch" rows={rows} series={DETAIL_LOSS_SERIES} />
          <EpochTable rows={rows} />
        </>
      )}
    </div>
  )
}

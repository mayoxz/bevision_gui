/**
 * Outcome cases rank × scene label analysis
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { resolveDataUrl } from '../../config/dataUrl.js'
import {
  analyzeOutcomeCases,
  buildSceneComboStripChart,
  formatCasePreviewEntries,
} from './outcomeCasesStats.js'
import {
  bandsToLegendItems,
  getChartTheme,
  resolveStripLabelPad,
  saveOutcomeChartPng,
  sortBands,
  STRIP_LAYOUT,
} from './exportChartPng.js'
import { detectStripClusters } from './stripChartClusters.js'

const DATA_PATH = 'outcome-cases/bottom10_scene_labels.json'
const VIS_ROOT = 'Visualization/val'

function visualizationImageFileName(rank, imgName) {
  if (!imgName || !Number.isFinite(rank)) return null
  const prefix = String(Math.round(rank)).padStart(3, '0')
  return `${prefix}_${imgName}`
}

function resolveVisualizationImageUrl(rank, imgName, kind) {
  const fileName = visualizationImageFileName(rank, imgName)
  if (!fileName) return null
  return resolveDataUrl(`${VIS_ROOT}/${kind}/${fileName}`)
}

function previewImageFileName(rank, imgName, kind) {
  const fileName = visualizationImageFileName(rank, imgName)
  if (!fileName) return null
  return `${kind}_${fileName}`
}

async function downloadImage(url, fileName) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  const blobUrl = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = blobUrl
    anchor.download = fileName
    anchor.click()
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}

function sceneTagsFromReference(reference) {
  if (!reference) return []
  if (Array.isArray(reference.scene_tags) && reference.scene_tags.length) {
    return reference.scene_tags.filter(Boolean)
  }
  if (typeof reference.scene_description === 'string' && reference.scene_description.trim()) {
    return reference.scene_description.split(',').map((tag) => tag.trim()).filter(Boolean)
  }
  return []
}

async function fetchSceneLabels() {
  const res = await fetch(resolveDataUrl(DATA_PATH))
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const payload = await res.json()
  if (!Array.isArray(payload.results)) throw new Error('Missing results array')
  return payload
}

function fmtRank(value) {
  return value == null ? '—' : Math.round(value).toLocaleString()
}

function fmtRho(value) {
  return value == null ? '—' : value.toFixed(3)
}

function fmtCaseCategories(rawLabels) {
  if (!rawLabels) return '—'
  return formatCasePreviewEntries(rawLabels)
    .map((entry) => `${entry.label}: ${entry.value}`)
    .join(' · ')
}

function jitterOffset(id, bandHeight) {
  let hash = 2166136261
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (((hash >>> 0) % 1000) / 1000 - 0.5) * bandHeight * 0.55
}

function rankTicks(min, max) {
  const span = max - min || 1
  return [min, Math.round(min + span * 0.25), Math.round(min + span * 0.5), Math.round(min + span * 0.75), max]
}

function ChartExportButton({ onExport }) {
  const [saving, setSaving] = useState(false)

  return (
    <button
      type="button"
      className="eval-dash__export-btn"
      disabled={saving}
      onClick={async () => {
        setSaving(true)
        try {
          await onExport()
        } catch (err) {
          window.alert(err?.message ?? String(err))
        } finally {
          setSaving(false)
        }
      }}
    >
      {saving ? 'Saving…' : 'PNG 저장'}
    </button>
  )
}

function SummaryCards({ analysis, meta }) {
  return (
    <section className="eval-dash__section">
      <h2 className="eval-dash__h2">요약</h2>
      <div className="eval-dash__metric-row">
        <div className="eval-dash__metric-card">
          <span className="eval-dash__metric-label">Cases</span>
          <span className="eval-dash__metric-value">{analysis.count}</span>
        </div>
        <div className="eval-dash__metric-card">
          <span className="eval-dash__metric-label">Rank range</span>
          <span className="eval-dash__metric-value eval-dash__metric-value--sm">
            {analysis.rankRange
              ? `${analysis.rankRange.min} – ${analysis.rankRange.max}`
              : '—'}
          </span>
        </div>
        <div className="eval-dash__metric-card">
          <span className="eval-dash__metric-label">Strongest signal</span>
          <span className="eval-dash__metric-value eval-dash__metric-value--sm">
            {analysis.strongest
              ? `${analysis.strongest.label} (ρ ${fmtRho(analysis.strongest.rho)})`
              : '—'}
          </span>
        </div>
      </div>
      <p className="spa-view__msg spa-view__msg--sub outcome-dash__note">
        {meta?.model ? `API (${meta.model}), ` : 'API, '}
        일부 수동 확인·수정.
      </p>
    </section>
  )
}

function RankStripSvg({
  bands,
  points,
  rankMin,
  rankMax,
  labelPad,
  plotWidth,
  field,
  compact = false,
  onDotClick,
}) {
  const theme = useMemo(() => getChartTheme(), [])
  const orderedBands = useMemo(() => sortBands(bands, field), [bands, field])
  const layout = compact ? STRIP_LAYOUT.compact : STRIP_LAYOUT.full
  const W = Math.max(layout.w, plotWidth ?? 0)
  const padR = layout.padR
  const padT = layout.padT
  const bandRowH = layout.bandRowH
  const axisH = layout.axisH
  const padB = layout.padB
  const bandCount = Math.max(orderedBands.length, 1)
  const innerW = W - labelPad - padR
  const innerH = bandCount * bandRowH
  const H = padT + innerH + axisH + padB
  const ticks = compact ? [rankMin, Math.round((rankMin + rankMax) / 2), rankMax] : rankTicks(rankMin, rankMax)

  const sx = (rank) => labelPad + ((rank - rankMin) / (rankMax - rankMin || 1)) * innerW
  const bandCenterY = (index) => padT + bandRowH * index + bandRowH / 2
  const tickY = padT + innerH + 14

  const bandByKey = useMemo(
    () => new Map(orderedBands.map((band, index) => [band.key, { ...band, index }])),
    [orderedBands],
  )

  const dots = useMemo(
    () =>
      points
        .map((point) => {
          const band = bandByKey.get(point.bandKey)
          if (!band) return null
          return {
            id: `${point.id}-${point.bandKey}`,
            rank: point.rank,
            imgName: point.imgName ?? null,
            rawLabels: point.rawLabels,
            reference: point.reference ?? null,
            cx: sx(point.rank),
            cy: bandCenterY(band.index) + jitterOffset(point.id, bandRowH),
            color: band.color,
            bandKey: band.key,
          }
        })
        .filter(Boolean),
    [points, bandByKey, rankMin, rankMax, bandRowH, labelPad, innerW],
  )

  const clusterCircles = useMemo(() => {
    const byBand = new Map()
    for (const dot of dots) {
      if (!byBand.has(dot.bandKey)) byBand.set(dot.bandKey, [])
      byBand.get(dot.bandKey).push(dot)
    }
    const circles = []
    for (const [bandKey, bandDots] of byBand) {
      const color = bandDots[0]?.color
      for (const circle of detectStripClusters(bandDots, { rankMin, rankMax })) {
        circles.push({ ...circle, bandKey, color })
      }
    }
    return circles
  }, [dots, rankMin, rankMax])

  return (
    <svg
      className="smoke-chart__svg outcome-strip-chart__svg"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-hidden
    >
      <rect x={labelPad} y={padT} width={innerW} height={innerH} fill={theme.cardBg} stroke={theme.border} strokeWidth="1" />
      {orderedBands.map((band, index) => {
        const y = padT + bandRowH * index
        return (
          <g key={band.key}>
            {index % 2 === 0 ? (
              <rect x={labelPad} y={y} width={innerW} height={bandRowH} fill={theme.bandAlt} />
            ) : null}
            <line
              x1={labelPad}
              x2={labelPad + innerW}
              y1={y + bandRowH}
              y2={y + bandRowH}
              stroke={theme.border}
              strokeWidth="1"
              opacity={index === bandCount - 1 ? 1 : 0.6}
            />
            <text
              x={labelPad - 10}
              y={bandCenterY(index) + 4}
              textAnchor="end"
              fontSize={compact ? '11' : '12'}
              fill={theme.textHeading}
              fontFamily={theme.sans}
              fontWeight="500"
            >
              {band.display}
            </text>
            {band.medianRank != null ? (
              <line
                x1={sx(band.medianRank)}
                x2={sx(band.medianRank)}
                y1={y + 6}
                y2={y + bandRowH - 6}
                stroke={band.color}
                strokeWidth="2"
                strokeDasharray="4 3"
                strokeLinecap="round"
              />
            ) : null}
          </g>
        )
      })}
      {ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={sx(tick)}
            x2={sx(tick)}
            y1={padT}
            y2={padT + innerH}
            stroke={theme.border}
            strokeWidth="1"
            strokeDasharray="3 4"
            opacity="0.55"
          />
          <text x={sx(tick)} y={tickY} textAnchor="middle" fontSize="10" fill={theme.text} fontFamily={theme.mono}>
            {tick}
          </text>
        </g>
      ))}
      {clusterCircles.map((circle) => (
        <circle
          key={`${circle.bandKey}-${circle.cx}-${circle.cy}-${circle.n}`}
          cx={circle.cx}
          cy={circle.cy}
          r={circle.r}
          fill="none"
          stroke={circle.color}
          strokeWidth="1.5"
          strokeDasharray="5 4"
          opacity="0.85"
        />
      ))}
      {dots.map((dot) => (
        <g
          key={dot.id}
          className={`outcome-strip-chart__dot${dot.imgName ? ' outcome-strip-chart__dot--preview' : ''}`}
          onClick={
            dot.imgName
              ? (event) => {
                  event.stopPropagation()
                  onDotClick?.(dot)
                }
              : undefined
          }
        >
          <circle cx={dot.cx} cy={dot.cy} r={compact ? 7 : 8} fill="transparent" />
          <circle cx={dot.cx} cy={dot.cy} r={compact ? 2.3 : 2.8} fill={dot.color} opacity="0.52" />
          <title>{`Rank ${fmtRank(dot.rank)} · ${fmtCaseCategories(dot.rawLabels)}`}</title>
        </g>
      ))}
    </svg>
  )
}

function BandStatsRow({ bands, field, compact = false }) {
  const ordered = useMemo(() => sortBands(bands, field), [bands, field])
  return (
    <div className={`outcome-band-stats${compact ? ' outcome-band-stats--compact' : ''}`}>
      {ordered.map((band) => (
        <div key={band.key} className="outcome-band-stats__item">
          <span className="outcome-band-stats__swatch" style={{ background: band.color }} aria-hidden />
          <span className="outcome-band-stats__label">{band.display}</span>
          <span className="outcome-band-stats__meta">n={band.n}</span>
          <span className="outcome-band-stats__meta">중앙 {fmtRank(band.medianRank)}</span>
          <span className="outcome-band-stats__meta">평균 {fmtRank(band.meanRank)}</span>
        </div>
      ))}
    </div>
  )
}

function PreviewImageFigure({ label, url, rank, imgName, kind }) {
  const [downloading, setDownloading] = useState(false)
  const fileName = previewImageFileName(rank, imgName, kind)

  return (
    <figure>
      <div className="outcome-strip-chart__hold-figure-head">
        <figcaption>{label}</figcaption>
        {url && fileName ? (
          <button
            type="button"
            className="eval-dash__export-btn outcome-strip-chart__hold-download"
            disabled={downloading}
            onClick={async () => {
              setDownloading(true)
              try {
                await downloadImage(url, fileName)
              } catch (err) {
                window.alert(err?.message ?? String(err))
              } finally {
                setDownloading(false)
              }
            }}
          >
            {downloading ? '…' : '다운로드'}
          </button>
        ) : null}
      </div>
      {url ? <img src={url} alt="" /> : <p className="outcome-strip-chart__hold-missing">—</p>}
    </figure>
  )
}

function DotCasePreview({ preview, onClose }) {
  const { dot } = preview
  const gtUrl = resolveVisualizationImageUrl(dot.rank, dot.imgName, 'ground_truth')
  const predUrl = resolveVisualizationImageUrl(dot.rank, dot.imgName, 'prediction')
  const categories = useMemo(
    () => (dot.rawLabels ? formatCasePreviewEntries(dot.rawLabels) : []),
    [dot.rawLabels],
  )
  const sceneTags = useMemo(() => sceneTagsFromReference(dot.reference), [dot.reference])
  if (!gtUrl && !predUrl) return null

  return (
    <div className="outcome-strip-chart__hold-overlay" onClick={onClose}>
      <div
        className="outcome-strip-chart__hold-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`Rank ${fmtRank(dot.rank)} preview`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="outcome-strip-chart__hold-head">
          <div className="outcome-strip-chart__hold-rank">Rank {fmtRank(dot.rank)}</div>
          <div className="outcome-strip-chart__hold-categories">
            {categories.map((entry) => (
              <span key={entry.field} className="outcome-strip-chart__hold-category">
                <span
                  className="outcome-strip-chart__hold-category-swatch"
                  style={{ background: entry.color }}
                  aria-hidden
                />
                {entry.label}: {entry.value}
              </span>
            ))}
          </div>
          {sceneTags.length ? (
            <div className="outcome-strip-chart__hold-tags">
              {sceneTags.map((tag) => (
                <span key={tag} className="outcome-strip-chart__hold-tag">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="outcome-strip-chart__hold-images">
          <PreviewImageFigure
            label="Ground truth"
            url={gtUrl}
            rank={dot.rank}
            imgName={dot.imgName}
            kind="ground_truth"
          />
          <PreviewImageFigure
            label="Prediction"
            url={predUrl}
            rank={dot.rank}
            imgName={dot.imgName}
            kind="prediction"
          />
        </div>
      </div>
    </div>
  )
}

function ChartAxisFooter({ labelPad, chartWidth, compact = false }) {
  const layout = compact ? STRIP_LAYOUT.compact : STRIP_LAYOUT.full
  const w = Math.max(layout.w, chartWidth ?? 0)
  return (
    <div
      className="outcome-strip-chart__axis-footer"
      style={{
        paddingLeft: `${(labelPad / w) * 100}%`,
        paddingRight: `${(layout.padR / w) * 100}%`,
      }}
    >
      <span>worse</span>
      <span className="outcome-strip-chart__axis-mid">Rank</span>
      <span>better</span>
    </div>
  )
}

function StripChartPlot({ bands, points, rankMin, rankMax, padL, field, compact = false }) {
  const plotRef = useRef(null)
  const [plotWidth, setPlotWidth] = useState(null)
  const [preview, setPreview] = useState(null)
  const layout = compact ? STRIP_LAYOUT.compact : STRIP_LAYOUT.full
  const labelPad = useMemo(
    () => resolveStripLabelPad(bands, { compact, padL }),
    [bands, compact, padL],
  )
  const chartWidth = Math.max(layout.w, plotWidth ?? 0)

  useEffect(() => {
    const el = plotRef.current
    if (!el) return undefined
    const update = (width) => {
      if (width > 0) setPlotWidth(Math.round(width))
    }
    update(el.getBoundingClientRect().width)
    const ro = new ResizeObserver(([entry]) => update(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!preview) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setPreview(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [preview])

  return (
    <div ref={plotRef} className="outcome-strip-chart__plot">
      <RankStripSvg
        bands={bands}
        points={points}
        rankMin={rankMin}
        rankMax={rankMax}
        labelPad={labelPad}
        plotWidth={plotWidth}
        field={field}
        compact={compact}
        onDotClick={(dot) => {
          if (dot.imgName) setPreview({ dot })
        }}
      />
      {preview ? <DotCasePreview preview={preview} onClose={() => setPreview(null)} /> : null}
      <ChartAxisFooter labelPad={labelPad} chartWidth={chartWidth} compact={compact} />
    </div>
  )
}

function CategoryRankStripChart({ chart, rankMin, rankMax, controls = null }) {
  const chartRef = useRef(null)

  return (
    <div className="outcome-dash__block">
      <div className="outcome-dash__chart-head outcome-dash__chart-head--export">
        <div>
          <h3 className="outcome-dash__h3">
            {chart.label}
            <span className="outcome-dash__rho">ρ {fmtRho(chart.rho)}</span>
          </h3>
          {controls}
        </div>
        <ChartExportButton
          onExport={async () => {
            const svg = chartRef.current?.querySelector('svg')
            if (!(svg instanceof SVGSVGElement)) throw new Error('Chart not found')
            await saveOutcomeChartPng({
              title: chart.label,
              panels: [
                {
                  svg,
                  legendItems: bandsToLegendItems(chart.bands, chart.field),
                  legendField: chart.field,
                },
              ],
            })
          }}
        />
      </div>
      <div ref={chartRef} className="smoke-chart outcome-strip-chart">
        <BandStatsRow bands={chart.bands} field={chart.field} />
        <StripChartPlot
          bands={chart.bands}
          points={chart.points}
          rankMin={rankMin}
          rankMax={rankMax}
          padL={chart.padL}
          field={chart.field}
        />
      </div>
    </div>
  )
}

function SceneComboRankStripChart({ rows, rankMin, rankMax }) {
  const [splitNight, setSplitNight] = useState(false)
  const chart = useMemo(() => buildSceneComboStripChart(rows, splitNight), [rows, splitNight])

  return (
    <CategoryRankStripChart
      chart={chart}
      rankMin={rankMin}
      rankMax={rankMax}
      controls={
        <label className="outcome-dash__toggle">
          <input
            type="checkbox"
            checked={splitNight}
            onChange={(event) => setSplitNight(event.target.checked)}
          />
          <span>Night clear/raindrop 분리</span>
        </label>
      }
    />
  )
}

function DistributionSection({ stripCharts, rows, rankRange }) {
  if (!stripCharts.length || !rankRange || !rows?.length) return null
  const lightingChart = stripCharts[0]

  return (
    <section className="eval-dash__section">
      <h2 className="eval-dash__h2">등수 분포</h2>
      <CategoryRankStripChart
        chart={lightingChart}
        rankMin={rankRange.min}
        rankMax={rankRange.max}
      />
      <SceneComboRankStripChart rows={rows} rankMin={rankRange.min} rankMax={rankRange.max} />
    </section>
  )
}

export default function OutcomeCasesDashboard() {
  const [payload, setPayload] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchSceneLabels()
      .then((data) => {
        if (!cancelled) setPayload(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const analysis = useMemo(
    () => (payload?.results ? analyzeOutcomeCases(payload.results) : null),
    [payload],
  )

  if (loading) {
    return <p className="eval-dash__status">Loading scene labels…</p>
  }

  if (error) {
    return <p className="eval-dash__error">{error}</p>
  }

  if (!analysis) {
    return <p className="eval-dash__status">No data.</p>
  }

  return (
    <div className="eval-dashboard outcome-dashboard">
      <SummaryCards analysis={analysis} meta={payload?.meta} />
      <DistributionSection
        stripCharts={analysis.stripCharts}
        rows={analysis.rows}
        rankRange={analysis.rankRange}
      />
    </div>
  )
}

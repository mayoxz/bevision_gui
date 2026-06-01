/**
 * Outcome cases rank × scene label analysis
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { resolveDataUrl } from '../../config/dataUrl.js'
import { analyzeOutcomeCases } from './outcomeCasesStats.js'
import { bandsToLegendItems, getChartTheme, saveOutcomeChartPng, sortBands, STRIP_LAYOUT } from './exportChartPng.js'
import { detectStripClusters } from './stripChartClusters.js'

const DATA_PATH = 'outcome-cases/bottom10_scene_labels.json'

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
          <span className="eval-dash__metric-value outcome-dash__metric-value--sm">
            {analysis.rankRange
              ? `${analysis.rankRange.min} – ${analysis.rankRange.max}`
              : '—'}
          </span>
        </div>
        <div className="eval-dash__metric-card">
          <span className="eval-dash__metric-label">Strongest signal</span>
          <span className="eval-dash__metric-value outcome-dash__metric-value--sm">
            {analysis.strongest
              ? `${analysis.strongest.label} (ρ ${fmtRho(analysis.strongest.rho)})`
              : '—'}
          </span>
        </div>
      </div>
      <p className="spa-view__msg spa-view__msg--sub outcome-dash__note">
        Rank 1 = worst among bottom cases; higher rank = relatively less bad. Labels exclude{' '}
        <code>notes</code>.
        {meta?.model ? ` Model: ${meta.model}.` : null}
      </p>
    </section>
  )
}

function RankStripSvg({ bands, points, rankMin, rankMax, padL, field, compact = false }) {
  const theme = useMemo(() => getChartTheme(), [])
  const orderedBands = useMemo(() => sortBands(bands, field), [bands, field])
  const layout = compact ? STRIP_LAYOUT.compact : STRIP_LAYOUT.full
  const W = layout.w
  const padR = layout.padR
  const padT = layout.padT
  const bandRowH = layout.bandRowH
  const axisH = layout.axisH
  const padB = layout.padB
  const labelPad = padL ?? layout.padL
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
        <circle key={dot.id} cx={dot.cx} cy={dot.cy} r={compact ? 2.3 : 2.8} fill={dot.color} opacity="0.52" />
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

function ChartAxisFooter({ padL, compact = false }) {
  const layout = compact ? STRIP_LAYOUT.compact : STRIP_LAYOUT.full
  const leftPad = padL ?? layout.padL
  return (
    <div
      className="outcome-strip-chart__axis-footer"
      style={{ paddingLeft: `${leftPad}px`, paddingRight: `${layout.padR}px` }}
    >
      <span>worse</span>
      <span className="outcome-strip-chart__axis-mid">Rank</span>
      <span>better</span>
    </div>
  )
}

function StripChartPlot({ bands, points, rankMin, rankMax, padL, field, compact = false }) {
  return (
    <div className="outcome-strip-chart__plot">
      <RankStripSvg
        bands={bands}
        points={points}
        rankMin={rankMin}
        rankMax={rankMax}
        padL={padL}
        field={field}
        compact={compact}
      />
      <ChartAxisFooter padL={padL} compact={compact} />
    </div>
  )
}

function CategoryRankStripChart({ chart, rankMin, rankMax }) {
  const chartRef = useRef(null)

  return (
    <div className="outcome-dash__block">
      <div className="outcome-dash__chart-head outcome-dash__chart-head--export">
        <div>
          <h3 className="outcome-dash__h3">
            {chart.label}
            <span className="outcome-dash__rho">ρ {fmtRho(chart.rho)}</span>
          </h3>
          <p className="outcome-dash__chart-caption">
            Each dot = one case. Dashed vertical line = median rank. Dashed circle = isolated pocket in an otherwise sparse rank range.
          </p>
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

function TwoWayFacetStripChart({ chart, rankMin, rankMax }) {
  const blockRef = useRef(null)

  return (
    <div className="outcome-dash__block">
      <div className="outcome-dash__chart-head outcome-dash__chart-head--export">
        <div>
          <h3 className="outcome-dash__h3">{chart.title}</h3>
          <p className="outcome-dash__chart-caption">
            Panels split by second label. Each panel shows rank distribution across the first label.
          </p>
        </div>
        <ChartExportButton
          onExport={async () => {
            const svgs = [...(blockRef.current?.querySelectorAll('.outcome-twoway-panel svg') ?? [])]
            const panels = chart.panels
              .map((panel, index) => {
                const svg = svgs[index]
                if (!(svg instanceof SVGSVGElement)) return null
                return {
                  svg,
                  subtitle: `${panel.display} (n=${panel.n})`,
                  legendItems: bandsToLegendItems(panel.bands, chart.fieldA),
                  legendField: chart.fieldA,
                }
              })
              .filter(Boolean)
            if (!panels.length) throw new Error('Chart not found')
            await saveOutcomeChartPng({
              title: chart.title,
              panels,
            })
          }}
        />
      </div>
      <div ref={blockRef} className="outcome-twoway-grid">
        {chart.panels.map((panel) => (
          <div
            key={String(panel.value)}
            className="smoke-chart outcome-strip-chart outcome-twoway-panel"
            style={{ '--panel-accent': panel.accent }}
          >
            <div className="outcome-twoway-panel__head">
              <span className="outcome-twoway-panel__swatch" style={{ background: panel.accent }} />
              <span className="outcome-twoway-panel__title">{panel.display}</span>
              <span className="outcome-twoway-panel__count">n={panel.n}</span>
            </div>
            <BandStatsRow bands={panel.bands} field={chart.fieldA} compact />
            <StripChartPlot
              bands={panel.bands}
              points={panel.points}
              rankMin={rankMin}
              rankMax={rankMax}
              padL={chart.padL}
              field={chart.fieldA}
              compact
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function DistributionSection({ stripCharts, rankRange }) {
  if (!stripCharts.length || !rankRange) return null
  return (
    <section className="eval-dash__section">
      <h2 className="eval-dash__h2">등수 분포</h2>
      <p className="spa-view__msg spa-view__msg--sub outcome-dash__note">
        Each point is one case. Compare how label values spread across ranks.
      </p>
      {stripCharts.map((chart) => (
        <CategoryRankStripChart
          key={chart.field}
          chart={chart}
          rankMin={rankRange.min}
          rankMax={rankRange.max}
        />
      ))}
    </section>
  )
}

function TwoWaySection({ twoWayStripCharts, rankRange }) {
  if (!twoWayStripCharts.length || !rankRange) return null
  return (
    <section className="eval-dash__section">
      <h2 className="eval-dash__h2">2-way 조합</h2>
      <p className="spa-view__msg spa-view__msg--sub outcome-dash__note">
        Split by the second label; compare rank spread within each panel.
      </p>
      {twoWayStripCharts.map((chart) => (
        <TwoWayFacetStripChart
          key={`${chart.fieldA}-${chart.fieldB}`}
          chart={chart}
          rankMin={rankRange.min}
          rankMax={rankRange.max}
        />
      ))}
    </section>
  )
}

function FullComboSection({ fullCombos }) {
  return (
    <section className="eval-dash__section">
      <h2 className="eval-dash__h2">4-label 조합 (n ≥ 10)</h2>
      <div className="eval-dash__table-wrap">
        <table className="eval-dash__table">
          <thead>
            <tr>
              <th>Combination</th>
              <th className="eval-dash__td-num">n</th>
              <th className="eval-dash__td-num">평균 등수</th>
              <th className="eval-dash__td-num">중앙 등수</th>
            </tr>
          </thead>
          <tbody>
            {fullCombos.map((combo) => (
              <tr key={combo.key}>
                <td>{combo.labelText}</td>
                <td className="eval-dash__td-num">{combo.n}</td>
                <td className="eval-dash__td-num">{fmtRank(combo.meanRank)}</td>
                <td className="eval-dash__td-num">{fmtRank(combo.medianRank)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
      <DistributionSection stripCharts={analysis.stripCharts} rankRange={analysis.rankRange} />
      <TwoWaySection twoWayStripCharts={analysis.twoWayStripCharts} rankRange={analysis.rankRange} />
      <FullComboSection fullCombos={analysis.fullCombos} />
    </div>
  )
}

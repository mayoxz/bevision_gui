/**
 * Outcome cases rank × scene label statistics
 */

import { STRIP_LAYOUT } from './exportChartPng.js'

export const SCENE_LABEL_KEYS = ['time', 'rain']

export const STRIP_CHART_FIELDS = ['time']

const SCENE_COMBO = {
  field: 'scene_combo',
  label: 'Scene',
  valueLabels: {
    day_clear: 'day-clear',
    day_raindrop: 'day-raindrop',
    night_wet: 'night-wet',
  },
  order: ['day_clear', 'day_raindrop', 'night_wet'],
  ordinal: { day_clear: 0, day_raindrop: 1, night_wet: 2 },
  colors: {
    day_clear: '#22c55e',
    day_raindrop: '#ef4444',
    night_wet: '#6366f1',
  },
}

export const LABEL_META = {
  time: {
    label: 'Lighting',
    type: 'categorical',
    valueLabels: { day: 'Day', night: 'Night' },
    order: ['day', 'night'],
    ordinal: { day: 0, night: 1 },
  },
  rain: {
    label: 'Rain',
    type: 'categorical',
    valueLabels: { clear: 'Clear', raindrop: 'Raindrop', wet: 'Wet' },
    order: ['clear', 'raindrop', 'wet'],
    ordinal: { clear: 0, raindrop: 1, wet: 2 },
  },
}

export const VALUE_COLORS = {
  time: { day: '#22c55e', night: '#6366f1' },
  rain: { clear: '#94a3b8', raindrop: '#ef4444', wet: '#818cf8' },
}

function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function mean(values) {
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function rankArray(values) {
  const indexed = values.map((value, index) => ({ value, index }))
  indexed.sort((a, b) => a.value - b.value)
  const ranks = new Array(values.length)
  let i = 0
  while (i < indexed.length) {
    let j = i
    while (j < indexed.length && indexed[j].value === indexed[i].value) j += 1
    const avg = (i + j - 1) / 2 + 1
    for (let k = i; k < j; k += 1) ranks[indexed[k].index] = avg
    i = j
  }
  return ranks
}

export function spearmanRho(x, y) {
  if (x.length !== y.length || x.length < 2) return null
  const rx = rankArray(x)
  const ry = rankArray(y)
  const mx = mean(rx)
  const my = mean(ry)
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < x.length; i += 1) {
    num += (rx[i] - mx) * (ry[i] - my)
    dx += (rx[i] - mx) ** 2
    dy += (ry[i] - my) ** 2
  }
  const denom = Math.sqrt(dx * dy)
  return denom ? num / denom : null
}

function encodeLabel(field, value) {
  const meta = LABEL_META[field]
  return meta.ordinal?.[value] ?? 0
}

function formatLabelValue(field, value) {
  return LABEL_META[field].valueLabels[value] ?? String(value)
}

export function deriveSceneCombo(labels) {
  if (labels.time === 'night') return 'night_wet'
  if (labels.rain === 'raindrop') return 'day_raindrop'
  return 'day_clear'
}

export function formatCaseLabelEntries(labels) {
  return SCENE_LABEL_KEYS.map((field) => ({
    field,
    label: LABEL_META[field].label,
    value: formatLabelValue(field, labels[field]),
    color: VALUE_COLORS[field][labels[field]],
  }))
}

export function formatCasePreviewEntries(rawLabels) {
  return SCENE_LABEL_KEYS.map((field) => ({
    field,
    label: LABEL_META[field].label,
    value: formatLabelValue(field, rawLabels[field]),
    color: VALUE_COLORS[field][rawLabels[field]],
  }))
}

function groupRanksByValue(rows, field) {
  const groups = {}
  for (const row of rows) {
    const value = row.labels[field]
    if (!groups[value]) groups[value] = []
    groups[value].push(row.rank)
  }
  return groups
}

function buildSingleCategoryStats(rows) {
  const ranks = rows.map((row) => row.rank)
  return STRIP_CHART_FIELDS.map((field) => {
    const groups = groupRanksByValue(rows, field)
    const encoded = rows.map((row) => encodeLabel(field, row.labels[field]))
    const rho = spearmanRho(ranks, encoded)
    const meta = LABEL_META[field]
    const values = meta.order
      .filter((value) => groups[value]?.length)
      .map((value) => {
        const fieldRanks = groups[value]
        return {
          value,
          display: formatLabelValue(field, value),
          n: fieldRanks.length,
          meanRank: mean(fieldRanks),
          medianRank: median(fieldRanks),
        }
      })
    return { field, label: meta.label, rho, values }
  })
}

function buildSceneComboStripChart(rows) {
  const comboRows = rows.map((row, index) => ({
    ...row,
    combo: deriveSceneCombo(row.rawLabels),
    id: row.id ?? `row-${index}`,
  }))
  const groups = {}
  for (const row of comboRows) {
    if (!groups[row.combo]) groups[row.combo] = []
    groups[row.combo].push(row.rank)
  }
  const ranks = comboRows.map((row) => row.rank)
  const encoded = comboRows.map((row) => SCENE_COMBO.ordinal[row.combo] ?? 0)
  const rho = spearmanRho(ranks, encoded)

  return {
    field: SCENE_COMBO.field,
    label: SCENE_COMBO.label,
    rho,
    padL: STRIP_LAYOUT.full.padL,
    bands: SCENE_COMBO.order.map((value) => {
      const fieldRanks = groups[value] ?? []
      return {
        key: String(value),
        display: SCENE_COMBO.valueLabels[value],
        color: SCENE_COMBO.colors[value],
        n: fieldRanks.length,
        meanRank: mean(fieldRanks),
        medianRank: median(fieldRanks),
      }
    }),
    points: comboRows.map((row) => ({
      id: row.id,
      rank: row.rank,
      imgName: row.imgName ?? null,
      reference: row.reference ?? null,
      labels: row.labels,
      rawLabels: row.rawLabels,
      bandKey: String(row.combo),
    })),
  }
}

function buildStripCharts(rows, singleCategory) {
  return STRIP_CHART_FIELDS.map((field) => {
    const meta = LABEL_META[field]
    const stats = singleCategory.find((item) => item.field === field)
    const statsByValue = new Map(stats?.values.map((item) => [String(item.value), item]) ?? [])
    return {
      field,
      label: meta.label,
      rho: stats?.rho ?? null,
      padL: STRIP_LAYOUT.full.padL,
      bands: meta.order.map((value) => {
        const stat = statsByValue.get(String(value))
        return {
          key: String(value),
          display: formatLabelValue(field, value),
          color: VALUE_COLORS[field][value],
          n: stat?.n ?? 0,
          meanRank: stat?.meanRank ?? null,
          medianRank: stat?.medianRank ?? null,
        }
      }),
      points: rows.map((row, index) => ({
        id: row.id ?? `row-${index}`,
        rank: row.rank,
        imgName: row.imgName ?? null,
        reference: row.reference ?? null,
        labels: row.labels,
        rawLabels: row.rawLabels,
        bandKey: String(row.labels[field]),
      })),
    }
  })
}

export function analyzeOutcomeCases(results) {
  const rows = results
    .filter((row) => row?.labels?.time && Number.isFinite(row.rank))
    .map((row, index) => {
      const time = row.labels.time
      const rain = row.labels.rain ?? 'clear'
      const rawLabels = { time, rain }
      const sceneCombo = deriveSceneCombo(rawLabels)
      return {
        id: row.sample_token ?? `rank-${row.rank}-${index}`,
        rank: row.rank,
        imgName: row.img_name ?? null,
        reference: row.reference ?? null,
        labels: { time, rain, scene_combo: sceneCombo },
        rawLabels,
      }
    })

  const singleCategory = buildSingleCategoryStats(rows)
  const sceneComboChart = buildSceneComboStripChart(rows)
  const sceneComboCategory = {
    field: sceneComboChart.field,
    label: sceneComboChart.label,
    rho: sceneComboChart.rho,
    values: sceneComboChart.bands
      .filter((band) => band.n > 0)
      .map((band) => ({
        value: band.key,
        display: band.display,
        n: band.n,
        meanRank: band.meanRank,
        medianRank: band.medianRank,
      })),
  }
  const stripCharts = [...buildStripCharts(rows, singleCategory), sceneComboChart]
  const rankRange = rows.length
    ? { min: Math.min(...rows.map((row) => row.rank)), max: Math.max(...rows.map((row) => row.rank)) }
    : null
  const strongest = [...singleCategory, sceneComboCategory].sort(
    (a, b) => Math.abs(b.rho ?? 0) - Math.abs(a.rho ?? 0),
  )[0]

  return {
    count: rows.length,
    rankRange,
    rows,
    singleCategory,
    stripCharts,
    strongest,
  }
}

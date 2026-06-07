/**
 * Outcome cases rank × scene label statistics
 */

import { STRIP_LAYOUT } from './exportChartPng.js'

export const SCENE_LABEL_KEYS = ['lighting', 'lens']

/** Strip chart built in analyzeOutcomeCases; scene_combo is toggled in the dashboard. */
export const STRIP_CHART_FIELDS = ['lighting']

const SCENE_COMBO_MODES = {
  combined: {
    field: 'scene_combo',
    label: 'Day lens / Night',
    valueLabels: {
      day_clear: 'Day · Clear',
      day_raindrop: 'Day · Raindrop',
      night: 'Night',
    },
    order: ['day_clear', 'day_raindrop', 'night'],
    ordinal: { day_clear: 0, day_raindrop: 1, night: 2 },
    colors: {
      day_clear: '#22c55e',
      day_raindrop: '#ef4444',
      night: '#6366f1',
    },
  },
  split: {
    field: 'scene_combo_split',
    label: 'Day lens / Night lens',
    valueLabels: {
      day_clear: 'Day · Clear',
      day_raindrop: 'Day · Raindrop',
      night_clear: 'Night · Clear',
      night_raindrop: 'Night · Raindrop',
    },
    order: ['day_clear', 'day_raindrop', 'night_clear', 'night_raindrop'],
    ordinal: { day_clear: 0, day_raindrop: 1, night_clear: 2, night_raindrop: 3 },
    colors: {
      day_clear: '#22c55e',
      day_raindrop: '#ef4444',
      night_clear: '#818cf8',
      night_raindrop: '#c084fc',
    },
  },
}

export const LABEL_META = {
  lighting: {
    label: 'Lighting',
    type: 'categorical',
    valueLabels: { day: 'Day', night: 'Night' },
    order: ['day', 'night'],
    ordinal: { day: 0, night: 1 },
  },
  lens: {
    label: 'Lens',
    type: 'categorical',
    valueLabels: { clear: 'Clear', raindrop: 'Raindrop' },
    order: ['clear', 'raindrop'],
    ordinal: { clear: 0, raindrop: 1 },
  },
  scene_combo: {
    label: SCENE_COMBO_MODES.combined.label,
    type: 'categorical',
    valueLabels: SCENE_COMBO_MODES.combined.valueLabels,
    order: SCENE_COMBO_MODES.combined.order,
    ordinal: SCENE_COMBO_MODES.combined.ordinal,
  },
}

export const VALUE_COLORS = {
  lighting: { day: '#22c55e', night: '#6366f1' },
  lens: { clear: '#94a3b8', raindrop: '#ef4444' },
  scene_combo: SCENE_COMBO_MODES.combined.colors,
  scene_combo_split: SCENE_COMBO_MODES.split.colors,
}

export function getSceneComboMode(splitNight) {
  return SCENE_COMBO_MODES[splitNight ? 'split' : 'combined']
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

export function deriveSceneCombo(labels, splitNight = false) {
  if (labels.lighting === 'night') {
    if (!splitNight) return 'night'
    return labels.lens === 'raindrop' ? 'night_raindrop' : 'night_clear'
  }
  if (labels.lens === 'raindrop') return 'day_raindrop'
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

export function buildSceneComboStripChart(rows, splitNight = false) {
  const mode = getSceneComboMode(splitNight)
  const comboRows = rows.map((row, index) => ({
    ...row,
    combo: deriveSceneCombo(row.rawLabels, splitNight),
    id: row.id ?? `row-${index}`,
  }))
  const groups = {}
  for (const row of comboRows) {
    if (!groups[row.combo]) groups[row.combo] = []
    groups[row.combo].push(row.rank)
  }
  const ranks = comboRows.map((row) => row.rank)
  const encoded = comboRows.map((row) => mode.ordinal[row.combo] ?? 0)
  const rho = spearmanRho(ranks, encoded)

  return {
    field: mode.field,
    label: mode.label,
    rho,
    padL: STRIP_LAYOUT.full.padL,
    bands: mode.order.map((value) => {
      const fieldRanks = groups[value] ?? []
      return {
        key: String(value),
        display: mode.valueLabels[value],
        color: mode.colors[value],
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
    .filter((row) => row?.labels?.lighting && Number.isFinite(row.rank))
    .map((row, index) => {
      const lighting = row.labels.lighting
      const lens = row.labels.lens ?? 'clear'
      const rawLabels = { lighting, lens }
      const sceneCombo = deriveSceneCombo(rawLabels)
      return {
        id: row.sample_token ?? `rank-${row.rank}-${index}`,
        rank: row.rank,
        imgName: row.img_name ?? null,
        reference: row.reference ?? null,
        labels: {
          lighting,
          lens,
          scene_combo: sceneCombo,
        },
        rawLabels,
      }
    })

  const singleCategory = buildSingleCategoryStats(rows)
  const stripCharts = buildStripCharts(rows, singleCategory)
  const sceneComboCategory = (() => {
    const chart = buildSceneComboStripChart(rows, false)
    return {
      field: chart.field,
      label: chart.label,
      rho: chart.rho,
      values: chart.bands
        .filter((band) => band.n > 0)
        .map((band) => ({
          value: band.key,
          display: band.display,
          n: band.n,
          meanRank: band.meanRank,
          medianRank: band.medianRank,
        })),
    }
  })()
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

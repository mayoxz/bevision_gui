/**
 * Outcome cases rank × scene label statistics
 */

import { STRIP_LAYOUT } from './exportChartPng.js'

export const SCENE_LABEL_KEYS = ['lighting', 'hazy', 'raindrop_stain', 'environment']

export const LABEL_META = {
  lighting: {
    label: 'Lighting',
    type: 'categorical',
    valueLabels: { night: 'Night', daylight: 'Day / Dusk' },
    order: ['night', 'daylight'],
    ordinal: { night: 0, daylight: 1 },
  },
  hazy: {
    label: 'Hazy',
    type: 'boolean',
    valueLabels: { false: 'Clear', true: 'Hazy' },
    order: [false, true],
  },
  raindrop_stain: {
    label: 'Raindrop stain',
    type: 'boolean',
    valueLabels: { false: 'Dry', true: 'Rain stain' },
    order: [false, true],
  },
  environment: {
    label: 'Environment',
    type: 'categorical',
    valueLabels: { urban: 'Urban', rural_green: 'Rural green' },
    order: ['urban', 'rural_green'],
  },
}

export const TWO_WAY_PAIRS = [
  ['lighting', 'raindrop_stain'],
  ['lighting', 'environment'],
  ['lighting', 'hazy'],
]

export const VALUE_COLORS = {
  lighting: { night: '#6366f1', daylight: '#22c55e' },
  hazy: { false: '#94a3b8', true: '#c026d3' },
  raindrop_stain: { false: '#38bdf8', true: '#ef4444' },
  environment: { urban: '#64748b', rural_green: '#16a34a' },
}

const RAW_LIGHTING_VALUE_LABELS = { night: 'Night', day: 'Day', dusk: 'Dusk' }
const RAW_LIGHTING_COLORS = { night: '#6366f1', dusk: '#f59e0b', day: '#22c55e' }

const FULL_COMBO_MIN_N = 10

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
  if (meta.type === 'boolean') return value ? 1 : 0
  return meta.ordinal?.[value] ?? 0
}

function normalizeLabelValue(field, value) {
  if (field === 'lighting' && (value === 'day' || value === 'dusk')) return 'daylight'
  return value
}

function formatLabelValue(field, value) {
  return LABEL_META[field].valueLabels[normalizeLabelValue(field, value)] ?? String(value)
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
  return SCENE_LABEL_KEYS.map((field) => {
    const value = rawLabels[field]
    if (field === 'lighting') {
      return {
        field,
        label: LABEL_META[field].label,
        value: RAW_LIGHTING_VALUE_LABELS[value] ?? String(value),
        color: RAW_LIGHTING_COLORS[value] ?? VALUE_COLORS.lighting[normalizeLabelValue('lighting', value)],
      }
    }
    return {
      field,
      label: LABEL_META[field].label,
      value: formatLabelValue(field, value),
      color: VALUE_COLORS[field][value],
    }
  })
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
  return SCENE_LABEL_KEYS.map((field) => {
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

function comboKey(valueA, valueB) {
  return `${String(valueA)}|${String(valueB)}`
}

function buildStripCharts(rows, singleCategory) {
  return SCENE_LABEL_KEYS.map((field) => {
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
        labels: row.labels,
        rawLabels: row.rawLabels,
        bandKey: String(row.labels[field]),
      })),
    }
  })
}

function buildTwoWayStripCharts(rows) {
  return TWO_WAY_PAIRS.map(([fieldA, fieldB]) => {
    const metaA = LABEL_META[fieldA]
    const metaB = LABEL_META[fieldB]
    const panels = metaB.order.map((valueB) => {
      const panelRows = rows.filter((row) => row.labels[fieldB] === valueB)
      const bands = metaA.order
        .map((valueA) => {
          const matched = panelRows.filter((row) => row.labels[fieldA] === valueA)
          const ranks = matched.map((row) => row.rank)
          return {
            key: comboKey(valueA, valueB),
            display: formatLabelValue(fieldA, valueA),
            color: VALUE_COLORS[fieldA][valueA],
            n: matched.length,
            meanRank: mean(ranks),
            medianRank: median(ranks),
          }
        })
        .filter((band) => band.n > 0)

      return {
        value: valueB,
        display: formatLabelValue(fieldB, valueB),
        accent: VALUE_COLORS[fieldB][valueB],
        n: panelRows.length,
        bands,
        points: panelRows.map((row) => ({
          id: row.id,
          rank: row.rank,
          imgName: row.imgName ?? null,
          labels: row.labels,
          rawLabels: row.rawLabels,
          bandKey: comboKey(row.labels[fieldA], valueB),
        })),
      }
    }).filter((panel) => panel.n > 0)

    return {
      fieldA,
      fieldB,
      title: `${metaA.label} × ${metaB.label}`,
      padL: STRIP_LAYOUT.compact.padL,
      panels,
    }
  })
}

function buildFullCombos(rows, minN = FULL_COMBO_MIN_N) {
  const combos = new Map()
  for (const row of rows) {
    const key = SCENE_LABEL_KEYS.map((field) => String(row.labels[field])).join('|')
    if (!combos.has(key)) combos.set(key, [])
    combos.get(key).push(row.rank)
  }
  return [...combos.entries()]
    .map(([key, ranks]) => {
      const parts = key.split('|')
      const labels = Object.fromEntries(
        SCENE_LABEL_KEYS.map((field, index) => [field, parseComboPart(field, parts[index])]),
      )
      return {
        key,
        labels,
        labelText: SCENE_LABEL_KEYS.map((field) => formatLabelValue(field, labels[field])).join(' · '),
        n: ranks.length,
        meanRank: mean(ranks),
        medianRank: median(ranks),
      }
    })
    .filter((combo) => combo.n >= minN)
    .sort((a, b) => a.meanRank - b.meanRank)
}

function parseComboPart(field, raw) {
  if (LABEL_META[field].type === 'boolean') return raw === 'true'
  return raw
}

export function analyzeOutcomeCases(results) {
  const rows = results
    .filter((row) => row?.labels && Number.isFinite(row.rank))
    .map((row, index) => ({
      id: row.sample_token ?? `rank-${row.rank}-${index}`,
      rank: row.rank,
      imgName: row.img_name ?? null,
      labels: {
        lighting: normalizeLabelValue('lighting', row.labels.lighting),
        hazy: Boolean(row.labels.hazy),
        raindrop_stain: Boolean(row.labels.raindrop_stain),
        environment: row.labels.environment,
      },
      rawLabels: {
        lighting: row.labels.lighting,
        hazy: Boolean(row.labels.hazy),
        raindrop_stain: Boolean(row.labels.raindrop_stain),
        environment: row.labels.environment,
      },
    }))

  const singleCategory = buildSingleCategoryStats(rows)
  const stripCharts = buildStripCharts(rows, singleCategory)
  const twoWayStripCharts = buildTwoWayStripCharts(rows)
  const fullCombos = buildFullCombos(rows)
  const rankRange = rows.length
    ? { min: Math.min(...rows.map((row) => row.rank)), max: Math.max(...rows.map((row) => row.rank)) }
    : null
  const strongest = [...singleCategory].sort(
    (a, b) => Math.abs(b.rho ?? 0) - Math.abs(a.rho ?? 0),
  )[0]

  return {
    count: rows.length,
    rankRange,
    singleCategory,
    stripCharts,
    twoWayStripCharts,
    fullCombos,
    strongest,
  }
}

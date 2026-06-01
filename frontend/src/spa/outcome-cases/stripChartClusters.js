function mean(values) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function toClusterCircle(points, pad = 10) {
  const cx = mean(points.map((point) => point.cx))
  const cy = mean(points.map((point) => point.cy))
  let r = 0
  for (const point of points) {
    const dx = point.cx - cx
    const dy = point.cy - cy
    r = Math.max(r, Math.sqrt(dx * dx + dy * dy))
  }
  return {
    cx,
    cy,
    r: Math.max(r + pad, 16),
    n: points.length,
  }
}

/**
 * Isolated rank pockets: local peak bins surrounded by much sparser neighbors.
 * Skips bands where points are spread evenly (no empty gaps with sudden clumps).
 * @param {{ cx: number, cy: number, rank: number }[]} points
 */
export function detectStripClusters(points, { rankMin, rankMax, maxClusters = 2 }) {
  if (points.length < 5) return []

  const span = rankMax - rankMin || 1
  const binCount = Math.max(22, Math.min(32, Math.round(span / 18)))
  const binWidth = span / binCount
  const bins = Array.from({ length: binCount }, () => [])

  for (const point of points) {
    const index = Math.min(binCount - 1, Math.floor((point.rank - rankMin) / binWidth))
    bins[index].push(point)
  }

  const counts = bins.map((bin) => bin.length)
  const peakBins = new Set()

  for (let i = 0; i < binCount; i += 1) {
    const center = counts[i]
    const left = i > 0 ? counts[i - 1] : 0
    const right = i < binCount - 1 ? counts[i + 1] : 0
    const neighbor = left + right

    if (center < 5) continue
    if (center <= left || center <= right) continue
    if (center < neighbor * 2.5 + 3) continue
    if (neighbor > center * 0.4) continue

    peakBins.add(i)
  }

  if (!peakBins.size) return []

  const groups = []
  for (let i = 0; i < binCount; ) {
    if (!peakBins.has(i)) {
      i += 1
      continue
    }
    let j = i
    while (j + 1 < binCount && peakBins.has(j + 1)) j += 1
    const group = []
    for (let k = i; k <= j; k += 1) group.push(...bins[k])
    groups.push({
      group,
      score: group.length,
      start: Math.min(...group.map((point) => point.rank)),
      end: Math.max(...group.map((point) => point.rank)),
    })
    i = j + 1
  }

  groups.sort((a, b) => b.score - a.score)
  return groups.slice(0, maxClusters).map((entry) => toClusterCircle(entry.group))
}

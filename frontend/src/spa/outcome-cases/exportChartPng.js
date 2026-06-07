const SVG_ATTRS = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'text-anchor',
]

const LEGEND_DISPLAY_ORDER = {
  lighting: ['Day', 'Night'],
  lens: ['Clear', 'Raindrop'],
  scene_combo: ['Day · Clear', 'Day · Raindrop', 'Night'],
  scene_combo_split: ['Day · Clear', 'Day · Raindrop', 'Night · Clear', 'Night · Raindrop'],
}

function sortLegendItems(items, field) {
  const order = field ? LEGEND_DISPLAY_ORDER[field] : null
  if (!order) return items
  return [...items].sort((a, b) => {
    const ai = order.findIndex((name) => a.label.startsWith(name))
    const bi = order.findIndex((name) => b.label.startsWith(name))
    return (ai < 0 ? order.length : ai) - (bi < 0 ? order.length : bi)
  })
}

function sortBands(bands, field) {
  const order = field ? LEGEND_DISPLAY_ORDER[field] : null
  if (!order) return bands
  return [...bands].sort((a, b) => {
    const ai = order.indexOf(a.display)
    const bi = order.indexOf(b.display)
    return (ai < 0 ? order.length : ai) - (bi < 0 ? order.length : bi)
  })
}

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

function firstFontFamily(fontStack) {
  const first = (fontStack || '').split(',')[0]?.trim() ?? 'sans-serif'
  return first.replace(/^['"]|['"]$/g, '') || 'sans-serif'
}

export function getChartTheme() {
  const rootStyles = window.getComputedStyle(document.documentElement)
  const pick = (name, fallback) => rootStyles.getPropertyValue(name).trim() || fallback
  const isDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  return {
    border: pick('--border', '#e5e4e7'),
    text: pick('--text', '#6b6375'),
    textHeading: pick('--text-h', '#08060d'),
    cardBg: pick('--code-bg', '#f4f3ec'),
    bandAlt: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
    sans: firstFontFamily(pick('--sans', 'system-ui, sans-serif')),
    mono: firstFontFamily(pick('--mono', 'ui-monospace, monospace')),
  }
}

export const STRIP_LAYOUT = {
  full: { w: 760, padL: 96, padR: 16, padT: 10, bandRowH: 50, axisH: 22, padB: 6 },
  compact: { w: 360, padL: 68, padR: 10, padT: 8, bandRowH: 42, axisH: 20, padB: 4 },
}

export function stripChartHeight(bandCount, compact = false) {
  const layout = compact ? STRIP_LAYOUT.compact : STRIP_LAYOUT.full
  return layout.padT + bandCount * layout.bandRowH + layout.axisH + layout.padB
}

function resolveVarInAttr(value, theme) {
  if (!value || !value.includes('var(')) return value
  if (value.includes('--border')) return theme.border
  if (value.includes('--text-h')) return theme.textHeading
  if (value.includes('--text')) return theme.text
  if (value.includes('--code-bg')) return theme.cardBg
  if (value.includes('--sans')) return theme.sans
  if (value.includes('--mono')) return theme.mono
  return value
}

function prepareSvgNode(sourceNode, targetNode, theme) {
  const computed = window.getComputedStyle(sourceNode)

  for (const attr of SVG_ATTRS) {
    const fromAttr = targetNode.getAttribute(attr)
    let value = computed.getPropertyValue(attr).trim()

    if (fromAttr && !fromAttr.includes('var(') && !value) {
      value = fromAttr
    }

    if ((!value || value === 'none') && fromAttr) {
      value = resolveVarInAttr(fromAttr, theme)
    }

    if (attr === 'font-family' && value) {
      value = firstFontFamily(value)
    }

    if (value && value !== 'none') {
      targetNode.setAttribute(attr, value)
    }
  }
}

function flattenSvgToGroup(sourceSvg, theme) {
  const cloned = sourceSvg.cloneNode(true)
  prepareSvgNode(sourceSvg, cloned, theme)

  const sourceNodes = [sourceSvg, ...sourceSvg.querySelectorAll('*')]
  const targetNodes = [cloned, ...cloned.querySelectorAll('*')]
  for (let i = 1; i < sourceNodes.length; i += 1) {
    prepareSvgNode(sourceNodes[i], targetNodes[i], theme)
  }

  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  while (cloned.firstChild) {
    group.appendChild(cloned.firstChild)
  }
  return group
}

function svgSize(svgElement) {
  const viewBox = svgElement.viewBox.baseVal
  return {
    width: Math.ceil(viewBox?.width || svgElement.clientWidth || 720),
    height: Math.ceil(viewBox?.height || svgElement.clientHeight || 220),
  }
}

function appendLegend(exportSvg, legendItems, startY, theme, originX, blockWidth) {
  if (!legendItems.length) return startY + 8

  const cols = blockWidth >= 420 ? 2 : 1
  const colWidth = blockWidth / cols
  let maxY = startY

  legendItems.forEach((item, index) => {
    const col = index % cols
    const row = Math.floor(index / cols)
    const x = originX + col * colWidth
    const y = startY + row * 22
    maxY = Math.max(maxY, y)

    const swatch = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    swatch.setAttribute('x', String(x))
    swatch.setAttribute('y', String(y - 10))
    swatch.setAttribute('width', '10')
    swatch.setAttribute('height', '10')
    swatch.setAttribute('rx', '2')
    swatch.setAttribute('fill', item.color)
    exportSvg.appendChild(swatch)

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    label.setAttribute('x', String(x + 16))
    label.setAttribute('y', String(y))
    label.setAttribute('fill', theme.textHeading)
    label.setAttribute('font-family', theme.sans)
    label.setAttribute('font-size', '12')
    label.textContent = item.label
    exportSvg.appendChild(label)
  })

  return maxY + 16
}

/**
 * @param {{ title: string, panels: { svg: SVGSVGElement, subtitle?: string, legendItems?: { color: string, label: string }[], legendField?: string }[] }} options
 */
export async function saveOutcomeChartPng({ title, panels }) {
  if (!panels.length) throw new Error('No chart to export')

  const theme = getChartTheme()
  const serializer = new XMLSerializer()
  const preparedPanels = panels.map((panel) => ({
    ...panel,
    legendItems: sortLegendItems(panel.legendItems ?? [], panel.legendField),
  }))
  const panelGap = preparedPanels.length > 1 ? 20 : 0
  const panelSizes = preparedPanels.map(({ svg }) => svgSize(svg))
  const chartsWidth = panelSizes.reduce((sum, size) => sum + size.width, 0) + panelGap * (preparedPanels.length - 1)
  const chartsHeight = Math.max(...panelSizes.map((size) => size.height))
  const hasSubtitle = preparedPanels.some((panel) => panel.subtitle)
  const subtitleSpace = hasSubtitle ? 18 : 0
  const maxLegendRows = Math.max(...preparedPanels.map((panel) => panel.legendItems.length), 0)
  const axisFooterH = 24
  const legendHeight = maxLegendRows ? maxLegendRows * 22 + 12 : 0
  const width = Math.max(chartsWidth + 32, 360)
  const height = 40 + subtitleSpace + chartsHeight + axisFooterH + legendHeight + 16
  const chartTop = 40 + subtitleSpace
  const legendTop = chartTop + chartsHeight + axisFooterH + 8

  const exportSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  exportSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  exportSvg.setAttribute('width', String(width))
  exportSvg.setAttribute('height', String(height))
  exportSvg.setAttribute('viewBox', `0 0 ${width} ${height}`)

  const cardRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  cardRect.setAttribute('width', String(width))
  cardRect.setAttribute('height', String(height))
  cardRect.setAttribute('fill', theme.cardBg)
  exportSvg.appendChild(cardRect)

  const titleText = document.createElementNS('http://www.w3.org/2000/svg', 'text')
  titleText.setAttribute('x', '16')
  titleText.setAttribute('y', '26')
  titleText.setAttribute('fill', theme.textHeading)
  titleText.setAttribute('font-family', theme.sans)
  titleText.setAttribute('font-size', '18')
  titleText.setAttribute('font-weight', '600')
  titleText.textContent = title
  exportSvg.appendChild(titleText)

  let offsetX = 16
  preparedPanels.forEach(({ svg, subtitle, legendItems }, index) => {
    const { width: panelWidth } = panelSizes[index]
    const chartGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    chartGroup.setAttribute('transform', `translate(${offsetX} ${chartTop})`)

    if (subtitle) {
      const subtitleText = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      subtitleText.setAttribute('x', '0')
      subtitleText.setAttribute('y', '-6')
      subtitleText.setAttribute('fill', theme.textHeading)
      subtitleText.setAttribute('font-family', theme.sans)
      subtitleText.setAttribute('font-size', '13')
      subtitleText.setAttribute('font-weight', '600')
      subtitleText.textContent = subtitle
      chartGroup.appendChild(subtitleText)
    }

    chartGroup.appendChild(flattenSvgToGroup(svg, theme))
    exportSvg.appendChild(chartGroup)

    if (legendItems.length) {
      appendLegend(exportSvg, legendItems, legendTop, theme, offsetX, panelWidth)
    }

    offsetX += panelWidth + panelGap
  })

  const axisY = chartTop + chartsHeight + 8
  const axisLeft = document.createElementNS('http://www.w3.org/2000/svg', 'text')
  axisLeft.setAttribute('x', '16')
  axisLeft.setAttribute('y', String(axisY))
  axisLeft.setAttribute('fill', theme.text)
  axisLeft.setAttribute('font-family', theme.sans)
  axisLeft.setAttribute('font-size', '11')
  axisLeft.textContent = 'worse'
  exportSvg.appendChild(axisLeft)

  const axisMid = document.createElementNS('http://www.w3.org/2000/svg', 'text')
  axisMid.setAttribute('x', String(width / 2))
  axisMid.setAttribute('y', String(axisY))
  axisMid.setAttribute('text-anchor', 'middle')
  axisMid.setAttribute('fill', theme.text)
  axisMid.setAttribute('font-family', theme.mono)
  axisMid.setAttribute('font-size', '11')
  axisMid.textContent = 'Rank'
  exportSvg.appendChild(axisMid)

  const axisRight = document.createElementNS('http://www.w3.org/2000/svg', 'text')
  axisRight.setAttribute('x', String(width - 16))
  axisRight.setAttribute('y', String(axisY))
  axisRight.setAttribute('text-anchor', 'end')
  axisRight.setAttribute('fill', theme.text)
  axisRight.setAttribute('font-family', theme.sans)
  axisRight.setAttribute('font-size', '11')
  axisRight.textContent = 'better'
  exportSvg.appendChild(axisRight)

  const svgText = serializer.serializeToString(exportSvg)
  const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  try {
    await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const scale = 2
        const canvas = document.createElement('canvas')
        canvas.width = width * scale
        canvas.height = height * scale
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas context unavailable'))
          return
        }
        ctx.fillStyle = theme.cardBg
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.scale(scale, scale)
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

export function bandsToLegendItems(bands, field) {
  return sortBands(bands, field).map((band) => ({
    color: band.color,
    label: `${band.display} · n=${band.n} · 중앙 ${Math.round(band.medianRank ?? 0)} · 평균 ${Math.round(band.meanRank ?? 0)}`,
  }))
}

export { sortBands }

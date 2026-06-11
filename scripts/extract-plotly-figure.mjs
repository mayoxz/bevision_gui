import fs from 'fs'
import path from 'path'

export function parseJsonValueAt(html, startIdx) {
  let i = startIdx
  while (html[i] === ' ' || html[i] === '\n' || html[i] === '\r' || html[i] === '\t') i += 1
  const open = html[i]
  if (open !== '[' && open !== '{') throw new Error(`Expected [ or { at ${i}`)

  const pairs = { '[': ']', '{': '}' }
  const close = pairs[open]
  let depth = 0
  let inStr = false
  let esc = false
  const start = i
  for (; i < html.length; i += 1) {
    const ch = html[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === open) depth += 1
    else if (ch === close) {
      depth -= 1
      if (depth === 0) {
        return { value: JSON.parse(html.slice(start, i + 1)), end: i + 1 }
      }
    }
  }
  throw new Error('Unterminated JSON value')
}

export function extractPlotlyFigure(html) {
  const plotIdx = html.lastIndexOf('Plotly.newPlot(')
  if (plotIdx < 0) throw new Error('Plotly.newPlot not found')

  let i = plotIdx + 'Plotly.newPlot('.length
  while (html[i] === ' ' || html[i] === '\n') i += 1
  const idEnd = html.indexOf('"', i + 1)
  const plotId = html.slice(i + 1, idEnd)
  i = idEnd + 1
  while (html[i] === ',' || html[i] === ' ' || html[i] === '\n') i += 1

  const dataParsed = parseJsonValueAt(html, i)
  i = dataParsed.end
  while (html[i] === ',' || html[i] === ' ' || html[i] === '\n') i += 1
  const layoutParsed = parseJsonValueAt(html, i)

  return { plotId, data: dataParsed.value, layout: layoutParsed.value }
}

function buildFigureBundle(label, figure) {
  const [pointcloud, matchedGt, missedGt, matchedPred, falsePred, ego] = figure.data
  return {
    label,
    title: figure.layout?.title?.text ?? label,
    bboxTraces: [matchedGt, missedGt, matchedPred],
    sharedTraceNames: {
      pointcloud: pointcloud?.name ?? 'LiDAR points',
      falsePred: falsePred?.name ?? 'False prediction',
      ego: ego?.name ?? 'Ego',
    },
    pointcloud,
    falsePred,
    ego,
  }
}

function zeroLayoutPadding(layout) {
  const next = structuredClone(layout)
  next.margin = { l: 0, r: 0, t: 0, b: 0, pad: 0 }
  if (next.title) {
    next.title = { ...next.title, pad: 0 }
  }
  return next
}

function solidLineTraces(traces) {
  return traces.map((trace) => {
    if (!trace.line) return trace
    return { ...trace, line: { ...trace.line, dash: 'solid' } }
  })
}

const sources = [
  { file: 'd:/Downloads/basemodel.html', key: 'basemodel' },
  { file: 'd:/Downloads/bevision.html', key: 'bevision' },
]

const outDir = path.resolve('frontend/public/data/basemodel-vs-bevision')
fs.mkdirSync(outDir, { recursive: true })

const extracted = Object.fromEntries(
  sources.map(({ file, key }) => {
    const figure = extractPlotlyFigure(fs.readFileSync(file, 'utf8'))
    return [key, { figure, bundle: buildFigureBundle(key, figure) }]
  }),
)

const baseFigure = extracted.basemodel.figure
const bevFigure = extracted.bevision.figure

const sharedPayload = {
  layout: zeroLayoutPadding(baseFigure.layout),
  pointcloud: extracted.basemodel.bundle.pointcloud,
  falsePred: extracted.basemodel.bundle.falsePred,
  ego: extracted.basemodel.bundle.ego,
}

for (const key of ['basemodel', 'bevision']) {
  const { bundle } = extracted[key]
  fs.writeFileSync(
    path.join(outDir, `${key}.json`),
    JSON.stringify({
      label: bundle.label,
      title: bundle.title,
      bboxTraces: solidLineTraces(bundle.bboxTraces),
    }),
  )
}

fs.writeFileSync(path.join(outDir, 'shared.json'), JSON.stringify(sharedPayload))

console.log('Wrote', outDir)
console.log('  shared.json (layout + pointcloud + ego + false prediction)')
console.log('  basemodel.json (bbox traces)')
console.log('  bevision.json (bbox traces)')

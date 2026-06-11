import fs from 'fs'
import crypto from 'crypto'

const files = ['d:/Downloads/basemodel.html', 'd:/Downloads/bevision.html']

function parseJsonValueAt(html, startIdx) {
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

function extractPlotlyFigure(html) {
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

function hashBdata(obj) {
  if (!obj?.bdata) return null
  return crypto.createHash('sha256').update(obj.bdata).digest('hex').slice(0, 16)
}

function getCoordLens(trace) {
  const lens = {}
  for (const key of ['x', 'y', 'z', 'text']) {
    const val = trace[key]
    if (Array.isArray(val)) lens[key] = val.length
    else if (val?.bdata) lens[key] = Buffer.from(val.bdata, 'base64').length
    else lens[key] = 0
  }
  return lens
}

function classifyTrace(trace) {
  if (trace.type === 'scatter3d' && trace.mode?.includes('markers') && trace.name === 'LiDAR points') {
    return 'pointcloud'
  }
  if (trace.type === 'scatter3d' && trace.mode?.includes('lines')) return 'bbox'
  if (trace.name === 'Ego') return 'ego'
  return 'other'
}

const figures = {}
for (const file of files) {
  figures[file] = extractPlotlyFigure(fs.readFileSync(file, 'utf8'))
}

const base = figures[files[0]]
const bev = figures[files[1]]

console.log('=== FILE STRUCTURE ===')
console.log('plot id same:', base.plotId === bev.plotId)
console.log('trace count:', base.data.length, bev.data.length)

console.log('\n=== TRACES ===')
for (let i = 0; i < base.data.length; i += 1) {
  const a = base.data[i]
  const b = bev.data[i]
  const cls = classifyTrace(a)
  const lensA = getCoordLens(a)
  const lensB = getCoordLens(b)
  const sameX = hashBdata(a.x) === hashBdata(b.x)
  const sameY = hashBdata(a.y) === hashBdata(b.y)
  const sameZ = hashBdata(a.z) === hashBdata(b.z)
  const sameColor = hashBdata(a.marker?.color) === hashBdata(b.marker?.color)
  const sameStructure =
    a.type === b.type &&
    a.name === b.name &&
    a.mode === b.mode &&
    lensA.x === lensB.x &&
    lensA.y === lensB.y &&
    lensA.z === lensB.z

  console.log(`#${i} [${cls}] ${a.name}`)
  console.log(`  structure same: ${sameStructure}`)
  console.log(`  coords bytes: base x=${lensA.x} y=${lensA.y} z=${lensA.z} | bev x=${lensB.x} y=${lensB.y} z=${lensB.z}`)
  if (cls === 'pointcloud') {
    console.log(`  pointcloud identical: x=${sameX} y=${sameY} z=${sameZ} color=${sameColor}`)
  }
  if (cls === 'bbox') {
    console.log(`  line color: ${a.line?.color}`)
    console.log(`  text len: base=${lensA.text} bev=${lensB.text}`)
  }
}

console.log('\n=== LAYOUT ===')
const layoutKeys = [...new Set([...Object.keys(base.layout), ...Object.keys(bev.layout)])].sort()
const sameLayoutKeys = layoutKeys.filter((k) => JSON.stringify(base.layout[k]) === JSON.stringify(bev.layout[k]))
const diffLayoutKeys = layoutKeys.filter((k) => JSON.stringify(base.layout[k]) !== JSON.stringify(bev.layout[k]))
console.log('same layout keys:', sameLayoutKeys.length, sameLayoutKeys.slice(0, 20))
console.log('diff layout keys:', diffLayoutKeys)

console.log('\n=== SEPARATION PLAN ===')
console.log('SHARED (extract once):')
console.log('  - trace #0 LiDAR points (30000 pts, identical coords/color)')
console.log('  - trace #5 Ego (single marker at origin)')
console.log('  - trace #4 False prediction (empty placeholder, orange line style)')
console.log('  - layout/scene/camera (mostly shared)')
console.log('')
console.log('MODEL-SPECIFIC (keep per model):')
console.log('  basemodel:')
console.log('    - Matched GT: 396 line vertices (132 boxes × 12 pts/box?)')
console.log('    - Missed GT: 108 line vertices')
console.log('    - Matched prediction: 396 line vertices')
console.log('  bevision:')
console.log('    - Matched GT: 504 line vertices')
console.log('    - Missed GT: empty')
console.log('    - Matched prediction: 504 line vertices')

console.log('\n=== BBOX DETAIL ===')
for (const [label, fig] of [
  ['basemodel', base],
  ['bevision', bev],
]) {
  for (const trace of fig.data.filter((t) => classifyTrace(t) === 'bbox')) {
    const texts = Array.isArray(trace.text) ? trace.text : []
    const uniq = [...new Set(texts.filter(Boolean))]
    const nulls = Array.isArray(trace.x) ? trace.x.filter((v) => v === null).length : 0
    const boxEstimate = nulls > 0 ? nulls + 1 : uniq.length || (trace.x?.length ? Math.round(trace.x.length / 12) : 0)
    console.log(
      `${label} / ${trace.name}: vertices=${trace.x?.length ?? 0}, nullBreaks=${nulls}, uniqueLabels=${uniq.length}, estBoxes=${boxEstimate}`,
    )
    if (uniq.length) console.log(`  labels: ${uniq.slice(0, 5).join(' | ')}`)
  }
}

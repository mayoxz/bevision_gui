import { resolveDataUrl } from '../../config/dataUrl.js'
import {
  buildSceneLabelTrace,
  buildSceneRoomTraces,
  DEFAULT_SCENE_CAMERA,
  SCENE_AXIS_RANGES,
} from './sceneRoom.js'

const DATA_ROOT = 'basemodel-vs-bevision'
/** basemodel.html export default; scatter3d renders thicker on high-DPR displays. */
const POINTCLOUD_MARKER_EXPORT_PX = 1.2

const HIDDEN_SCENE_AXIS = {
  showgrid: false,
  showbackground: false,
  showticklabels: false,
  showline: false,
  zeroline: false,
  title: { text: '' },
  ticks: '',
}

async function fetchJson(path) {
  const res = await fetch(resolveDataUrl(path))
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`)
  return res.json()
}

function hasCoordinates(trace) {
  if (Array.isArray(trace.x)) return trace.x.length > 0
  return Boolean(trace.x?.bdata)
}

function normalizeTrace(trace) {
  const next = structuredClone(trace)
  if (next.line) {
    next.line = { ...next.line, dash: 'solid' }
  }
  next.showlegend = true
  if (next.mode === 'lines' && !hasCoordinates(next)) {
    next.x = [0]
    next.y = [0]
    next.z = [-100]
    next.opacity = 0
    next.hoverinfo = 'skip'
  }
  return next
}

function pointcloudMarkerSize() {
  const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1
  return POINTCLOUD_MARKER_EXPORT_PX / dpr
}

function normalizePointcloudTrace(trace) {
  const next = normalizeTrace(trace)
  next.marker = { ...next.marker, size: pointcloudMarkerSize() }
  return next
}

export function buildFigureTraces(shared, model) {
  return [
    ...buildSceneRoomTraces(),
    normalizePointcloudTrace(shared.pointcloud),
    ...model.bboxTraces.map(normalizeTrace),
    normalizeTrace(shared.falsePred),
    normalizeTrace(shared.ego),
    buildSceneLabelTrace(),
  ]
}

export function buildFigureLayout(shared) {
  const layout = structuredClone(shared.layout)
  layout.template = undefined
  layout.margin = { l: 0, r: 0, t: 0, b: 0, pad: 0 }
  layout.title = undefined
  layout.autosize = true
  layout.paper_bgcolor = 'white'
  layout.plot_bgcolor = 'white'
  layout.showlegend = false
  layout.scene = {
    ...layout.scene,
    domain: { x: [0, 1], y: [0, 1] },
    bgcolor: 'white',
    xaxis: { ...layout.scene?.xaxis, ...HIDDEN_SCENE_AXIS, range: SCENE_AXIS_RANGES.x },
    yaxis: { ...layout.scene?.yaxis, ...HIDDEN_SCENE_AXIS, range: SCENE_AXIS_RANGES.y },
    zaxis: { ...layout.scene?.zaxis, ...HIDDEN_SCENE_AXIS, range: SCENE_AXIS_RANGES.z },
    camera: DEFAULT_SCENE_CAMERA,
  }
  if (Array.isArray(layout.annotations)) {
    layout.annotations = layout.annotations.map((note) => ({
      ...note,
      font: { color: '#444444', size: 11 },
    }))
  }
  return layout
}

export async function fetchCompareFigures() {
  const [shared, basemodel, bevision] = await Promise.all([
    fetchJson(`${DATA_ROOT}/shared.json`),
    fetchJson(`${DATA_ROOT}/basemodel.json`),
    fetchJson(`${DATA_ROOT}/bevision.json`),
  ])
  return { shared, basemodel, bevision }
}

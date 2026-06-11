const X_MIN = -54
const X_MAX = 54
const Y_MIN = -54
const Y_MAX = 54
const Z_MIN = -5
const Z_MAX = 5
const XY_STEP = 10
const Z_STEP = 5

const GRID_COLOR = '#c8c8c8'
const EDGE_COLOR = '#a8a8a8'
const LABEL_COLOR = '#444444'
const LABEL_OFFSET = 4

function rangeTicks(min, max, step) {
  const ticks = []
  for (let v = min; v <= max + step * 0.01; v += step) {
    ticks.push(Math.round(v * 1000) / 1000)
  }
  return ticks
}

function pushSegment(xs, ys, zs, x0, y0, z0, x1, y1, z1) {
  xs.push(x0, x1, null)
  ys.push(y0, y1, null)
  zs.push(z0, z1, null)
}

function buildGridLineCoords() {
  const x = []
  const y = []
  const z = []
  const xTicks = rangeTicks(X_MIN, X_MAX, XY_STEP)
  const yTicks = rangeTicks(Y_MIN, Y_MAX, XY_STEP)
  const zTicks = rangeTicks(Z_MIN, Z_MAX, Z_STEP)

  for (const yi of yTicks) {
    pushSegment(x, y, z, X_MIN, yi, Z_MIN, X_MAX, yi, Z_MIN)
  }
  for (const xi of xTicks) {
    pushSegment(x, y, z, xi, Y_MIN, Z_MIN, xi, Y_MAX, Z_MIN)
  }

  for (const zi of zTicks) {
    pushSegment(x, y, z, X_MIN, Y_MIN, zi, X_MIN, Y_MAX, zi)
    pushSegment(x, y, z, X_MAX, Y_MIN, zi, X_MAX, Y_MAX, zi)
    pushSegment(x, y, z, X_MIN, Y_MIN, zi, X_MAX, Y_MIN, zi)
    pushSegment(x, y, z, X_MIN, Y_MAX, zi, X_MAX, Y_MAX, zi)
  }

  x.pop()
  y.pop()
  z.pop()
  return { x, y, z }
}

function buildRoomOutlineCoords() {
  const x = []
  const y = []
  const z = []

  const floor = [
    [X_MIN, Y_MIN, Z_MIN],
    [X_MAX, Y_MIN, Z_MIN],
    [X_MAX, Y_MAX, Z_MIN],
    [X_MIN, Y_MAX, Z_MIN],
    [X_MIN, Y_MIN, Z_MIN],
  ]
  for (let i = 0; i < floor.length - 1; i += 1) {
    pushSegment(x, y, z, ...floor[i], ...floor[i + 1])
  }

  const wallTops = [
    [[X_MIN, Y_MIN, Z_MAX], [X_MAX, Y_MIN, Z_MAX]],
    [[X_MAX, Y_MIN, Z_MAX], [X_MAX, Y_MAX, Z_MAX]],
    [[X_MAX, Y_MAX, Z_MAX], [X_MIN, Y_MAX, Z_MAX]],
    [[X_MIN, Y_MAX, Z_MAX], [X_MIN, Y_MIN, Z_MAX]],
  ]
  for (const [[x0, y0, z0], [x1, y1, z1]] of wallTops) {
    pushSegment(x, y, z, x0, y0, z0, x1, y1, z1)
  }

  const corners = [
    [X_MIN, Y_MIN],
    [X_MAX, Y_MIN],
    [X_MAX, Y_MAX],
    [X_MIN, Y_MAX],
  ]
  for (const [px, py] of corners) {
    pushSegment(x, y, z, px, py, Z_MIN, px, py, Z_MAX)
  }

  x.pop()
  y.pop()
  z.pop()
  return { x, y, z }
}

function pushLabel(labels, px, py, pz, text) {
  labels.x.push(px)
  labels.y.push(py)
  labels.z.push(pz)
  labels.text.push(text)
}

function buildAxisLabels() {
  const labels = { x: [], y: [], z: [], text: [] }
  const xTicks = rangeTicks(X_MIN, X_MAX, XY_STEP)
  const yTicks = rangeTicks(Y_MIN, Y_MAX, XY_STEP)
  const zTicks = rangeTicks(Z_MIN, Z_MAX, Z_STEP).filter((zi) => zi < Z_MAX)

  for (const xi of xTicks) {
    pushLabel(labels, xi, Y_MIN - LABEL_OFFSET, Z_MIN, String(xi))
    pushLabel(labels, xi, Y_MAX + LABEL_OFFSET, Z_MIN, String(xi))
  }

  for (const yi of yTicks) {
    pushLabel(labels, X_MIN - LABEL_OFFSET, yi, Z_MIN, String(yi))
    pushLabel(labels, X_MAX + LABEL_OFFSET, yi, Z_MIN, String(yi))
  }

  for (const zi of zTicks) {
    pushLabel(labels, X_MIN - LABEL_OFFSET, Y_MIN - LABEL_OFFSET, zi, String(zi))
    pushLabel(labels, X_MAX + LABEL_OFFSET, Y_MIN - LABEL_OFFSET, zi, String(zi))
    pushLabel(labels, X_MIN - LABEL_OFFSET, Y_MAX + LABEL_OFFSET, zi, String(zi))
    pushLabel(labels, X_MAX + LABEL_OFFSET, Y_MAX + LABEL_OFFSET, zi, String(zi))
  }

  pushLabel(labels, (X_MIN + X_MAX) / 2, Y_MIN - LABEL_OFFSET * 1.5, Z_MIN, 'x (m)')
  pushLabel(labels, X_MIN - LABEL_OFFSET * 1.5, (Y_MIN + Y_MAX) / 2, Z_MIN, 'y (m)')
  pushLabel(labels, X_MIN - LABEL_OFFSET * 1.5, Y_MIN - LABEL_OFFSET * 1.5, (Z_MIN + Z_MAX) / 2, 'z (m)')

  return labels
}

export function buildSceneRoomTraces() {
  const grid = buildGridLineCoords()
  const outline = buildRoomOutlineCoords()

  return [
    {
      type: 'scatter3d',
      mode: 'lines',
      ...grid,
      line: { color: GRID_COLOR, width: 1 },
      hoverinfo: 'skip',
      showlegend: false,
      name: 'room-grid',
    },
    {
      type: 'scatter3d',
      mode: 'lines',
      ...outline,
      line: { color: EDGE_COLOR, width: 2 },
      hoverinfo: 'skip',
      showlegend: false,
      name: 'room-outline',
    },
  ]
}

export function buildSceneLabelTrace() {
  const labels = buildAxisLabels()
  return {
    type: 'scatter3d',
    mode: 'text',
    x: labels.x,
    y: labels.y,
    z: labels.z,
    text: labels.text,
    textfont: { size: 12, color: LABEL_COLOR },
    hoverinfo: 'skip',
    showlegend: false,
    name: 'room-labels',
  }
}

const LABEL_PAD = LABEL_OFFSET * 1.6

export const SCENE_AXIS_RANGES = {
  x: [X_MIN - LABEL_PAD, X_MAX + LABEL_PAD],
  y: [Y_MIN - LABEL_PAD, Y_MAX + LABEL_PAD],
  z: [Z_MIN, Z_MAX],
}

export const DEFAULT_SCENE_CAMERA = {
  up: { x: 0, y: 0, z: 1 },
  center: { x: 0, y: 0, z: 0 },
  eye: { x: 1.3564998873121257, y: -1.342610321950942, z: 0.9012799671095427 },
  projection: { type: 'perspective' },
}

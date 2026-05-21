/** nuScenes vehicle forward axis in world coordinates */
export const NUSCENES_FORWARD = [0, 1, 0]

/**
 * @param {number[]} m 4×4 column-major
 * @param {number[]} v [x, y, z, w]
 */
export function multiplyMat4Vec4(m, v) {
  const [x, y, z, w] = v
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12] * w,
    m[1] * x + m[5] * y + m[9] * z + m[13] * w,
    m[2] * x + m[6] * y + m[10] * z + m[14] * w,
    m[3] * x + m[7] * y + m[11] * z + m[15] * w,
  ]
}

/**
 * World position → CSS pixel coords (origin top-left, y down).
 * @returns {[number, number] | null}
 */
export function worldToScreen(viewProjection, worldPos, cssWidth, cssHeight) {
  const clip = multiplyMat4Vec4(viewProjection, [worldPos[0], worldPos[1], worldPos[2], 1])
  const w = clip[3]
  if (!Number.isFinite(w) || w <= 0.001) return null

  const ndcX = clip[0] / w
  const ndcY = clip[1] / w
  if (!Number.isFinite(ndcX) || !Number.isFinite(ndcY)) return null
  if (ndcX < -1.2 || ndcX > 1.2 || ndcY < -1.2 || ndcY > 1.2) return null

  return [
    (ndcX + 1) * 0.5 * cssWidth,
    (1 - ndcY) * 0.5 * cssHeight,
  ]
}

/**
 * Ray from center along (nx, ny) to frame edge in normalized 0–1 coords.
 */
export function edgePositionNormalized(cx, cy, nx, ny, margin = 0.05) {
  let t = Infinity
  if (nx > 1e-6) t = Math.min(t, (1 - margin - cx) / nx)
  if (nx < -1e-6) t = Math.min(t, (margin - cx) / nx)
  if (ny > 1e-6) t = Math.min(t, (1 - margin - cy) / ny)
  if (ny < -1e-6) t = Math.min(t, (margin - cy) / ny)
  if (!Number.isFinite(t) || t <= 0) return { x: cx, y: cy }
  return { x: cx + nx * t, y: cy + ny * t }
}

/**
 * Front/Back label positions (0–1 within the viewer frame) from the active view matrix.
 * @returns {{ front: { x: number, y: number }, back: { x: number, y: number } } | null}
 */
export function computeFrontBackLabelLayout(viewProjection, target, radius, cssWidth, cssHeight) {
  if (cssWidth < 1 || cssHeight < 1) return null

  const offset = Math.max(8, radius * 0.08)
  const center = worldToScreen(viewProjection, target, cssWidth, cssHeight)
  if (!center) return null

  const frontWorld = [
    target[0] + NUSCENES_FORWARD[0] * offset,
    target[1] + NUSCENES_FORWARD[1] * offset,
    target[2] + NUSCENES_FORWARD[2] * offset,
  ]
  const frontPt = worldToScreen(viewProjection, frontWorld, cssWidth, cssHeight)
  if (!frontPt) return null

  let nx = frontPt[0] - center[0]
  let ny = frontPt[1] - center[1]
  const len = Math.hypot(nx, ny)
  if (len < 1e-3) return null
  nx /= len
  ny /= len

  const cx = center[0] / cssWidth
  const cy = center[1] / cssHeight
  const snx = nx / cssWidth
  const sny = ny / cssHeight

  const front = edgePositionNormalized(cx, cy, snx, sny)
  const back = edgePositionNormalized(cx, cy, -snx, -sny)
  return { front, back }
}

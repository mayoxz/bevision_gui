/**
 * Bird's-eye view (BEV) for nuScenes point clouds.
 *
 * World frame (nuScenes): +X forward, +Y left, +Z up.
 * BEV camera sits on +Z above the target; view uses a fixed horizontal basis so
 * +X appears on the screen left (Front) and +Y toward screen down.
 */

export const BEV_CONFIG = {
  pitch: Math.PI / 2 - 0.001,
  /** Default zoom = resetDistance / distance */
  zoomFactor: 1.5,
  zoomMin: 0.5,
  zoomMax: 3,
  /** Slower than orbit wheel (0.001) */
  wheelSensitivity: 0.00035,
  fitMargin: 1.15,
  minHalfExtent: 20,
  /** Camera +X axis in world coords → screen right = world −X → +X forward on screen left */
  cameraRight: [0, -1, 0],
}

export function bevZoomFactor(resetDistance, distance) {
  return resetDistance / Math.max(distance, 0.001)
}

export function bevDistanceLimits(resetDistance, config = BEV_CONFIG) {
  return {
    min: resetDistance / config.zoomMax,
    max: resetDistance / config.zoomMin,
  }
}

export function clampBevDistance(distance, resetDistance, config = BEV_CONFIG) {
  const { min, max } = bevDistanceLimits(resetDistance, config)
  return Math.max(min, Math.min(max, distance))
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

function normalize(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / len, v[1] / len, v[2] / len]
}

/** Screen-horizontal / screen-vertical axes in world coords (top-down). */
export function getBevPanAxes(config = BEV_CONFIG) {
  const right = normalize([...config.cameraRight])
  const up = normalize(cross([0, 0, 1], right))
  return { right, up }
}

/**
 * @param {number} radius Bounding extent (max axis span of the cloud).
 * @param {number} cameraFov Vertical FOV in radians (same as orbit camera).
 */
export function bevDistanceForRadius(radius, cameraFov, config = BEV_CONFIG) {
  const halfExtent = Math.max(radius * 0.5 * config.fitMargin, config.minHalfExtent)
  return halfExtent / Math.tan(cameraFov / 2)
}

/**
 * Default BEV camera snapshot: top-down, centered, default zoom (zoomFactor).
 * @returns {{ yaw: number, pitch: number, resetDistance: number, distance: number, panOffset: number[], keyboardOffset: number[] }}
 */
export function createBevCameraSnapshot(radius, cameraFov, config = BEV_CONFIG) {
  const resetDistance = bevDistanceForRadius(radius, cameraFov, config)
  return {
    yaw: 0,
    pitch: config.pitch,
    resetDistance,
    distance: resetDistance / config.zoomFactor,
    panOffset: [0, 0, 0],
    keyboardOffset: [0, 0, 0],
  }
}

/**
 * Eye directly above target along +Z (true top-down position).
 * @param {number[]} target
 * @param {number} distance
 */
export function getBevEyeAndTarget(target, distance) {
  return {
    target: [...target],
    eye: [target[0], target[1], target[2] + distance],
  }
}

/**
 * View matrix for BEV; heading is fixed via cameraRight, not orbit yaw.
 * @param {number[]} eye
 * @param {number[]} target
 * @param {{
 *   subtract: (a: number[], b: number[]) => number[],
 *   cross: (a: number[], b: number[]) => number[],
 *   dot: (a: number[], b: number[]) => number,
 *   normalize: (v: number[]) => number[],
 *   viewMatrixFromBasis: (x: number[], y: number[], z: number[], eye: number[]) => number[],
 * }} math
 */
export function lookAtBev(eye, target, math, config = BEV_CONFIG) {
  const { subtract, cross, dot, normalize, viewMatrixFromBasis } = math
  const z = normalize(subtract(eye, target))
  const x = normalize([...config.cameraRight])
  let y = cross(z, x)
  if (Math.hypot(y[0], y[1], y[2]) < 1e-6) {
    y = [0, -1, 0]
  } else {
    y = normalize(y)
  }
  return viewMatrixFromBasis(x, y, z, eye)
}

const VERTEX_SHADER_SOURCE = `
  attribute vec3 aPosition;
  attribute float aIntensity;
  uniform mat4 uViewProjection;
  uniform float uPointSize;
  uniform int uColorMode;
  varying vec3 vColor;

  vec3 turbo(float x) {
    x = clamp(x, 0.0, 1.0);
    vec4 kRed = vec4(0.13572138, 4.61539260, -42.66032258, 132.13108234);
    vec4 kGreen = vec4(0.09140261, 2.19418839, 4.84296658, -14.18503333);
    vec4 kBlue = vec4(0.10667330, 12.64194608, -60.58204836, 110.36276771);
    vec4 v = vec4(1.0, x, x * x, x * x * x);
    return clamp(vec3(dot(v, kRed), dot(v, kGreen), dot(v, kBlue)), 0.0, 1.0);
  }

  void main() {
    gl_Position = uViewProjection * vec4(aPosition, 1.0);
    gl_PointSize = uPointSize;

    float value;
    if (uColorMode == 1) {
      value = clamp(aIntensity, 0.0, 1.0);
    } else if (uColorMode == 2) {
      value = clamp(length(aPosition.xy) / 80.0, 0.0, 1.0);
    } else {
      value = clamp((aPosition.z + 4.0) / 8.0, 0.0, 1.0);
    }
    vColor = turbo(value);
  }
`

const FRAGMENT_SHADER_SOURCE = `
  precision mediump float;
  varying vec3 vColor;

  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    if (dot(uv, uv) > 0.25) {
      discard;
    }
    gl_FragColor = vec4(vColor, 1.0);
  }
`

import {
  BEV_CONFIG,
  clampBevDistance,
  createBevCameraSnapshot,
  createDefaultOrbitBasis,
  getBevEyeAndTarget,
  getBevPanAxes,
  lookAtBev,
} from './bev.js'
import { computeFrontBackLabelLayout } from './screenOrientation.js'

const COLOR_MODE_INDEX = {
  height: 0,
  intensity: 1,
  distance: 2,
}

const VIEW_MODE_FILENAME_SUFFIX = {
  perspective: 'persp',
  ortho: 'ortho',
  bev: 'bev',
}

function fileStem(name) {
  return name.replace(/\.[^.]+$/, '')
}

function formatLoadedFileNames(fileList) {
  if (fileList.length === 0) return ''
  if (fileList.length === 1) return fileList[0].name
  const others = fileList.length - 1
  const otherLabel = others === 1 ? '1 other' : `${others} others`
  return `${fileList[0].name} + ${otherLabel}`
}

function formatLoadedSourceStem(fileList) {
  if (fileList.length === 0) return ''
  if (fileList.length === 1) return fileStem(fileList[0].name)
  const others = fileList.length - 1
  return `${fileStem(fileList[0].name)}-and-${others}others`
}

function sanitizeFilenamePart(value) {
  const sanitized = value.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '')
  return sanitized || 'pointcloud'
}

function buildPngDownloadName(sourceStem, mode) {
  const stem = sanitizeFilenamePart(sourceStem || 'pointcloud')
  const modeSuffix = VIEW_MODE_FILENAME_SUFFIX[mode] ?? mode
  return `${stem}-${modeSuffix}.png`
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLElement} stage
 * @param {HTMLElement | null} frame
 * @param {{
 *   onStatus?: (msg: string) => void,
 *   onZoom?: (factor: number) => void,
 *   onDropHintHidden?: (hidden: boolean) => void,
 *   onViewModeChange?: (mode: 'perspective' | 'ortho' | 'bev') => void,
 *   onResetAvailable?: (available: boolean) => void,
 *   onOrientationLabels?: (layout: { front: { x: number, y: number }, back: { x: number, y: number } } | null) => void,
 *   onFps?: (fps: number, pointCount: number) => void,
 *   onFileLabel?: (info: { short: string, full: string }) => void,
 * }} callbacks
 */
export function createPointcloudEngine(canvas, stage, frame, callbacks = {}) {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: false })
  if (!gl) {
    callbacks.onStatus?.('WebGL is not available in this browser.')
    throw new Error('WebGL unavailable')
  }

  let loadedFileLabel = ''
  let loadedFileLabelFull = ''
  let loadedSourceStem = ''

  function setFileLabel(short, full) {
    loadedFileLabel = short
    loadedFileLabelFull = full
    callbacks.onFileLabel?.({ short, full })
  }

  function drawTopLeftLabel(ctx, text, width, height) {
    if (!text) return

    const scale = Math.max(1, height / 720)
    const margin = Math.round(10 * scale)
    const padX = Math.round(8 * scale)
    const padY = Math.round(4 * scale)
    const fontSize = Math.round(11 * scale)
    ctx.font = `${fontSize}px ui-monospace, Consolas, monospace`
    const textWidth = ctx.measureText(text).width
    const boxWidth = textWidth + padX * 2
    const boxHeight = fontSize + padY * 2

    ctx.fillStyle = '#3d424d'
    ctx.fillRect(margin, margin, boxWidth, boxHeight)
    ctx.fillStyle = '#e8e8e8'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, margin + padX, margin + boxHeight / 2)
  }

  const cleanups = []

  function on(target, type, handler, options) {
    target.addEventListener(type, handler, options)
    cleanups.push(() => target.removeEventListener(type, handler, options))
  }

  function compileShader(type, source) {
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader))
    }
    return shader
  }

  function createProgram() {
    const program = gl.createProgram()
    gl.attachShader(program, compileShader(gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE))
    gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program))
    }
    return program
  }

  const program = createProgram()
  gl.enable(gl.DEPTH_TEST)
  gl.depthFunc(gl.LEQUAL)
  const locations = {
    position: gl.getAttribLocation(program, 'aPosition'),
    intensity: gl.getAttribLocation(program, 'aIntensity'),
    viewProjection: gl.getUniformLocation(program, 'uViewProjection'),
    pointSize: gl.getUniformLocation(program, 'uPointSize'),
    colorMode: gl.getUniformLocation(program, 'uColorMode'),
  }

  const cameraFov = Math.PI / 4
  /** Elevation limits for orbit (Z-up spherical coords). */
  const PITCH_LIMIT = Math.PI / 2 - 0.05
  const CAMERA_SPEED = {
    move: 0.008,
    pan: 3,
    dolly: 3,
    rotate: 0.01,
    panDrag: 0.3,
    wheel: 0.00075,
    rotatePixel: 100,
  }
  const buffer = gl.createBuffer()
  let pointCount = 0
  let center = [0, 0, 0]
  let radius = 80
  /** Orbit camera basis (target → eye); updated incrementally to avoid cross-product flips. */
  let orbitDirection = [0, 0, 0]
  let orbitRight = [1, 0, 0]
  let orbitUp = [0, 1, 0]
  /** BEV mode still stores yaw/pitch in snapshots. */
  let yaw = 0
  let pitch = 0
  let distance = 115
  let resetDistance = 115
  let panOffset = [0, 0, 0]
  let keyboardOffset = [0, 0, 0]
  /** @type {'perspective'|'ortho'|'bev'} */
  let viewMode = 'perspective'
  /** @type {ReturnType<typeof cameraSnapshot> | null} */
  let orbitCamera = null
  /** @type {ReturnType<typeof cameraSnapshot> | null} */
  let bevCamera = null
  /** @type {ReturnType<typeof cameraSnapshot> | null} */
  let homeOrbitCamera = null
  /** @type {ReturnType<typeof cameraSnapshot> | null} */
  let homeBevCamera = null
  let colorMode = 'height'
  let pointSizeValue = 2.5
  const pressedKeys = new Set()
  const MAX_RENDER_FPS = 120
  const MIN_RENDER_INTERVAL = 1000 / MAX_RENDER_FPS
  /** Keyboard step sizes in getCameraStepSizes() are tuned for this frame interval. */
  const KEYBOARD_REFERENCE_MS = 1000 / 60
  let renderAnimation = 0
  let lastRenderTime = 0
  let resizeAnimation = 0
  let isDragging = false
  let dragButton = 0
  let lastPointer = [0, 0]
  const pendingPan = { dx: 0, dy: 0 }
  let pendingWheelDelta = 0
  const viewProjData = new Float32Array(16)
  let vertexLayoutReady = false
  let lastLabelUpdate = 0
  let cachedLabelLayout = null
  const LABEL_UPDATE_INTERVAL_MS = 100
  let fpsFrameCount = 0
  let fpsSampleStart = 0

  function mat4MultiplyInto(out, a, b) {
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        out[c * 4 + r] =
          a[0 * 4 + r] * b[c * 4 + 0] +
          a[1 * 4 + r] * b[c * 4 + 1] +
          a[2 * 4 + r] * b[c * 4 + 2] +
          a[3 * 4 + r] * b[c * 4 + 3]
      }
    }
    return out
  }

  function setupVertexLayout() {
    if (vertexLayoutReady) return
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.enableVertexAttribArray(locations.position)
    gl.vertexAttribPointer(locations.position, 3, gl.FLOAT, false, 16, 0)
    gl.enableVertexAttribArray(locations.intensity)
    gl.vertexAttribPointer(locations.intensity, 1, gl.FLOAT, false, 16, 12)
    vertexLayoutReady = true
  }

  function recordRenderFrame(now) {
    fpsFrameCount++
    if (!fpsSampleStart) fpsSampleStart = now
    const elapsed = now - fpsSampleStart
    if (elapsed < 500) return
    const fps = Math.round((fpsFrameCount * 1000) / elapsed)
    fpsFrameCount = 0
    fpsSampleStart = now
    callbacks.onFps?.(fps, pointCount)
  }

  function perspective(fovY, aspect, near, far) {
    const f = 1 / Math.tan(fovY / 2)
    const nf = 1 / (near - far)
    return [
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0,
    ]
  }

  function orthographic(left, right, bottom, top, near, far) {
    const lr = 1 / (left - right)
    const bt = 1 / (bottom - top)
    const nf = 1 / (near - far)
    return [
      -2 * lr, 0, 0, 0,
      0, -2 * bt, 0, 0,
      0, 0, 2 * nf, 0,
      (left + right) * lr, (top + bottom) * bt, (far + near) * nf, 1,
    ]
  }

  function subtract(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
  }

  function cross(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ]
  }

  function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  }

  function normalize(v) {
    const len = Math.hypot(v[0], v[1], v[2]) || 1
    return [v[0] / len, v[1] / len, v[2] / len]
  }

  function rotateAroundAxis(v, axis, angle) {
    const [kx, ky, kz] = normalize(axis)
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    const t = 1 - c
    const [x, y, z] = v
    return [
      (t * kx * kx + c) * x + (t * kx * ky - s * kz) * y + (t * kx * kz + s * ky) * z,
      (t * kx * ky + s * kz) * x + (t * ky * ky + c) * y + (t * ky * kz - s * kx) * z,
      (t * kx * kz - s * ky) * x + (t * ky * kz + s * kx) * y + (t * kz * kz + c) * z,
    ]
  }

  function directionFromYawPitch(y, p) {
    const cp = Math.cos(p)
    return normalize([
      Math.sin(y) * cp,
      Math.cos(y) * cp,
      Math.sin(p),
    ])
  }

  function setOrbitBasis(direction, right) {
    orbitDirection = normalize(direction)
    orbitRight = normalize(right)
    orbitUp = normalize(cross(orbitDirection, orbitRight))
  }

  function orbitRightFromYaw(y) {
    return normalize([Math.cos(y), -Math.sin(y), 0])
  }

  function orbitRightHintFromDirection() {
    return normalize([...BEV_CONFIG.cameraRight])
  }

  function applyDefaultOrbitBasis() {
    const { direction, right } = createDefaultOrbitBasis()
    setOrbitBasis(direction, right)
  }

  function initOrbitBasisFromYawPitch(y, p) {
    setOrbitBasis(directionFromYawPitch(y, p), orbitRightFromYaw(y))
  }

  function initOrbitBasisFromSnapshot(direction, savedRight) {
    setOrbitBasis(direction, savedRight ?? orbitRightHintFromDirection())
  }

  applyDefaultOrbitBasis()

  function projectOrbitBasis() {
    orbitDirection = normalize(orbitDirection)
    let r = orbitRight
    r = [
      r[0] - orbitDirection[0] * dot(r, orbitDirection),
      r[1] - orbitDirection[1] * dot(r, orbitDirection),
      r[2] - orbitDirection[2] * dot(r, orbitDirection),
    ]
    const rl = Math.hypot(r[0], r[1], r[2])
    if (rl > 1e-6) {
      r = [r[0] / rl, r[1] / rl, r[2] / rl]
      if (dot(r, orbitRight) < 0) {
        r = [-r[0], -r[1], -r[2]]
      }
      orbitRight = r
    }
    orbitUp = normalize(cross(orbitDirection, orbitRight))
  }

  function orbitBasis() {
    return { direction: orbitDirection, right: orbitRight, up: orbitUp }
  }

  function clampOrbitDirection(direction) {
    const d = normalize(direction)
    const sinLimit = Math.sin(PITCH_LIMIT)
    const z = d[2]
    if (z <= sinLimit && z >= -sinLimit) return d

    const clampedZ = Math.max(-sinLimit, Math.min(sinLimit, z))
    const h = Math.hypot(d[0], d[1])
    if (h < 1e-8) {
      return normalize([0, 0, clampedZ])
    }
    const scale = Math.sqrt(1 - clampedZ * clampedZ) / h
    return normalize([d[0] * scale, d[1] * scale, clampedZ])
  }

  function applyOrbitRotation(azimuthDelta, elevationDelta) {
    if (!azimuthDelta && !elevationDelta) return

    if (azimuthDelta) {
      orbitDirection = normalize(rotateAroundAxis(orbitDirection, orbitUp, -azimuthDelta))
      orbitRight = normalize(rotateAroundAxis(orbitRight, orbitUp, -azimuthDelta))
    }

    if (elevationDelta) {
      orbitDirection = normalize(rotateAroundAxis(orbitDirection, orbitRight, -elevationDelta))
      orbitUp = normalize(rotateAroundAxis(orbitUp, orbitRight, -elevationDelta))
    }

    const clamped = clampOrbitDirection(orbitDirection)
    if (Math.abs(clamped[0] - orbitDirection[0]) > 1e-6
      || Math.abs(clamped[1] - orbitDirection[1]) > 1e-6
      || Math.abs(clamped[2] - orbitDirection[2]) > 1e-6) {
      orbitDirection = clamped
      projectOrbitBasis()
    } else {
      orbitDirection = clamped
      orbitUp = normalize(cross(orbitDirection, orbitRight))
    }
  }

  function orbitViewMatrix(eye, basis) {
    return viewMatrixFromBasis(basis.right, basis.up, basis.direction, eye)
  }

  function viewMatrixFromBasis(x, y, z, eye) {
    return [
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
    ]
  }

  function resizeCanvas() {
    const cssWidth = canvas.clientWidth
    const cssHeight = canvas.clientHeight
    if (cssWidth < 1 || cssHeight < 1) return false

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const width = Math.max(1, Math.floor(cssWidth * dpr))
    const height = Math.max(1, Math.floor(cssHeight * dpr))
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
      gl.viewport(0, 0, width, height)
    }
    return true
  }

  function cameraSnapshot() {
    const base = {
      resetDistance,
      distance,
      panOffset: [...panOffset],
      keyboardOffset: [...keyboardOffset],
    }
    if (isBevMode()) {
      return { ...base, yaw, pitch }
    }
    return { ...base, direction: [...orbitDirection], right: [...orbitRight] }
  }

  function applySnapshot(snapshot) {
    if (snapshot.direction) {
      initOrbitBasisFromSnapshot(snapshot.direction, snapshot.right)
    } else {
      initOrbitBasisFromYawPitch(snapshot.yaw, snapshot.pitch)
    }
    yaw = snapshot.yaw ?? 0
    pitch = snapshot.pitch ?? 0
    resetDistance = snapshot.resetDistance
    distance = snapshot.distance
    panOffset = [...snapshot.panOffset]
    keyboardOffset = [...snapshot.keyboardOffset]
  }

  function cloneSnapshot(snapshot) {
    const cloned = {
      resetDistance: snapshot.resetDistance,
      distance: snapshot.distance,
      panOffset: [...snapshot.panOffset],
      keyboardOffset: [...snapshot.keyboardOffset],
    }
    if (snapshot.direction) {
      cloned.direction = [...snapshot.direction]
      if (snapshot.right) cloned.right = [...snapshot.right]
    } else {
      cloned.yaw = snapshot.yaw
      cloned.pitch = snapshot.pitch
    }
    return cloned
  }

  function applyInitialOrbitCamera() {
    applyDefaultOrbitBasis()
    resetDistance = Math.max(40, radius * 1.7)
    distance = resetDistance / 2
    panOffset = [0, 0, 0]
    keyboardOffset = [0, 0, 0]
  }

  function isBevMode() {
    return viewMode === 'bev'
  }

  function saveActiveModeState() {
    const snap = cameraSnapshot()
    if (viewMode === 'bev') bevCamera = snap
    else orbitCamera = snap
  }

  function createDefaultBevCamera() {
    return createBevCameraSnapshot(radius, cameraFov)
  }

  const bevMath = { subtract, cross, dot, normalize, viewMatrixFromBasis }

  function captureHomesOnLoad() {
    viewMode = 'perspective'
    applyInitialOrbitCamera()
    orbitCamera = cameraSnapshot()
    homeOrbitCamera = cloneSnapshot(orbitCamera)
    bevCamera = createDefaultBevCamera()
    homeBevCamera = cloneSnapshot(bevCamera)
    callbacks.onViewModeChange?.('perspective')
    callbacks.onResetAvailable?.(true)
  }

  function clearHomes() {
    orbitCamera = null
    bevCamera = null
    homeOrbitCamera = null
    homeBevCamera = null
    cachedLabelLayout = null
    lastLabelUpdate = 0
    callbacks.onResetAvailable?.(false)
    callbacks.onOrientationLabels?.(null)
  }

  function setViewMode(mode) {
    if (!pointCount) return false
    if (mode === viewMode) return true

    const leavingBev = viewMode === 'bev'
    const enteringBev = mode === 'bev'
    const orbitToOrbit = !leavingBev && !enteringBev

    if (!orbitToOrbit) {
      saveActiveModeState()
      if (enteringBev) {
        if (!bevCamera) bevCamera = createDefaultBevCamera()
        applySnapshot(bevCamera)
      } else {
        if (!orbitCamera) orbitCamera = cameraSnapshot()
        applySnapshot(orbitCamera)
      }
    }

    viewMode = mode
    cachedLabelLayout = null
    lastLabelUpdate = 0
    callbacks.onViewModeChange?.(viewMode)
    render()
    return true
  }

  function resetZoom() {
    const home = isBevMode() ? homeBevCamera : homeOrbitCamera
    if (!home) return false
    resetDistance = home.resetDistance
    distance = home.distance
    saveActiveModeState()
    render()
    return true
  }

  function resetPosition() {
    const home = isBevMode() ? homeBevCamera : homeOrbitCamera
    if (!home) return false
    if (home.direction) {
      initOrbitBasisFromSnapshot(home.direction, home.right)
    } else {
      initOrbitBasisFromYawPitch(home.yaw, home.pitch)
    }
    yaw = home.yaw ?? 0
    pitch = home.pitch ?? 0
    panOffset = [...home.panOffset]
    keyboardOffset = [...home.keyboardOffset]
    saveActiveModeState()
    render()
    return true
  }

  function navigationOffset() {
    return [
      panOffset[0] + keyboardOffset[0],
      panOffset[1] + keyboardOffset[1],
      panOffset[2] + keyboardOffset[2],
    ]
  }

  function currentTarget() {
    const o = navigationOffset()
    return [center[0] + o[0], center[1] + o[1], center[2] + o[2]]
  }

  function visibleHalfHeight() {
    return distance * Math.tan(cameraFov / 2)
  }

  function getViewportScale() {
    return (visibleHalfHeight() * 2) / Math.max(canvas.clientHeight, 1)
  }

  function getCameraStepSizes() {
    const step = Math.max(0.01, visibleHalfHeight() * CAMERA_SPEED.move)
    return {
      pan: step * CAMERA_SPEED.pan,
      dolly: step * CAMERA_SPEED.dolly,
      rotate: CAMERA_SPEED.rotate,
    }
  }

  function panDragScale() {
    return getViewportScale() * CAMERA_SPEED.panDrag
  }

  function pointerRotateScale() {
    return (CAMERA_SPEED.rotate * CAMERA_SPEED.rotatePixel) / Math.max(canvas.clientHeight, 1)
  }

  function dollyCamera(amount) {
    if (!pointCount) return
    if (isBevMode()) {
      distance = clampBevDistance(distance + amount, resetDistance)
      return
    }
    distance = Math.max(2, Math.min(1000, distance + amount))
  }

  function hasPendingCameraInput() {
    return pendingPan.dx !== 0
      || pendingPan.dy !== 0
      || pendingWheelDelta !== 0
      || pressedKeys.size > 0
  }

  function getPanAxes() {
    if (isBevMode()) {
      return getBevPanAxes()
    }
    const { direction, right } = orbitBasis()
    const lookGround = [-direction[0], -direction[1], 0]
    const lookLen = Math.hypot(lookGround[0], lookGround[1])
    const bevAxes = getBevPanAxes()
    let forward
    if (lookLen > 1e-6) {
      forward = [lookGround[0] / lookLen, lookGround[1] / lookLen, 0]
    } else {
      forward = [...bevAxes.up]
    }
    const rightGround = [right[0], right[1], 0]
    const rightLen = Math.hypot(rightGround[0], rightGround[1])
    let groundRight
    if (rightLen > 1e-6) {
      groundRight = [rightGround[0] / rightLen, rightGround[1] / rightLen, 0]
    } else {
      groundRight = [...bevAxes.right]
    }
    return { right: groundRight, up: forward }
  }

  function applyPendingPanDrag(dx, dy) {
    if (!dx && !dy) return
    const scale = panDragScale()
    const { right, up } = getPanAxes()
    applyPanDelta(
      (-right[0] * dx + up[0] * dy) * scale,
      (-right[1] * dx + up[1] * dy) * scale,
      (-right[2] * dx + up[2] * dy) * scale,
    )
  }

  function applyPointerRotateDrag(dx, dy) {
    if (!dx && !dy) return
    applyOrbitRotation(dx * pointerRotateScale(), dy * pointerRotateScale())
  }

  function applyPendingWheelDelta() {
    if (!pendingWheelDelta || !pointCount) return
    const wheelK = CAMERA_SPEED.wheel
    dollyCamera(distance * (Math.exp(pendingWheelDelta * wheelK) - 1))
    pendingWheelDelta = 0
  }

  function applyPendingCameraInput() {
    if (pendingPan.dx || pendingPan.dy) {
      applyPendingPanDrag(pendingPan.dx, pendingPan.dy)
      pendingPan.dx = 0
      pendingPan.dy = 0
    }
    applyPendingWheelDelta()
  }

  function render(now = performance.now()) {
    if (!resizeCanvas()) return
    recordRenderFrame(now)

    if (pointCount > 0) {
      const zoomFactor = resetDistance / Math.max(distance, 0.001)
      callbacks.onZoom?.(zoomFactor)
    }
    gl.clearColor(0.05, 0.06, 0.08, 1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    if (!pointCount) {
      callbacks.onOrientationLabels?.(null)
      return
    }

    const aspect = canvas.width / canvas.height
    const halfHeight = visibleHalfHeight()
    const projection = viewMode === 'perspective'
      ? perspective(cameraFov, aspect, 0.1, 1000)
      : orthographic(-halfHeight * aspect, halfHeight * aspect, -halfHeight, halfHeight, -1000, 1000)

    let view
    if (isBevMode()) {
      const target = currentTarget()
      const { eye, target: bevTarget } = getBevEyeAndTarget(target, distance)
      view = lookAtBev(eye, bevTarget, bevMath)
    } else {
      const basis = orbitBasis()
      const target = currentTarget()
      const eye = [
        target[0] + basis.direction[0] * distance,
        target[1] + basis.direction[1] * distance,
        target[2] + basis.direction[2] * distance,
      ]
      view = orbitViewMatrix(eye, basis)
    }
    mat4MultiplyInto(viewProjData, projection, view)

    gl.useProgram(program)
    setupVertexLayout()
    gl.uniformMatrix4fv(locations.viewProjection, false, viewProjData)
    gl.uniform1f(locations.pointSize, pointSizeValue)
    gl.uniform1i(locations.colorMode, COLOR_MODE_INDEX[colorMode] ?? 0)
    gl.drawArrays(gl.POINTS, 0, pointCount)

    if (now - lastLabelUpdate >= LABEL_UPDATE_INTERVAL_MS || !cachedLabelLayout) {
      lastLabelUpdate = now
      cachedLabelLayout = computeFrontBackLabelLayout(
        viewProjData,
        currentTarget(),
        radius,
        canvas.clientWidth,
        canvas.clientHeight,
      )
      callbacks.onOrientationLabels?.(cachedLabelLayout)
    }
  }

  function renderLoop(now) {
    renderAnimation = 0
    const keepRendering = hasPendingCameraInput() || isDragging || pointCount > 0
    if (!keepRendering) return

    let elapsedMs = KEYBOARD_REFERENCE_MS
    if (lastRenderTime > 0) {
      elapsedMs = Math.min(now - lastRenderTime, 100)
      if (elapsedMs < MIN_RENDER_INTERVAL) {
        scheduleRender()
        return
      }
    }

    applyPendingCameraInput()
    if (pressedKeys.size) {
      moveCameraFromKeysStep(elapsedMs / KEYBOARD_REFERENCE_MS)
    }
    render(now)
    lastRenderTime = now

    if (keepRendering) scheduleRender()
  }

  function scheduleRender() {
    if (renderAnimation) return
    renderAnimation = window.requestAnimationFrame(renderLoop)
  }

  function parseNuScenesBin(arrayBuffer) {
    if (arrayBuffer.byteLength % 20 !== 0) {
      throw new Error('Expected nuScenes .pcd.bin format: 5 float32 values per point.')
    }
    const raw = new Float32Array(arrayBuffer)
    const count = raw.length / 5
    const packed = new Float32Array(count * 4)
    for (let i = 0, j = 0; i < raw.length; i += 5, j += 4) {
      packed[j] = raw[i]
      packed[j + 1] = raw[i + 1]
      packed[j + 2] = raw[i + 2]
      packed[j + 3] = raw[i + 3]
    }
    return { packed, count }
  }

  function parsePcdHeader(text) {
    const lines = text.split(/\r?\n/)
    const header = {}
    let dataLineIndex = -1
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line || line.startsWith('#')) continue
      const [key, ...values] = line.split(/\s+/)
      header[key.toUpperCase()] = values
      if (key.toUpperCase() === 'DATA') {
        dataLineIndex = i
        break
      }
    }
    if (dataLineIndex < 0) {
      throw new Error('PCD header is missing DATA.')
    }
    return { header, headerText: lines.slice(0, dataLineIndex + 1).join('\n') }
  }

  function readPcdValue(view, offset, size, type) {
    const littleEndian = true
    if (type === 'F' && size === 4) return view.getFloat32(offset, littleEndian)
    if (type === 'F' && size === 8) return view.getFloat64(offset, littleEndian)
    if (type === 'I' && size === 1) return view.getInt8(offset)
    if (type === 'I' && size === 2) return view.getInt16(offset, littleEndian)
    if (type === 'I' && size === 4) return view.getInt32(offset, littleEndian)
    if (type === 'U' && size === 1) return view.getUint8(offset)
    if (type === 'U' && size === 2) return view.getUint16(offset, littleEndian)
    if (type === 'U' && size === 4) return view.getUint32(offset, littleEndian)
    return 0
  }

  function parseNuScenesRadarPcd(arrayBuffer) {
    const preview = new TextDecoder('utf-8').decode(arrayBuffer.slice(0, Math.min(arrayBuffer.byteLength, 4096)))
    const { header, headerText } = parsePcdHeader(preview)
    const dataType = ((header.DATA && header.DATA[0]) || '').toLowerCase()
    if (dataType !== 'binary') {
      throw new Error('Only binary nuScenes RADAR .pcd files are supported.')
    }
    const dataOffset = headerText.length + 1
    const fields = header.FIELDS || []
    const sizes = (header.SIZE || []).map(Number)
    const types = header.TYPE || []
    const counts = (header.COUNT || []).map(Number)
    const pointTotal = Number((header.POINTS && header.POINTS[0]) || (header.WIDTH && header.WIDTH[0]) || 0)
    const xIndex = fields.indexOf('x')
    const yIndex = fields.indexOf('y')
    const zIndex = fields.indexOf('z')
    const rcsIndex = fields.indexOf('rcs')
    if (xIndex < 0 || yIndex < 0 || zIndex < 0) {
      throw new Error('PCD file does not contain x/y/z fields.')
    }
    const offsets = []
    let stride = 0
    for (let i = 0; i < fields.length; i++) {
      offsets.push(stride)
      stride += (sizes[i] || 0) * (counts[i] || 1)
    }
    const view = new DataView(arrayBuffer, dataOffset)
    const packed = new Float32Array(pointTotal * 4)
    for (let point = 0, out = 0; point < pointTotal; point++, out += 4) {
      const base = point * stride
      packed[out] = readPcdValue(view, base + offsets[xIndex], sizes[xIndex], types[xIndex])
      packed[out + 1] = readPcdValue(view, base + offsets[yIndex], sizes[yIndex], types[yIndex])
      packed[out + 2] = readPcdValue(view, base + offsets[zIndex], sizes[zIndex], types[zIndex])
      const rcs = rcsIndex >= 0 ? readPcdValue(view, base + offsets[rcsIndex], sizes[rcsIndex], types[rcsIndex]) : 0
      packed[out + 3] = Math.max(0, Math.min(1, (rcs + 20) / 50))
    }
    return { packed, count: pointTotal }
  }

  function parsePointCloudFile(file, arrayBuffer) {
    if (file.name.toLowerCase().endsWith('.pcd')) {
      return parseNuScenesRadarPcd(arrayBuffer)
    }
    return parseNuScenesBin(arrayBuffer)
  }

  function computeBounds(packed) {
    let minX = Infinity, minY = Infinity, minZ = Infinity
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
    let sumX = 0, sumY = 0, sumZ = 0
    let count = 0
    for (let i = 0; i < packed.length; i += 4) {
      const x = packed[i]
      const y = packed[i + 1]
      const z = packed[i + 2]
      sumX += x
      sumY += y
      sumZ += z
      count++
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      minZ = Math.min(minZ, z)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
      maxZ = Math.max(maxZ, z)
    }
    center = count ? [sumX / count, sumY / count, sumZ / count] : [0, 0, 0]
    radius = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1)
  }

  function clearFiles() {
    if (!pointCount) return false

    pointCount = 0
    center = [0, 0, 0]
    radius = 80
    viewMode = 'perspective'
    orbitCamera = null
    bevCamera = null
    clearHomes()
    applyInitialOrbitCamera()
    pendingPan.dx = 0
    pendingPan.dy = 0
    pendingWheelDelta = 0
    isDragging = false
    pressedKeys.clear()

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(0), gl.STATIC_DRAW)
    vertexLayoutReady = false

    setFileLabel('', '')
    loadedSourceStem = ''
    callbacks.onDropHintHidden?.(false)
    callbacks.onViewModeChange?.('perspective')
    callbacks.onZoom?.(1)
    callbacks.onFps?.(0, 0)
    callbacks.onStatus?.('No point cloud loaded.')
    render()
    return true
  }

  async function loadFiles(files) {
    try {
      const fileList = Array.from(files)
      if (!fileList.length) return

      callbacks.onStatus?.(`Loading ${fileList.length} file(s)...`)
      setFileLabel('Loading…', `Loading ${fileList.length} file(s)...`)
      const clouds = []
      let totalPoints = 0
      for (const file of fileList) {
        const arrayBuffer = await file.arrayBuffer()
        const cloud = parsePointCloudFile(file, arrayBuffer)
        clouds.push({ file, cloud })
        totalPoints += cloud.count
      }

      const combined = new Float32Array(totalPoints * 4)
      let offset = 0
      for (const { cloud } of clouds) {
        combined.set(cloud.packed, offset)
        offset += cloud.packed.length
      }

      computeBounds(combined)
      pointCount = totalPoints
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, combined, gl.STATIC_DRAW)
      vertexLayoutReady = false
      setupVertexLayout()
      callbacks.onDropHintHidden?.(true)
      captureHomesOnLoad()
      callbacks.onFps?.(0, pointCount)
      render()
      scheduleRender()
      const names = formatLoadedFileNames(fileList)
      loadedSourceStem = formatLoadedSourceStem(fileList)
      const loadedLabel = `${names} - ${pointCount.toLocaleString()} points`
      const displayLabel = `${names} · ${pointCount.toLocaleString()} pts`
      callbacks.onStatus?.(loadedLabel)
      setFileLabel(displayLabel, loadedLabel)
    } catch (error) {
      callbacks.onStatus?.(error.message)
      setFileLabel('Error', error.message)
    }
  }

  function scheduleResizeRender() {
    if (resizeAnimation) return
    resizeAnimation = window.requestAnimationFrame(() => {
      resizeAnimation = 0
      render()
    })
  }

  function applyPanDelta(dx, dy, dz) {
    panOffset[0] += dx
    panOffset[1] += dy
    panOffset[2] += dz
  }

  function moveCameraFromKeysStep(frameScale) {
    if (!pressedKeys.size) return

    const { pan, dolly, rotate } = getCameraStepSizes()
    const panStep = pan * frameScale
    const dollyStep = dolly * frameScale
    const rotateStep = rotate * frameScale
    const { right, up } = getPanAxes()
    if (pressedKeys.has('w')) {
      keyboardOffset[0] += up[0] * panStep
      keyboardOffset[1] += up[1] * panStep
      keyboardOffset[2] += up[2] * panStep
    }
    if (pressedKeys.has('s')) {
      keyboardOffset[0] -= up[0] * panStep
      keyboardOffset[1] -= up[1] * panStep
      keyboardOffset[2] -= up[2] * panStep
    }
    if (pressedKeys.has('a')) {
      keyboardOffset[0] -= right[0] * panStep
      keyboardOffset[1] -= right[1] * panStep
      keyboardOffset[2] -= right[2] * panStep
    }
    if (pressedKeys.has('d')) {
      keyboardOffset[0] += right[0] * panStep
      keyboardOffset[1] += right[1] * panStep
      keyboardOffset[2] += right[2] * panStep
    }
    if (pressedKeys.has('q')) dollyCamera(-dollyStep)
    if (pressedKeys.has('e')) dollyCamera(dollyStep)
    if (!isBevMode()) {
      if (pressedKeys.has('arrowleft')) applyOrbitRotation(-rotateStep, 0)
      if (pressedKeys.has('arrowright')) applyOrbitRotation(rotateStep, 0)
      if (pressedKeys.has('arrowup')) applyOrbitRotation(0, -rotateStep)
      if (pressedKeys.has('arrowdown')) applyOrbitRotation(0, rotateStep)
    }
  }

  function blocksViewerNavigation(target) {
    if (!target) return false
    const tag = target.tagName
    return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
  }

  function releaseViewerFocus() {
    const active = document.activeElement
    if (active instanceof HTMLElement && active !== canvas) {
      active.blur()
    }
    canvas.focus({ preventScroll: true })
  }

  on(document, 'dragover', (event) => event.preventDefault())
  on(document, 'drop', (event) => {
    event.preventDefault()
    if (event.dataTransfer?.files?.length) loadFiles(event.dataTransfer.files)
  })

  on(canvas, 'pointerdown', (event) => {
    releaseViewerFocus()
    isDragging = true
    dragButton = event.button
    lastPointer = [event.clientX, event.clientY]
    canvas.setPointerCapture(event.pointerId)
  })

  on(canvas, 'pointermove', (event) => {
    if (!isDragging) return

    const isPanDrag = dragButton === 2 || event.shiftKey
    const moves = typeof event.getCoalescedEvents === 'function'
      ? event.getCoalescedEvents()
      : [event]

    for (const moveEvent of moves) {
      const dx = moveEvent.clientX - lastPointer[0]
      const dy = moveEvent.clientY - lastPointer[1]
      lastPointer = [moveEvent.clientX, moveEvent.clientY]
      if (!dx && !dy) continue

      if (isBevMode() || isPanDrag) {
        pendingPan.dx += dx
        pendingPan.dy += dy
      } else {
        applyPointerRotateDrag(dx, dy)
      }
    }
    scheduleRender()
  })

  on(canvas, 'pointerup', (event) => {
    isDragging = false
    canvas.releasePointerCapture(event.pointerId)
    scheduleRender()
  })

  on(canvas, 'contextmenu', (event) => event.preventDefault())

  on(canvas, 'wheel', (event) => {
    event.preventDefault()
    if (!pointCount) return
    pendingWheelDelta += event.deltaY
    scheduleRender()
  }, { passive: false })

  on(window, 'keydown', (event) => {
    const key = event.key.toLowerCase()
    const navigationKeys = new Set(['w', 'a', 's', 'd', 'q', 'e', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'])
    if (!navigationKeys.has(key)) return
    if (blocksViewerNavigation(event.target)) return
    if (event.target !== canvas) {
      releaseViewerFocus()
    }
    event.preventDefault()
    pressedKeys.add(key)
    scheduleRender()
  })

  on(window, 'keyup', (event) => {
    pressedKeys.delete(event.key.toLowerCase())
  })

  on(window, 'resize', scheduleResizeRender)

  if ('ResizeObserver' in window) {
    const resizeObserver = new ResizeObserver(scheduleResizeRender)
    resizeObserver.observe(stage)
    if (frame) resizeObserver.observe(frame)
    resizeObserver.observe(canvas)
    cleanups.push(() => resizeObserver.disconnect())
  }

  callbacks.onResetAvailable?.(false)
  callbacks.onOrientationLabels?.(null)
  callbacks.onStatus?.('No point cloud loaded.')
  setFileLabel('', '')
  loadedSourceStem = ''
  render()

  return {
    loadFiles,
    clearFiles,
    setViewMode,
    resetZoom,
    resetPosition,
    setColorMode(mode) {
      colorMode = mode
      render()
    },
    setPointSize(value) {
      pointSizeValue = Number(value)
      render()
    },
    savePng() {
      render()
      const w = canvas.width
      const h = canvas.height
      const pixels = new Uint8Array(w * h * 4)
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
      const copy = document.createElement('canvas')
      copy.width = w
      copy.height = h
      const ctx = copy.getContext('2d')
      const imageData = ctx.createImageData(w, h)
      const rowBytes = w * 4
      for (let y = 0; y < h; y++) {
        imageData.data.set(
          pixels.subarray((h - 1 - y) * rowBytes, (h - y) * rowBytes),
          y * rowBytes,
        )
      }
      ctx.putImageData(imageData, 0, 0)
      drawTopLeftLabel(ctx, loadedFileLabelFull, w, h)
      const link = document.createElement('a')
      link.href = copy.toDataURL('image/png')
      link.download = buildPngDownloadName(loadedSourceStem, viewMode)
      link.click()
    },
    getViewMode: () => viewMode,
    canResetView: () => homeOrbitCamera !== null,
    destroy() {
      clearHomes()
      if (renderAnimation) cancelAnimationFrame(renderAnimation)
      if (resizeAnimation) cancelAnimationFrame(resizeAnimation)
      for (const fn of cleanups) fn()
      cleanups.length = 0
    },
  }
}

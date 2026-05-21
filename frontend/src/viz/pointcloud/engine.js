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
 * }} callbacks
 */
export function createPointcloudEngine(canvas, stage, frame, callbacks = {}) {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: true })
  if (!gl) {
    callbacks.onStatus?.('WebGL is not available in this browser.')
    throw new Error('WebGL unavailable')
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
  const locations = {
    position: gl.getAttribLocation(program, 'aPosition'),
    intensity: gl.getAttribLocation(program, 'aIntensity'),
    viewProjection: gl.getUniformLocation(program, 'uViewProjection'),
    pointSize: gl.getUniformLocation(program, 'uPointSize'),
    colorMode: gl.getUniformLocation(program, 'uColorMode'),
  }

  const cameraFov = Math.PI / 4
  const DEFAULT_YAW = -0.65
  const DEFAULT_PITCH = 0.92
  const CAMERA_SPEED = {
    move: 0.008,
    pan: 3,
    vertical: 1.5,
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
  let yaw = DEFAULT_YAW
  let pitch = DEFAULT_PITCH
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
  const minPitch = -1.35
  const maxPitch = 1.35
  let colorMode = 'height'
  let pointSizeValue = 2.5
  const pressedKeys = new Set()
  const MAX_RENDER_FPS = 120
  const MIN_RENDER_INTERVAL = 1000 / MAX_RENDER_FPS
  let renderAnimation = 0
  let lastRenderTime = 0
  let resizeAnimation = 0
  let isDragging = false
  let dragButton = 0
  let lastPointer = [0, 0]
  const pendingRotate = { dx: 0, dy: 0 }
  const pendingPan = { dx: 0, dy: 0 }
  let pendingWheelDelta = 0

  function mat4Multiply(a, b) {
    const out = new Array(16).fill(0)
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

  function orbitReferenceUp() {
    return normalize([-Math.sin(yaw), Math.cos(yaw), 0])
  }

  function pickLookAtUp(direction) {
    if (Math.abs(direction[2]) < 0.85) {
      return [0, 0, 1]
    }
    return orbitReferenceUp()
  }

  function viewMatrixFromBasis(x, y, z, eye) {
    return [
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
    ]
  }

  function lookAt(eye, target, up) {
    const z = normalize(subtract(eye, target))
    let x = cross(up, z)
    if (Math.hypot(x[0], x[1], x[2]) < 1e-6) {
      x = cross(pickLookAtUp(z), z)
    }
    x = normalize(x)
    const y = cross(z, x)
    return viewMatrixFromBasis(x, y, z, eye)
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
    return {
      yaw,
      pitch,
      resetDistance,
      distance,
      panOffset: [...panOffset],
      keyboardOffset: [...keyboardOffset],
    }
  }

  function applySnapshot(snapshot) {
    yaw = snapshot.yaw
    pitch = snapshot.pitch
    resetDistance = snapshot.resetDistance
    distance = snapshot.distance
    panOffset = [...snapshot.panOffset]
    keyboardOffset = [...snapshot.keyboardOffset]
  }

  function cloneSnapshot(snapshot) {
    return {
      yaw: snapshot.yaw,
      pitch: snapshot.pitch,
      resetDistance: snapshot.resetDistance,
      distance: snapshot.distance,
      panOffset: [...snapshot.panOffset],
      keyboardOffset: [...snapshot.keyboardOffset],
    }
  }

  function applyInitialOrbitCamera() {
    yaw = DEFAULT_YAW
    pitch = DEFAULT_PITCH
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
    yaw = home.yaw
    pitch = home.pitch
    panOffset = [...home.panOffset]
    keyboardOffset = [...home.keyboardOffset]
    saveActiveModeState()
    render()
    return true
  }

  function cameraVectors() {
    const cp = Math.cos(pitch)
    const direction = [
      Math.sin(yaw) * cp,
      Math.cos(yaw) * cp,
      Math.sin(pitch),
    ]
    const right = normalize([Math.cos(yaw), -Math.sin(yaw), 0])
    const up = normalize(cross(right, direction))
    return { direction, right, up }
  }

  function currentTarget() {
    return [
      center[0] + panOffset[0] + keyboardOffset[0],
      center[1] + panOffset[1] + keyboardOffset[1],
      center[2] + panOffset[2] + keyboardOffset[2],
    ]
  }

  function setTarget(target) {
    panOffset = [
      target[0] - center[0] - keyboardOffset[0],
      target[1] - center[1] - keyboardOffset[1],
      target[2] - center[2] - keyboardOffset[2],
    ]
  }

  function clampPitch(value) {
    return Math.max(minPitch, Math.min(maxPitch, value))
  }

  function clampVerticalOffset(value) {
    const limit = Math.max(10, radius * 0.5)
    return Math.max(-limit, Math.min(limit, value))
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
      vertical: step * CAMERA_SPEED.vertical,
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

  function rotateCameraInPlace(updateRotation) {
    const eye = [
      currentTarget()[0] + cameraVectors().direction[0] * distance,
      currentTarget()[1] + cameraVectors().direction[1] * distance,
      currentTarget()[2] + cameraVectors().direction[2] * distance,
    ]
    updateRotation()
    const { direction } = cameraVectors()
    setTarget([
      eye[0] - direction[0] * distance,
      eye[1] - direction[1] * distance,
      eye[2] - direction[2] * distance,
    ])
  }

  function hasPendingCameraInput() {
    return pendingRotate.dx !== 0
      || pendingRotate.dy !== 0
      || pendingPan.dx !== 0
      || pendingPan.dy !== 0
      || pendingWheelDelta !== 0
      || pressedKeys.size > 0
  }

  function applyPendingPanDrag(dx, dy) {
    if (!dx && !dy) return
    const scale = panDragScale()
    if (isBevMode()) {
      const { right, up } = getBevPanAxes()
      applyPanDelta(
        (-right[0] * dx + up[0] * dy) * scale,
        (-right[1] * dx + up[1] * dy) * scale,
        (-right[2] * dx + up[2] * dy) * scale,
      )
      return
    }
    const { right, up } = cameraVectors()
    applyPanDelta(
      (-right[0] * dx + up[0] * dy) * scale,
      (-right[1] * dx + up[1] * dy) * scale,
      (-right[2] * dx + up[2] * dy) * scale,
    )
  }

  function applyPendingRotateDrag(dx, dy) {
    if (!dx && !dy) return
    const rotateScale = pointerRotateScale()
    rotateCameraInPlace(() => {
      yaw += dx * rotateScale
      pitch = clampPitch(pitch + dy * rotateScale)
    })
  }

  function applyPendingWheelDelta() {
    if (!pendingWheelDelta || !pointCount) return
    const wheelK = isBevMode() ? BEV_CONFIG.wheelSensitivity : CAMERA_SPEED.wheel
    dollyCamera(distance * (Math.exp(pendingWheelDelta * wheelK) - 1))
    pendingWheelDelta = 0
  }

  function applyPendingCameraInput() {
    if (pendingPan.dx || pendingPan.dy) {
      applyPendingPanDrag(pendingPan.dx, pendingPan.dy)
      pendingPan.dx = 0
      pendingPan.dy = 0
    }
    if (pendingRotate.dx || pendingRotate.dy) {
      applyPendingRotateDrag(pendingRotate.dx, pendingRotate.dy)
      pendingRotate.dx = 0
      pendingRotate.dy = 0
    }
    applyPendingWheelDelta()
    if (pressedKeys.size) moveCameraFromKeysStep()
  }

  function render() {
    if (!resizeCanvas()) return

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
      const { direction } = cameraVectors()
      const target = currentTarget()
      const eye = [
        target[0] + direction[0] * distance,
        target[1] + direction[1] * distance,
        target[2] + direction[2] * distance,
      ]
      view = lookAt(eye, target, pickLookAtUp(direction))
    }
    const viewProjection = mat4Multiply(projection, view)

    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.enableVertexAttribArray(locations.position)
    gl.vertexAttribPointer(locations.position, 3, gl.FLOAT, false, 16, 0)
    gl.enableVertexAttribArray(locations.intensity)
    gl.vertexAttribPointer(locations.intensity, 1, gl.FLOAT, false, 16, 12)
    gl.uniformMatrix4fv(locations.viewProjection, false, new Float32Array(viewProjection))
    gl.uniform1f(locations.pointSize, pointSizeValue)
    gl.uniform1i(locations.colorMode, COLOR_MODE_INDEX[colorMode] ?? 0)
    gl.drawArrays(gl.POINTS, 0, pointCount)

    const labelLayout = computeFrontBackLabelLayout(
      viewProjection,
      currentTarget(),
      radius,
      canvas.clientWidth,
      canvas.clientHeight,
    )
    callbacks.onOrientationLabels?.(labelLayout)
  }

  function renderLoop(now) {
    renderAnimation = 0
    if (!hasPendingCameraInput()) return

    const elapsed = now - lastRenderTime
    if (lastRenderTime > 0 && elapsed < MIN_RENDER_INTERVAL) {
      scheduleRender()
      return
    }

    applyPendingCameraInput()
    render()
    lastRenderTime = now

    if (hasPendingCameraInput()) scheduleRender()
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

  async function loadFiles(files) {
    try {
      const fileList = Array.from(files)
      if (!fileList.length) return

      callbacks.onStatus?.(`Loading ${fileList.length} file(s)...`)
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
      callbacks.onDropHintHidden?.(true)
      captureHomesOnLoad()
      render()
      const names = fileList.length === 1 ? fileList[0].name : `${fileList.length} files`
      callbacks.onStatus?.(`${names} - ${pointCount.toLocaleString()} points`)
    } catch (error) {
      callbacks.onStatus?.(error.message)
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

  function moveCameraFromKeysStep() {
    if (!pressedKeys.size) return

    const bev = isBevMode()
    const { pan, vertical, dolly, rotate } = getCameraStepSizes()
    const panAxes = bev ? getBevPanAxes() : null
    const orbitRight = bev ? null : cameraVectors().right
    const groundRight = bev
      ? normalize([panAxes.right[0], panAxes.right[1], 0])
      : normalize([orbitRight[0], orbitRight[1], 0])

    if (pressedKeys.has('w')) dollyCamera(-dolly)
    if (pressedKeys.has('s')) dollyCamera(dolly)
    if (pressedKeys.has('a')) {
      keyboardOffset[0] += groundRight[0] * pan
      keyboardOffset[1] += groundRight[1] * pan
    }
    if (pressedKeys.has('d')) {
      keyboardOffset[0] -= groundRight[0] * pan
      keyboardOffset[1] -= groundRight[1] * pan
    }
    if (pressedKeys.has('q')) {
      keyboardOffset[2] = clampVerticalOffset(keyboardOffset[2] + vertical)
    }
    if (pressedKeys.has('e')) {
      keyboardOffset[2] = clampVerticalOffset(keyboardOffset[2] - vertical)
    }
    if (!bev) {
      if (pressedKeys.has('arrowleft')) {
        rotateCameraInPlace(() => { yaw -= rotate })
      }
      if (pressedKeys.has('arrowright')) {
        rotateCameraInPlace(() => { yaw += rotate })
      }
      if (pressedKeys.has('arrowup')) {
        rotateCameraInPlace(() => { pitch = clampPitch(pitch - rotate) })
      }
      if (pressedKeys.has('arrowdown')) {
        rotateCameraInPlace(() => { pitch = clampPitch(pitch + rotate) })
      }
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
    const dx = event.clientX - lastPointer[0]
    const dy = event.clientY - lastPointer[1]
    lastPointer = [event.clientX, event.clientY]
    if (!dx && !dy) return

    const isPanDrag = dragButton === 2 || event.shiftKey
    if (isBevMode()) {
      if (!isPanDrag) return
      pendingPan.dx += dx
      pendingPan.dy += dy
    } else if (isPanDrag) {
      pendingPan.dx += dx
      pendingPan.dy += dy
    } else {
      pendingRotate.dx += dx
      pendingRotate.dy += dy
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
  render()

  return {
    loadFiles,
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
      const link = document.createElement('a')
      link.href = canvas.toDataURL('image/png')
      link.download = `nuscenes-pointcloud-${new Date().toISOString().replace(/[:.]/g, '-')}.png`
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

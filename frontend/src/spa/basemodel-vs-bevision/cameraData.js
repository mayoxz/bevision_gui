import { resolveDataUrl } from '../../config/dataUrl.js'

const DATA_ROOT = 'basemodel-vs-bevision'

/** Vehicle ring order (clockwise from front). */
const SCENE_CAMERAS = [
  { id: '01', file: 'camera_01_front.jpg', label: 'Front' },
  { id: '02', file: 'camera_02_front_right.jpg', label: 'Front Right' },
  { id: '03', file: 'camera_03_back_right.jpg', label: 'Back Right' },
  { id: '04', file: 'camera_04_back.jpg', label: 'Back' },
  { id: '05', file: 'camera_05_back_left.jpg', label: 'Back Left' },
  { id: '06', file: 'camera_06_front_left.jpg', label: 'Front Left' },
]

const CAMERA_WINDOW_SIZE = 3
/** Strip height = center image height × this ratio. */
export const CAMERA_STRIP_HEIGHT_RATIO = 1.3
/** Index in SCENE_CAMERAS; 0 = Front. */
export const DEFAULT_CAMERA_CENTER_INDEX = 0

/** User-space height below center image (0.3) as a fraction of strip height (1.3). */
export const CAMERA_CENTER_BOTTOM_BAND_RATIO = 0.3 / CAMERA_STRIP_HEIGHT_RATIO

/** Side camera frame in cell coords; x ∈ [0,1], y ∈ [0, strip height ratio]. */
const SIDE_CAMERA_FRAME = [
  [0, 0],
  [0, 1],
  [1, CAMERA_STRIP_HEIGHT_RATIO],
  [1, 0.3],
]

const SIDE_CAMERA_SHEAR = SIDE_CAMERA_FRAME[3][1] - SIDE_CAMERA_FRAME[0][1]

function frameToSvgClipPoints(points, yMax = CAMERA_STRIP_HEIGHT_RATIO) {
  return points.map(([x, y]) => `${x},${yMax - y}`).join(' ')
}

function sideCameraImageTransform(mirror) {
  const shear = SIDE_CAMERA_SHEAR
  return mirror
    ? `matrix(1, ${shear}, 0, 1, 0, 0)`
    : `matrix(1, ${-shear}, 0, 1, 0, ${shear})`
}

const RIGHT_CAMERA_FRAME = SIDE_CAMERA_FRAME.map(([x, y]) => [1 - x, y])

export const SIDE_CAMERA_WARP = {
  left: {
    clipPoints: frameToSvgClipPoints(SIDE_CAMERA_FRAME),
    imageTransform: sideCameraImageTransform(false),
  },
  right: {
    clipPoints: frameToSvgClipPoints(RIGHT_CAMERA_FRAME),
    imageTransform: sideCameraImageTransform(true),
  },
}

export function visibleCameraIndices(centerIndex, count = SCENE_CAMERAS.length, windowSize = CAMERA_WINDOW_SIZE) {
  const leftOffset = Math.floor(windowSize / 2)
  return Array.from(
    { length: windowSize },
    (_, slot) => (centerIndex - leftOffset + slot + count) % count,
  )
}

export function stepCameraIndex(centerIndex, delta, count = SCENE_CAMERAS.length) {
  return (centerIndex + delta + count) % count
}

export function buildSceneCameraImages(sceneId, model) {
  const root = `${DATA_ROOT}/scenes/${sceneId}/${model}`
  return SCENE_CAMERAS.map((camera) => ({
    ...camera,
    url: resolveDataUrl(`${root}/${camera.file}`),
  }))
}

const preloadedUrls = new Set()

export function preloadCameraImages(cameras) {
  if (!cameras?.length) return
  for (const camera of cameras) {
    if (preloadedUrls.has(camera.url)) continue
    preloadedUrls.add(camera.url)
    const img = new Image()
    img.decoding = 'async'
    img.src = camera.url
  }
}

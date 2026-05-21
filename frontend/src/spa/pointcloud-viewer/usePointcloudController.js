import { useCallback, useEffect, useRef, useState } from 'react'
import { createPointcloudEngine } from '../../viz/pointcloud/engine.js'

const ORIENTATION_LABEL_EPS = 0.005

function orientationLabelsEqual(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  return Math.abs(a.front.x - b.front.x) < ORIENTATION_LABEL_EPS
    && Math.abs(a.front.y - b.front.y) < ORIENTATION_LABEL_EPS
    && Math.abs(a.back.x - b.back.x) < ORIENTATION_LABEL_EPS
    && Math.abs(a.back.y - b.back.y) < ORIENTATION_LABEL_EPS
}

function cloneOrientationLabels(layout) {
  return {
    front: { x: layout.front.x, y: layout.front.y },
    back: { x: layout.back.x, y: layout.back.y },
  }
}

export function usePointcloudController(active) {
  const canvasRef = useRef(null)
  const stageRef = useRef(null)
  const frameRef = useRef(null)
  const engineRef = useRef(null)
  const fileInputRef = useRef(null)

  const [status, setStatus] = useState('No point cloud loaded.')
  const [canResetView, setCanResetView] = useState(false)
  const [viewMode, setViewMode] = useState('perspective')
  const [zoomLabel, setZoomLabel] = useState('1.0x')
  const [pointSize, setPointSize] = useState(2.5)
  const [colorMode, setColorMode] = useState('height')
  const [dropHintHidden, setDropHintHidden] = useState(false)
  const [orientationLabels, setOrientationLabels] = useState(null)
  const [perfLabel, setPerfLabel] = useState('')

  useEffect(() => {
    if (!active) return undefined

    const canvas = canvasRef.current
    const stage = stageRef.current
    const frame = frameRef.current
    if (!canvas || !stage || !frame) return undefined

    let engine
    let lastZoomLabel = ''
    let lastOrientationLabels = null
    let lastPerfLabel = ''
    let fpsIdleTimer = 0

    try {
      engine = createPointcloudEngine(canvas, stage, frame, {
        onStatus: setStatus,
        onZoom: (factor) => {
          const next = `${factor.toFixed(1)}x`
          if (next === lastZoomLabel) return
          lastZoomLabel = next
          setZoomLabel(next)
        },
        onDropHintHidden: setDropHintHidden,
        onViewModeChange: setViewMode,
        onResetAvailable: setCanResetView,
        onOrientationLabels: (layout) => {
          if (orientationLabelsEqual(lastOrientationLabels, layout)) return
          lastOrientationLabels = layout ? cloneOrientationLabels(layout) : null
          setOrientationLabels(lastOrientationLabels)
        },
        onFps: (fps, count) => {
          const countLabel = count >= 1_000_000
            ? `${(count / 1_000_000).toFixed(1)}M pts`
            : count >= 1000
              ? `${Math.round(count / 1000)}k pts`
              : count > 0
                ? `${count} pts`
                : ''
          const next = count > 0 ? `${fps} FPS · ${countLabel}` : ''
          if (next !== lastPerfLabel) {
            lastPerfLabel = next
            setPerfLabel(next)
          }
          if (fpsIdleTimer) window.clearTimeout(fpsIdleTimer)
          fpsIdleTimer = window.setTimeout(() => {
            lastPerfLabel = ''
            setPerfLabel('')
          }, 1500)
        },
      })
      engineRef.current = engine
    } catch {
      return undefined
    }

    return () => {
      if (fpsIdleTimer) window.clearTimeout(fpsIdleTimer)
      engine.destroy()
      engineRef.current = null
      setCanResetView(false)
      setViewMode('perspective')
      setOrientationLabels(null)
      setPerfLabel('')
    }
  }, [active])

  const onFileChange = useCallback((event) => {
    const files = event.target.files
    if (files?.length) engineRef.current?.loadFiles(files)
    event.target.value = ''
  }, [])

  const onColorModeChange = useCallback((event) => {
    const mode = event.target.value
    setColorMode(mode)
    engineRef.current?.setColorMode(mode)
  }, [])

  const onPointSizeChange = useCallback((event) => {
    const value = Number(event.target.value)
    setPointSize(value)
    engineRef.current?.setPointSize(value)
  }, [])

  const onViewModeSelect = useCallback((mode) => {
    engineRef.current?.setViewMode(mode)
  }, [])

  const onResetZoom = useCallback(() => {
    engineRef.current?.resetZoom()
  }, [])

  const onResetPosition = useCallback(() => {
    engineRef.current?.resetPosition()
  }, [])

  const onSavePng = useCallback(() => {
    engineRef.current?.savePng()
  }, [])

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  return {
    canvasRef,
    stageRef,
    fileInputRef,
    viewer: {
      dropHintHidden,
      viewMode,
      orientationLabels,
      perfLabel,
      canvasRef,
      stageRef,
      frameRef,
    },
    controls: {
      fileInputRef,
      status,
      zoomLabel,
      pointSize,
      colorMode,
      viewMode,
      canResetView,
      onFileChange,
      onColorModeChange,
      onPointSizeChange,
      onViewModeSelect,
      onResetZoom,
      onResetPosition,
      onSavePng,
      openFilePicker,
    },
  }
}

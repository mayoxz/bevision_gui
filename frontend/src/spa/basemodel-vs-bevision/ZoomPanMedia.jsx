import { useCallback, useEffect, useRef, useState } from 'react'

const MIN_SCALE = 1
const MAX_SCALE = 8
const ZOOM_FACTOR = 1.12

function coverSize(naturalWidth, naturalHeight, maxWidth, maxHeight) {
  if (naturalWidth < 1 || naturalHeight < 1 || maxWidth < 1 || maxHeight < 1) {
    return { width: 0, height: 0, x: 0, y: 0 }
  }
  const scale = Math.max(maxWidth / naturalWidth, maxHeight / naturalHeight)
  const width = naturalWidth * scale
  const height = naturalHeight * scale
  return {
    width,
    height,
    x: (maxWidth - width) / 2,
    y: (maxHeight - height) / 2,
  }
}

function clampAxis(value, min, max) {
  if (min > max) return (min + max) / 2
  return Math.min(max, Math.max(min, value))
}

/** Keep pan inside bounds; at 1x lock pan unless cover crop overflows. */
function constrainView(next, fit, viewportWidth, viewportHeight) {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next.scale))
  const scaledW = fit.width * scale
  const scaledH = fit.height * scale
  const minPanX = viewportWidth - fit.x - scaledW
  const maxPanX = -fit.x
  const minPanY = viewportHeight - fit.y - scaledH
  const maxPanY = -fit.y
  const canPan = minPanX < maxPanX - 0.5 || minPanY < maxPanY - 0.5

  if (scale <= MIN_SCALE && !canPan) {
    return { scale: MIN_SCALE, panX: 0, panY: 0 }
  }

  return {
    scale,
    panX: clampAxis(next.panX, minPanX, maxPanX),
    panY: clampAxis(next.panY, minPanY, maxPanY),
  }
}

function isPannable(view, fit, viewportWidth, viewportHeight) {
  const scaledW = fit.width * view.scale
  const scaledH = fit.height * view.scale
  return view.scale > MIN_SCALE
    || scaledW > viewportWidth + 0.5
    || scaledH > viewportHeight + 0.5
}

export default function ZoomPanMedia({
  label,
  src,
  alt,
  view,
  onViewChange,
  onResetView,
}) {
  const viewportRef = useRef(null)
  const imgRef = useRef(null)
  const dragRef = useRef(null)
  const fitRef = useRef({ width: 0, height: 0, x: 0, y: 0 })
  const viewRef = useRef(view)
  const [fit, setFit] = useState({ width: 0, height: 0, x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)

  viewRef.current = view

  const commitView = useCallback((updater) => {
    const viewport = viewportRef.current
    if (!viewport) return
    onViewChange((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      return constrainView(next, fitRef.current, viewport.clientWidth, viewport.clientHeight)
    })
  }, [onViewChange])

  useEffect(() => {
    if (viewRef.current.scale > MIN_SCALE) {
      commitView((prev) => prev)
    }
  }, [fit.width, fit.height, fit.x, fit.y, commitView])

  const syncFit = useCallback(() => {
    const viewport = viewportRef.current
    const img = imgRef.current
    if (!viewport || !img || img.naturalWidth < 1) return
    const nextFit = coverSize(
      img.naturalWidth,
      img.naturalHeight,
      viewport.clientWidth,
      viewport.clientHeight,
    )
    fitRef.current = nextFit
    setFit(nextFit)
  }, [])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const ro = new ResizeObserver(() => {
      syncFit()
      onResetView()
    })
    ro.observe(viewport)
    return () => ro.disconnect()
  }, [syncFit, onResetView])

  const handleWheel = useCallback((event) => {
    event.preventDefault()
    event.stopPropagation()

    const viewport = viewportRef.current
    if (!viewport) return

    const rect = viewport.getBoundingClientRect()
    const mx = event.clientX - rect.left
    const my = event.clientY - rect.top
    const factor = event.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR

    commitView((prev) => {
      const { x, y, width, height } = fitRef.current
      const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.scale * factor))
      if (nextScale === prev.scale) return prev

      const worldX = (mx - x - prev.panX) / prev.scale
      const worldY = (my - y - prev.panY) / prev.scale
      const u = width > 0 ? worldX / width : 0
      const v = height > 0 ? worldY / height : 0

      return {
        scale: nextScale,
        panX: mx - x - u * width * nextScale,
        panY: my - y - v * height * nextScale,
      }
    })
  }, [commitView])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    viewport.addEventListener('wheel', handleWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  const handlePointerDown = useCallback((event) => {
    if (event.button !== 0) return
    const viewport = viewportRef.current
    if (!viewport) return
    const current = viewRef.current
    const fit = fitRef.current
    if (!isPannable(current, fit, viewport.clientWidth, viewport.clientHeight)) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setIsDragging(true)
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      panX: current.panX,
      panY: current.panY,
    }
  }, [])

  const handlePointerMove = useCallback((event) => {
    if (!dragRef.current) return
    event.preventDefault()
    const drag = dragRef.current
    commitView((prev) => ({
      ...prev,
      panX: drag.panX + event.clientX - drag.startX,
      panY: drag.panY + event.clientY - drag.startY,
    }))
  }, [commitView])

  const endDrag = useCallback((event) => {
    if (!dragRef.current) return
    dragRef.current = null
    setIsDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  const handleDoubleClick = useCallback((event) => {
    event.preventDefault()
    event.stopPropagation()
    onResetView()
  }, [onResetView])

  const tx = fit.x + view.panX
  const ty = fit.y + view.panY

  const viewport = viewportRef.current
  const canPan = viewport
    ? isPannable(view, fit, viewport.clientWidth, viewport.clientHeight)
    : false

  return (
    <div
      ref={viewportRef}
      className={`bm-bev-compare__camera-lightbox-media${canPan ? ' bm-bev-compare__camera-lightbox-media--pannable' : ''}${isDragging ? ' bm-bev-compare__camera-lightbox-media--dragging' : ''}`}
      style={{ touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={handleDoubleClick}
    >
      <span className="bm-bev-compare__camera-lightbox-badge">{label}</span>
      <div
        className="bm-bev-compare__camera-lightbox-stage"
        style={{
          width: `${fit.width}px`,
          height: `${fit.height}px`,
          transform: `translate(${tx}px, ${ty}px) scale(${view.scale})`,
        }}
      >
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          draggable={false}
          onLoad={syncFit}
        />
      </div>
    </div>
  )
}

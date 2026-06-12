import { useEffect, useState } from 'react'
import CameraNavArrow from './CameraNavArrow.jsx'
import ZoomPanMedia from './ZoomPanMedia.jsx'

const INITIAL_ZOOM_VIEW = { panX: 0, panY: 0, scale: 1 }

export default function CameraLightbox({
  basemodelCamera,
  bevisionCamera,
  onClose,
  onStepCamera,
}) {
  const [view, setView] = useState(INITIAL_ZOOM_VIEW)

  useEffect(() => {
    setView(INITIAL_ZOOM_VIEW)
  }, [basemodelCamera.url, bevisionCamera.url])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        onStepCamera(-1)
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        onStepCamera(1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, onStepCamera])

  const label = basemodelCamera?.label ?? bevisionCamera?.label ?? 'Camera'
  const resetView = () => setView(INITIAL_ZOOM_VIEW)

  return (
    <div
      className="bm-bev-compare__camera-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`${label} camera comparison`}
      onClick={onClose}
    >
      <div
        className="bm-bev-compare__camera-lightbox-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="bm-bev-compare__camera-lightbox-head">
          <h2 className="bm-bev-compare__camera-lightbox-title">{label}</h2>
          <button
            type="button"
            className="bm-bev-compare__camera-lightbox-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="bm-bev-compare__camera-lightbox-body">
          <button
            type="button"
            className="bm-bev-compare__camera-lightbox-nav"
            aria-label="Previous camera"
            onClick={() => onStepCamera(-1)}
          >
            <CameraNavArrow direction="prev" />
          </button>
          <div className="bm-bev-compare__camera-lightbox-grid">
            <figure className="bm-bev-compare__camera-lightbox-item">
              <ZoomPanMedia
                label="Basemodel"
                src={basemodelCamera.url}
                alt={`Basemodel ${label}`}
                view={view}
                onViewChange={setView}
                onResetView={resetView}
              />
            </figure>
            <figure className="bm-bev-compare__camera-lightbox-item">
              <ZoomPanMedia
                label="BEVision"
                src={bevisionCamera.url}
                alt={`BEVision ${label}`}
                view={view}
                onViewChange={setView}
                onResetView={resetView}
              />
            </figure>
          </div>
          <button
            type="button"
            className="bm-bev-compare__camera-lightbox-nav"
            aria-label="Next camera"
            onClick={() => onStepCamera(1)}
          >
            <CameraNavArrow direction="next" />
          </button>
        </div>
      </div>
    </div>
  )
}

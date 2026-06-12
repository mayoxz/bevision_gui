import { useCallback, useEffect, useId, useRef } from 'react'
import CameraNavArrow from './CameraNavArrow.jsx'
import {
  CAMERA_CENTER_BOTTOM_BAND_RATIO,
  CAMERA_STRIP_HEIGHT_RATIO,
  SIDE_CAMERA_WARP,
  stepCameraIndex,
  visibleCameraIndices,
} from './cameraData.js'

function SideCameraWarp({ camera, clipId, side }) {
  const { clipPoints, imageTransform } = SIDE_CAMERA_WARP[side]

  return (
    <svg
      className="bm-bev-compare__camera-warp"
      viewBox={`0 0 1 ${CAMERA_STRIP_HEIGHT_RATIO}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clipId}>
          <polygon points={clipPoints} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <image
          href={camera.url}
          x="0"
          y="0"
          width="1"
          height="1"
          preserveAspectRatio="none"
          transform={imageTransform}
        />
      </g>
    </svg>
  )
}

export default function CameraCarousel({ cameras, centerIndex, onCenterChange, onCameraDoubleClick }) {
  const stripRef = useRef(null)
  const centerImgRef = useRef(null)
  const leftClipId = useId()
  const rightClipId = useId()
  const count = cameras?.length ?? 0

  const syncStripHeight = useCallback(() => {
    const img = centerImgRef.current
    const strip = stripRef.current
    if (!img || !strip || img.offsetHeight < 1) return
    strip.style.setProperty('--strip-height', `${img.offsetHeight * CAMERA_STRIP_HEIGHT_RATIO}px`)
  }, [])

  useEffect(() => {
    if (!count) return
    syncStripHeight()
    const img = centerImgRef.current
    if (!img) return

    const ro = new ResizeObserver(syncStripHeight)
    ro.observe(img)
    return () => ro.disconnect()
  }, [centerIndex, count, syncStripHeight])

  if (!count) return null

  const visible = visibleCameraIndices(centerIndex, count).map((index) => ({
    index,
    camera: cameras[index],
  }))

  return (
    <div className="bm-bev-compare__cameras" aria-label="Camera views">
      <div
        ref={stripRef}
        className="bm-bev-compare__cameras-strip"
        style={{ '--camera-bottom-band-ratio': CAMERA_CENTER_BOTTOM_BAND_RATIO }}
      >
        <button
          type="button"
          className="bm-bev-compare__cameras-nav bm-bev-compare__cameras-nav--prev"
          aria-label="Previous camera"
          onClick={() => onCenterChange(stepCameraIndex(centerIndex, -1, count))}
        >
          <CameraNavArrow direction="prev" />
        </button>
        {visible.map(({ index, camera }, slot) => {
          const side = slot === 0 ? 'left' : slot === 2 ? 'right' : null

          return (
            <figure
              key={slot}
              className={`bm-bev-compare__camera${
                side ? ' bm-bev-compare__camera--warp' : ' bm-bev-compare__camera--center'
              }`}
              aria-label={side ? camera.label : undefined}
              onDoubleClick={() => onCameraDoubleClick?.(index)}
            >
              {side ? (
                <SideCameraWarp
                  camera={camera}
                  clipId={side === 'left' ? leftClipId : rightClipId}
                  side={side}
                />
              ) : (
                <>
                  <img
                    ref={centerImgRef}
                    src={camera.url}
                    alt={camera.label}
                    loading="eager"
                    decoding="async"
                    draggable={false}
                    onLoad={syncStripHeight}
                  />
                  <div className="bm-bev-compare__camera-direction">{camera.label}</div>
                </>
              )}
            </figure>
          )
        })}
        <button
          type="button"
          className="bm-bev-compare__cameras-nav bm-bev-compare__cameras-nav--next"
          aria-label="Next camera"
          onClick={() => onCenterChange(stepCameraIndex(centerIndex, 1, count))}
        >
          <CameraNavArrow direction="next" />
        </button>
      </div>
    </div>
  )
}

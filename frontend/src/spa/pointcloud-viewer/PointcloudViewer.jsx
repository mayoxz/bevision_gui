import './pointcloud-viewer.css'

function AxisLabel({ label, position }) {
  if (!position) return null
  return (
    <span
      className="pc-viewer__axis-label"
      style={{
        left: `${position.x * 100}%`,
        top: `${position.y * 100}%`,
        transform: 'translate(-50%, -50%)',
      }}
      aria-hidden="true"
    >
      {label}
    </span>
  )
}

export default function PointcloudViewer({
  dropHintHidden,
  orientationLabels,
  canvasRef,
  stageRef,
  frameRef,
}) {
  return (
    <div className="pc-viewer" data-spa="pointcloud-viewer">
      <div ref={stageRef} className="pc-viewer__stage" id="pc-stage">
        <div ref={frameRef} className="pc-viewer__frame">
          <canvas
            ref={canvasRef}
            className="pc-viewer__canvas"
            id="pc-canvas"
            tabIndex={-1}
            aria-label="Point cloud viewport"
          />
          {orientationLabels ? (
            <>
              <AxisLabel label="Front" position={orientationLabels.front} />
              <AxisLabel label="Back" position={orientationLabels.back} />
            </>
          ) : null}
          <div className={`pc-viewer__drop${dropHintHidden ? ' pc-viewer__drop--hidden' : ''}`} id="pc-drop-hint">
            Drop nuScenes .pcd.bin or RADAR .pcd files here, or choose them in the sidebar.
          </div>
        </div>
      </div>
    </div>
  )
}

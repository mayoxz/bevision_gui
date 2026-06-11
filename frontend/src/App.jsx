import { useState } from 'react'
import './layout/app-shell.css'
import AppSidebar from './layout/AppSidebar.jsx'
import { DEFAULT_VIEW, parseViewId } from './layout/navConfig.js'
import { SpaViewport } from './viz/SpaViewport.jsx'
import PointcloudViewerPage from './spa/pointcloud-viewer/index.jsx'
import { usePointcloudController } from './spa/pointcloud-viewer/usePointcloudController.js'

export default function App() {
  const [activeView, setActiveView] = useState(DEFAULT_VIEW)
  const isPointcloud = activeView === 'pointcloud'
  const isFullBleed = activeView === 'basemodel-vs-bevision'
  const { dataset, runKind } = parseViewId(activeView)
  const pointcloud = usePointcloudController(isPointcloud)

  return (
    <>
      <header className="app-header">
        <div className="app-header__inner">
          <span className="app-header__title">BEVision GUI</span>
        </div>
      </header>
      <div className="app-body">
        <AppSidebar
          activeView={activeView}
          onViewChange={setActiveView}
          pointcloudControls={isPointcloud ? pointcloud.controls : null}
        />
        <main className="app-main">
          <div
            id="viz-root"
            className={`app-workspace${isPointcloud ? ' app-workspace--pointcloud' : ''}${isFullBleed ? ' app-workspace--fullbleed' : ''}`}
            aria-label="시각화 영역"
          >
            {isPointcloud ? (
              <PointcloudViewerPage viewer={pointcloud.viewer} />
            ) : (
              <SpaViewport dataset={dataset} runKind={runKind} />
            )}
          </div>
        </main>
      </div>
    </>
  )
}

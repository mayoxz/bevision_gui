import './app-sidebar.css'
import { NAV_ITEMS } from './navConfig.js'

const VIEW_MODES = [
  { id: 'perspective', label: 'Persp.', title: 'Perspective view' },
  { id: 'ortho', label: 'Ortho.', title: 'Orthographic view' },
  { id: 'bev', label: 'Bird-Eye', title: 'Bird-Eye View' },
]

function ResetZoomIcon() {
  return (
    <svg
      className="app-sidebar__icon-svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg
      className="app-sidebar__icon-svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  )
}

function blurAfterClick(handler) {
  return (event) => {
    handler(event)
    event.currentTarget.blur()
  }
}

function PointcloudControls({ controls }) {
  if (!controls) return null

  const {
    fileInputRef,
    zoomLabel,
    pointSize,
    colorMode,
    viewMode,
    onFileChange,
    onColorModeChange,
    onPointSizeChange,
    onViewModeSelect,
    onResetZoom,
    onResetPosition,
    onSavePng,
    openFilePicker,
    onClearFiles,
    canResetView,
    examples,
    activeExampleId,
    loadingExampleId,
    onLoadExample,
  } = controls

  return (
    <section className="app-sidebar__controls" aria-label="Point cloud viewer controls">
      <h2 className="app-sidebar__heading">Viewer</h2>

      <input
        ref={fileInputRef}
        type="file"
        className="app-sidebar__file-input"
        multiple
        accept=".bin,.pcd,.pcd.bin,application/octet-stream"
        onChange={onFileChange}
      />
      <div className="app-sidebar__file-row">
        <button type="button" className="app-sidebar__btn" onClick={blurAfterClick(openFilePicker)}>
          Choose files
        </button>
        <button
          type="button"
          className="app-sidebar__icon-btn app-sidebar__icon-btn--danger"
          onClick={blurAfterClick(onClearFiles)}
          disabled={!canResetView}
          title={canResetView ? '불러온 파일 비우기' : '비울 파일이 없습니다'}
          aria-label="Clear loaded files"
        >
          <TrashIcon />
        </button>
      </div>

      <div className="app-sidebar__inline-field">
        <label className="app-sidebar__label" htmlFor="pc-color-mode">
          Color
        </label>
        <select
          id="pc-color-mode"
          className="app-sidebar__select app-sidebar__inline-control"
          value={colorMode}
          onChange={onColorModeChange}
        >
          <option value="height">Height</option>
          <option value="intensity">Intensity</option>
          <option value="distance">Distance</option>
        </select>
      </div>

      <div className="app-sidebar__inline-field">
        <label className="app-sidebar__label" htmlFor="pc-point-size">
          Point size
        </label>
        <div className="app-sidebar__range-row app-sidebar__inline-control">
          <input
            id="pc-point-size"
            className="app-sidebar__range"
            type="range"
            min="1"
            max="6"
            step="0.5"
            value={pointSize}
            onChange={onPointSizeChange}
          />
          <output className="app-sidebar__output" htmlFor="pc-point-size">
            {pointSize}
          </output>
        </div>
      </div>

      <div className="app-sidebar__inline-field">
        <span className="app-sidebar__label">Zoom</span>
        <div className="app-sidebar__zoom-row app-sidebar__inline-control">
          <output className="app-sidebar__output">{zoomLabel}</output>
          <button
            type="button"
            className="app-sidebar__icon-btn"
            onClick={blurAfterClick(onResetZoom)}
            title={canResetView ? '현재 모드의 초기 줌으로 복원' : '파일을 먼저 불러오세요'}
            aria-label="Reset zoom"
          >
            <ResetZoomIcon />
          </button>
        </div>
      </div>

      <p className="app-sidebar__heading">Mode</p>
      <div className="app-sidebar__mode-row" role="group" aria-label="View mode">
        {VIEW_MODES.map(({ id, label, title }) => (
          <button
            key={id}
            type="button"
            className={`app-sidebar__btn app-sidebar__mode-btn${viewMode === id ? ' app-sidebar__mode-btn--active' : ''}`}
            aria-pressed={viewMode === id}
            title={title}
            onClick={blurAfterClick(() => onViewModeSelect(id))}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="app-sidebar__btn-row">
        <button
          type="button"
          className="app-sidebar__btn"
          onClick={blurAfterClick(onResetPosition)}
          title={canResetView ? '현재 모드의 초기 위치·각도로 복원' : '파일을 먼저 불러오세요'}
        >
          Reset position
        </button>
        <button type="button" className="app-sidebar__btn" onClick={blurAfterClick(onSavePng)}>
          Save PNG
        </button>
      </div>

      {examples?.length ? (
        <>
          <p className="app-sidebar__heading">Examples</p>
          <div className="app-sidebar__mode-row" role="group" aria-label="Example data">
            {examples.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className={`app-sidebar__btn app-sidebar__mode-btn${activeExampleId === id ? ' app-sidebar__mode-btn--active' : ''}`}
                aria-pressed={activeExampleId === id}
                disabled={loadingExampleId !== '' && loadingExampleId !== id}
                onClick={blurAfterClick(() => onLoadExample(id))}
              >
                {loadingExampleId === id ? '…' : label}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </section>
  )
}

export default function AppSidebar({ activeView, onViewChange, pointcloudControls }) {
  const dashboardItems = NAV_ITEMS.filter((item) => item.section === 'dashboard')
  const toolItems = NAV_ITEMS.filter((item) => item.section === 'tools')
  const externalItems = NAV_ITEMS.filter((item) => item.section === 'external')

  return (
    <aside className="app-sidebar" aria-label="Navigation">
      <nav className="app-sidebar__nav">
        <p className="app-sidebar__heading">Dashboards</p>
        <ul className="app-sidebar__list">
          {dashboardItems.map(({ id, label }) => (
            <li key={id}>
              <button
                type="button"
                className={`app-sidebar__link${activeView === id ? ' app-sidebar__link--active' : ''}`}
                aria-current={activeView === id ? 'page' : undefined}
                onClick={() => onViewChange(id)}
              >
                {label}
              </button>
            </li>
          ))}
        </ul>

        <p className="app-sidebar__heading">Tools</p>
        <ul className="app-sidebar__list">
          {toolItems.map(({ id, label }) => (
            <li key={id}>
              <button
                type="button"
                className={`app-sidebar__link${activeView === id ? ' app-sidebar__link--active' : ''}`}
                aria-current={activeView === id ? 'page' : undefined}
                onClick={() => onViewChange(id)}
              >
                {label}
              </button>
            </li>
          ))}
        </ul>

        {externalItems.length > 0 ? (
          <>
            <p className="app-sidebar__heading">Links</p>
            <ul className="app-sidebar__list">
              {externalItems.map(({ id, label, href }) => (
                <li key={id}>
                  <a
                    className="app-sidebar__link app-sidebar__link--external"
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </nav>

      {activeView === 'pointcloud' ? <PointcloudControls controls={pointcloudControls} /> : null}
    </aside>
  )
}

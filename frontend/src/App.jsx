import { useState } from 'react'
import { SpaViewport } from './viz/SpaViewport.jsx'

export default function App() {
  const [dataset, setDataset] = useState('nus-mini')
  const [runKind, setRunKind] = useState('eval')
  const showRunKind = dataset === 'nus-mini'

  return (
    <>
      <header className="app-header">
        <div className="app-header__inner">
          <span className="app-header__title">BEVision GUI</span>
          <div className="app-header__banner">
            <div className="app-header__field">
              <span className="app-header__label">데이터셋</span>
              <select
                id="dataset-select"
                className="app-header__select"
                aria-label="데이터셋 선택"
                value={dataset}
                onChange={(e) => setDataset(e.target.value)}
              >
                <option value="nus-mini">NuScenes-mini</option>
              </select>
            </div>
            {showRunKind ? (
              <div className="app-header__field" id="run-kind-field">
                <span className="app-header__label">실행 결과</span>
                <select
                  id="run-kind-select"
                  className="app-header__select"
                  aria-label="eval 또는 smoke 선택"
                  value={runKind}
                  onChange={(e) => setRunKind(e.target.value)}
                >
                  <option value="eval">eval (평가)</option>
                  <option value="smoke">smoke (학습)</option>
                </select>
              </div>
            ) : null}
          </div>
        </div>
      </header>
      <main className="app-main">
        <div id="viz-root" className="app-workspace" aria-label="시각화 영역">
          <SpaViewport dataset={dataset} runKind={runKind} />
        </div>
      </main>
    </>
  )
}

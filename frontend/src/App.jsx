import { useState } from 'react'
import { SpaViewport } from './viz/SpaViewport.jsx'

export default function App() {
  const [dataset, setDataset] = useState('nus-mini')
  const [runKind, setRunKind] = useState('eval')

  const runKindOptions = {
    'nus-mini': [
      { value: 'eval', label: 'eval (평가)' },
      { value: 'smoke', label: 'smoke (학습)' },
    ],
    'nuscenes': [
      { value: 'eval', label: 'eval (평가)' },
    ],
  }
  const showRunKind = !!runKindOptions[dataset]

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
                onChange={(e) => {
                  const next = e.target.value
                  setDataset(next)
                  setRunKind((runKindOptions[next] ?? [])[0]?.value ?? 'eval')
                }}
              >
                <option value="nus-mini">NuScenes-mini</option>
                <option value="nuscenes">NuScenes (full)</option>
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
                  {(runKindOptions[dataset] ?? []).map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
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

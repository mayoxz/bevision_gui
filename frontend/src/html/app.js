function syncRunKindVisibility() {
  const datasetSelect = document.querySelector('#dataset-select')
  const runKindField = document.querySelector('#run-kind-field')
  if (!datasetSelect || !runKindField) return

  const show = datasetSelect.value === 'nus-mini'
  runKindField.hidden = !show
  runKindField.setAttribute('aria-hidden', show ? 'false' : 'true')
}

export function mountApp() {
  document.querySelector('#app').innerHTML = `
<header class="app-header">
  <div class="app-header__inner">
    <span class="app-header__title">BEVision GUI</span>
    <div class="app-header__banner">
      <div class="app-header__field">
        <span class="app-header__label">데이터셋</span>
        <select id="dataset-select" class="app-header__select" aria-label="데이터셋 선택">
          <option value="nus-mini" selected>NuScenes-mini</option>
        </select>
      </div>
      <div class="app-header__field" id="run-kind-field">
        <span class="app-header__label">실행 결과</span>
        <select id="run-kind-select" class="app-header__select" aria-label="eval 또는 smoke 선택">
          <option value="eval">eval (평가)</option>
          <option value="smoke">smoke (학습)</option>
        </select>
      </div>
    </div>
  </div>
</header>
<main class="app-main">
  <div id="viz-root" class="app-workspace" aria-label="시각화 영역"></div>
</main>
`

  document.querySelector('#dataset-select')?.addEventListener('change', syncRunKindVisibility)
  syncRunKindVisibility()
}

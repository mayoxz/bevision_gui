const loaders = {
  'nus-mini:eval': () => import('../spa/nuscenes-mini-eval/index.js'),
  'nus-mini:smoke': () => import('../spa/nuscenes-mini-smoke/index.js'),
}

let unmountSpa = () => {}

function showEmpty(root, text) {
  root.innerHTML = `<div class="spa-view spa-view--empty"><p class="spa-view__msg">${text}</p></div>`
}

async function mountSpaRoute(root) {
  unmountSpa()
  unmountSpa = () => {}

  const dataset = document.querySelector('#dataset-select')?.value
  const runKind = document.querySelector('#run-kind-select')?.value
  const load = dataset === 'nus-mini' ? loaders[`${dataset}:${runKind}`] : null

  if (!load) {
    showEmpty(
      root,
      dataset === 'nus-mini' ? '알 수 없는 실행 결과입니다.' : '지원하는 데이터셋이 아닙니다.',
    )
    return
  }

  const mod = await load()
  unmountSpa = mod.mount(root) || (() => {
    root.innerHTML = ''
  })
}

export function initSpaRouter() {
  const root = document.querySelector('#viz-root')
  if (!root) return

  const remount = () => {
    mountSpaRoute(root).catch((err) => {
      console.error(err)
      showEmpty(root, '로드에 실패했습니다.')
    })
  }

  document.querySelector('#dataset-select')?.addEventListener('change', remount)
  document.querySelector('#run-kind-select')?.addEventListener('change', remount)
  remount()
}

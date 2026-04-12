/**
 * NuScenes-mini · eval 전용 SPA 엔트리
 */

import { resolveDataUrl } from '../../config/dataUrl.js'

export function mount(container) {
  const appleSrc = resolveDataUrl('apple/apple.jpg')
  container.innerHTML = `
    <div class="spa-view" data-spa="nuscenes-mini-eval">
      <p class="spa-view__title">nuscenes-mini-eval</p>
      <p class="spa-view__msg">평가 메트릭 시각화 SPA (예시 렌더)</p>
      <p class="spa-view__msg spa-view__msg--sub">데이터 URL 테스트: dev는 <code>/data/…</code>, production은 R2</p>
      <img class="spa-view__test-img" src="${appleSrc}" alt="" width="160" height="160" />
    </div>
  `

  return () => {
    container.innerHTML = ''
  }
}

/**
 * NuScenes-mini · smoke 전용 SPA 엔트리
 */

export function mount(container) {
  container.innerHTML = `
    <div class="spa-view" data-spa="nuscenes-mini-smoke">
      <p class="spa-view__title">nuscenes-mini-smoke</p>
      <p class="spa-view__msg">학습 스칼라 시각화 SPA (예시 렌더)</p>
    </div>
  `

  return () => {
    container.innerHTML = ''
  }
}

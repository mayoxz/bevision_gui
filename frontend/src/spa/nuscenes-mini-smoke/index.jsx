/**
 * NuScenes-mini · smoke 전용 SPA 엔트리
 */

import SmokeDashboard from './SmokeDashboard.jsx'

export default function NuscenesMiniSmoke() {
  return (
    <div className="spa-view spa-view--smoke" data-spa="nuscenes-mini-smoke">
      <h1 className="spa-view__title">NuScenes-mini · smoke</h1>
      <p className="spa-view__msg">
        학습 스칼라는 <code className="spa-view__inline-code">public/data/nus-mini/smoke/</code> 의{' '}
        <code className="spa-view__inline-code">vis_data/scalars.json</code> (JSONL)을 로드합니다.
      </p>
      <SmokeDashboard />
    </div>
  )
}

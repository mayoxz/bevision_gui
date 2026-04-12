/**
 * NuScenes-mini · eval 전용 SPA 엔트리
 */

import EvalDashboard from './EvalDashboard.jsx'

export default function NuscenesMiniEval() {
  return (
    <div className="spa-view spa-view--eval" data-spa="nuscenes-mini-eval">
      <h1 className="spa-view__title">NuScenes-mini · eval</h1>
      <p className="spa-view__msg">평가 메트릭은 <code className="spa-view__inline-code">public/data/nus-mini/eval/</code> 기준으로 로드합니다.</p>
      <EvalDashboard />
    </div>
  )
}

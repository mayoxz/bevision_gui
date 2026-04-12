/**
 * NuScenes-mini · eval 전용 SPA 엔트리
 */

import { R2_DATA_BUCKET_NAME } from '../../config/dataUrl.js'
import EvalDashboard from './EvalDashboard.jsx'

export default function NuscenesMiniEval() {
  return (
    <div className="spa-view spa-view--eval" data-spa="nuscenes-mini-eval">
      <h1 className="spa-view__title">NuScenes-mini · eval</h1>
      <p className="spa-view__msg">
        평가 메트릭은 <code className="spa-view__inline-code">nus-mini/eval/</code> 상대 경로로 로드합니다.{' '}
        <code className="spa-view__inline-code">VITE_DATA_BASE_URL</code>이 비어 있으면 로컬 정적{' '}
        <code className="spa-view__inline-code">/data/</code>(개발 시 소스는{' '}
        <code className="spa-view__inline-code">public/data/</code>)를 쓰고, 설정 시에는 해당 베이스 URL 뒤에 같은
        상대 경로를 붙입니다. R2 등에서 가져올 때 버킷명 참고:{' '}
        <code className="spa-view__inline-code">{R2_DATA_BUCKET_NAME}</code>.
      </p>
      <EvalDashboard />
    </div>
  )
}

/**
 * NuScenes-mini · eval 전용 SPA 엔트리
 */

import { getDataSourceDisplayUrl } from '../../config/dataUrl.js'
import EvalDashboard from './EvalDashboard.jsx'

export default function NuscenesMiniEval() {
  return (
    <div className="spa-view spa-view--eval" data-spa="nuscenes-mini-eval">
      <h1 className="spa-view__title">NuScenes-mini · eval</h1>
      <p className="spa-view__msg">
        src ={' '}
        <code className="spa-view__inline-code">{getDataSourceDisplayUrl('nus-mini/eval')}</code>
      </p>
      <EvalDashboard />
    </div>
  )
}

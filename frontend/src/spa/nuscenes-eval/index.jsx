/**
 * NuScenes (full) · eval 전용 SPA 엔트리
 */

import { getDataSourceDisplayUrl } from '../../config/dataUrl.js'
import NuscenesEvalDashboard from './NuscenesEvalDashboard.jsx'

export default function NuscenesEval() {
  return (
    <div className="spa-view spa-view--eval" data-spa="nuscenes-eval">
      <h1 className="spa-view__title">NuScenes · eval</h1>
      <p className="spa-view__msg">
        src ={' '}
        <code className="spa-view__inline-code">{getDataSourceDisplayUrl('nuscenes')}</code>
      </p>
      <NuscenesEvalDashboard />
    </div>
  )
}

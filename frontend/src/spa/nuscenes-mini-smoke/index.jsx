/**
 * NuScenes-mini · smoke 전용 SPA 엔트리
 */

import { getDataSourceDisplayUrl } from '../../config/dataUrl.js'
import SmokeDashboard from './SmokeDashboard.jsx'

export default function NuscenesMiniSmoke() {
  return (
    <div className="spa-view spa-view--smoke" data-spa="nuscenes-mini-smoke">
      <h1 className="spa-view__title">NuScenes-mini · smoke</h1>
      <p className="spa-view__msg">
        src ={' '}
        <code className="spa-view__inline-code">{getDataSourceDisplayUrl('nus-mini/smoke')}</code>
      </p>
      <SmokeDashboard />
    </div>
  )
}

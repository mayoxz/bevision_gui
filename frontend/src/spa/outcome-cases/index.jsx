/**
 * Outcome cases SPA
 */

import { getDataSourceDisplayUrl } from '../../config/dataUrl.js'
import OutcomeCasesDashboard from './OutcomeCasesDashboard.jsx'

export default function OutcomeCases() {
  return (
    <div className="spa-view spa-view--outcome-cases" data-spa="outcome-cases">
      <h1 className="spa-view__title">Outcome cases</h1>
      <p className="spa-view__msg" hidden>
        src ={' '}
        <code className="spa-view__inline-code">
          {getDataSourceDisplayUrl('outcome-cases/bottom10_scene_labels.json')}
        </code>
      </p>
      <OutcomeCasesDashboard />
    </div>
  )
}

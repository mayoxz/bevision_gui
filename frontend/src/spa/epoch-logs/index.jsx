/**
 * Epoch logs SPA
 */

import { getDataSourceDisplayUrl } from '../../config/dataUrl.js'
import EpochLogsDashboard from './EpochLogsDashboard.jsx'

export default function EpochLogs() {
  return (
    <div className="spa-view spa-view--epoch-logs" data-spa="epoch-logs">
      <h1 className="spa-view__title">Epoch logs</h1>
      <p className="spa-view__msg">
        src ={' '}
        <code className="spa-view__inline-code">{getDataSourceDisplayUrl('epoch_logs')}</code>
      </p>
      <EpochLogsDashboard />
    </div>
  )
}

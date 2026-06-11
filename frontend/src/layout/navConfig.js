export const NAV_ITEMS = [
  { id: 'basemodel-vs-bevision', label: 'Basemodel vs BEVision', section: 'dashboard' },
  { id: 'outcome-cases', label: 'Outcome cases', section: 'dashboard' },
  { id: 'nus-mini:eval', label: 'NuScenes-mini · eval', section: 'dashboard' },
  { id: 'nus-mini:smoke', label: 'NuScenes-mini · smoke', section: 'dashboard' },
  { id: 'nuscenes:eval', label: 'NuScenes · eval', section: 'dashboard' },
  { id: 'epoch-logs', label: 'Epoch logs (waymo)', section: 'dashboard' },
  { id: 'pointcloud', label: 'Point Cloud Viewer', section: 'tools' },
  { id: 'nuscenes-home', label: 'nuScenes', section: 'external', href: 'https://www.nuscenes.org/' },
  {
    id: 'r2-explorer',
    label: 'R2-Explorer',
    section: 'external',
    href: 'https://lidar-ai-r2explorer.mow0qaws.workers.dev/lidar-ai/files',
  },
]

export function parseViewId(viewId) {
  if (viewId === 'basemodel-vs-bevision') {
    return { dataset: 'basemodel-vs-bevision', runKind: 'eval' }
  }
  if (viewId === 'epoch-logs') {
    return { dataset: 'epoch-logs', runKind: 'eval' }
  }
  if (viewId === 'outcome-cases') {
    return { dataset: 'outcome-cases', runKind: 'eval' }
  }
  if (viewId === 'pointcloud') {
    return { dataset: null, runKind: null }
  }
  const [dataset, runKind] = viewId.split(':')
  return { dataset, runKind: runKind ?? 'eval' }
}

export const DEFAULT_VIEW = 'basemodel-vs-bevision'

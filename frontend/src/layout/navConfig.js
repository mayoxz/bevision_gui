export const NAV_ITEMS = [
  { id: 'epoch-logs', label: 'Epoch logs (waymo)', section: 'dashboard' },
  { id: 'nus-mini:eval', label: 'NuScenes-mini · eval', section: 'dashboard' },
  { id: 'nus-mini:smoke', label: 'NuScenes-mini · smoke', section: 'dashboard' },
  { id: 'nuscenes:eval', label: 'NuScenes · eval', section: 'dashboard' },
  { id: 'pointcloud', label: 'Point Cloud', section: 'tools' },
]

export function parseViewId(viewId) {
  if (viewId === 'epoch-logs') {
    return { dataset: 'epoch-logs', runKind: 'eval' }
  }
  if (viewId === 'pointcloud') {
    return { dataset: null, runKind: null }
  }
  const [dataset, runKind] = viewId.split(':')
  return { dataset, runKind: runKind ?? 'eval' }
}

export const DEFAULT_VIEW = 'epoch-logs'

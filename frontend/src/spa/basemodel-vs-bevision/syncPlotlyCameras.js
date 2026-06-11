const MIRROR_PREFIXES = ['scene', 'dragmode']

function relayoutPatch(update) {
  const patch = {}
  for (const [key, value] of Object.entries(update ?? {})) {
    if (MIRROR_PREFIXES.some((prefix) => key === prefix || key.startsWith(`${prefix}.`))) {
      patch[key] = value
    }
  }
  return patch
}

export function bindMirroredPlotlyCameras(leftEl, rightEl, Plotly) {
  let syncing = false

  const mirror = (target) => (update) => {
    if (syncing) return
    const patch = relayoutPatch(update)
    if (!Object.keys(patch).length) return
    syncing = true
    Plotly.relayout(target, patch).finally(() => {
      syncing = false
    })
  }

  const onLeftRelayout = mirror(rightEl)
  const onRightRelayout = mirror(leftEl)
  const onLeftRelayouting = mirror(rightEl)
  const onRightRelayouting = mirror(leftEl)

  leftEl.on('plotly_relayout', onLeftRelayout)
  rightEl.on('plotly_relayout', onRightRelayout)
  leftEl.on('plotly_relayouting', onLeftRelayouting)
  rightEl.on('plotly_relayouting', onRightRelayouting)

  return () => {
    leftEl.removeAllListeners('plotly_relayout')
    rightEl.removeAllListeners('plotly_relayout')
    leftEl.removeAllListeners('plotly_relayouting')
    rightEl.removeAllListeners('plotly_relayouting')
  }
}

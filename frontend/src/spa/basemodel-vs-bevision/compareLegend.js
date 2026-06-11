const ROOM_TRACE_COUNT = 2

export const COMPARE_LEGEND_ITEMS = [
  { traceIndex: ROOM_TRACE_COUNT + 0, name: 'LiDAR points', kind: 'marker', color: '#888888' },
  { traceIndex: ROOM_TRACE_COUNT + 1, name: 'Matched GT', kind: 'line', color: '#17a65b' },
  { traceIndex: ROOM_TRACE_COUNT + 2, name: 'Missed GT', kind: 'line', color: '#e53935' },
  { traceIndex: ROOM_TRACE_COUNT + 3, name: 'Matched prediction', kind: 'line', color: '#1787d4' },
  { traceIndex: ROOM_TRACE_COUNT + 4, name: 'False prediction', kind: 'line', color: '#ff9800' },
  { traceIndex: ROOM_TRACE_COUNT + 5, name: 'Ego', kind: 'marker', color: '#9c27b0' },
]

export function createLegendVisibility() {
  return Object.fromEntries(COMPARE_LEGEND_ITEMS.map((item) => [item.traceIndex, true]))
}

export async function setTraceVisibility(plotEls, Plotly, traceIndex, visible) {
  await Promise.all(
    plotEls.map((el) => Plotly.restyle(el, { visible }, [traceIndex])),
  )
}

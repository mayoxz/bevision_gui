import { COMPARE_LEGEND_ITEMS } from './compareLegend.js'

export default function CompareLegend({ visibility, onToggle }) {
  return (
    <div className="bm-bev-compare__legend" aria-label="Scene legend">
      {COMPARE_LEGEND_ITEMS.map((item) => {
        const active = visibility[item.traceIndex] !== false
        return (
          <button
            key={item.name}
            type="button"
            className={`bm-bev-compare__legend-item${active ? '' : ' bm-bev-compare__legend-item--off'}`}
            onClick={() => onToggle(item.traceIndex)}
          >
            <span
              className={`bm-bev-compare__legend-swatch bm-bev-compare__legend-swatch--${item.kind}`}
              style={{ '--legend-color': item.color }}
              aria-hidden
            />
            <span>{item.name}</span>
          </button>
        )
      })}
    </div>
  )
}

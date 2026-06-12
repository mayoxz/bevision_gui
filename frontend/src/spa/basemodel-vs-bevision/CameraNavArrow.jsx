export default function CameraNavArrow({ direction }) {
  const path = direction === 'prev' ? 'M15 18l-6-6 6-6' : 'M9 6l6 6-6 6'
  return (
    <svg
      className="bm-bev-compare__cameras-nav-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

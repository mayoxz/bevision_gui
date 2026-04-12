/**
 * 데이터 파일 URL (로컬 `public/data/` ↔ 배포 시 R2 등).
 * 개발: `VITE_DATA_BASE_URL` 미설정 → `/data/<path>`
 * 프로덕션: `.env.production`의 절대 베이스 + 동일 상대 경로
 *
 * @param {string} path `public/data` 기준 상대 경로 (앞 슬래시 없이), 예: `apple/apple.jpg`
 */
export function resolveDataUrl(path) {
  const normalized = path.replace(/^\/+/, '')
  const base = (import.meta.env.VITE_DATA_BASE_URL ?? '').trim().replace(/\/+$/, '')
  if (base) return `${base}/${normalized}`
  return `/data/${normalized}`
}

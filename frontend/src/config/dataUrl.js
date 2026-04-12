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

/**
 * UI에 표시: 실제 fetch에 쓰이는 데이터 루트 URL 1개 (원격이면 절대 URL, 로컬이면 origin + /data/…).
 * @param {string} pathFromDataRoot `public/data` 기준 상대 경로
 */
export function getDataSourceDisplayUrl(pathFromDataRoot) {
  const u = resolveDataUrl(pathFromDataRoot.replace(/^\/+/, ''))
  if (/^https?:\/\//i.test(u)) return u
  if (typeof window !== 'undefined' && window.location?.origin) {
    try {
      return new URL(u, window.location.origin).href
    } catch {
      return u
    }
  }
  return u
}

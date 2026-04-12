import { lazy, Suspense } from 'react'

const lazyRoutes = {
  'nus-mini:eval': lazy(() => import('../spa/nuscenes-mini-eval/index.jsx')),
  'nus-mini:smoke': lazy(() => import('../spa/nuscenes-mini-smoke/index.jsx')),
}

export function SpaViewport({ dataset, runKind }) {
  const routeKey = `${dataset}:${runKind}`
  const LazyComp = dataset === 'nus-mini' ? lazyRoutes[routeKey] : null

  if (!LazyComp) {
    const msg =
      dataset === 'nus-mini'
        ? '알 수 없는 실행 결과입니다.'
        : '지원하는 데이터셋이 아닙니다.'
    return (
      <div className="spa-view spa-view--empty">
        <p className="spa-view__msg">{msg}</p>
      </div>
    )
  }

  const Page = LazyComp
  return (
    <Suspense
      fallback={
        <div className="spa-view spa-view--empty">
          <p className="spa-view__msg">로딩 중…</p>
        </div>
      }
    >
      <Page key={routeKey} />
    </Suspense>
  )
}

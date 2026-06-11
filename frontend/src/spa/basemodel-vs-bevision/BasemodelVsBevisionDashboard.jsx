import { useCallback, useEffect, useRef, useState } from 'react'
import CompareLegend from './CompareLegend.jsx'
import { createLegendVisibility, setTraceVisibility } from './compareLegend.js'
import {
  buildFigureLayout,
  buildFigureTraces,
  fetchCompareFigures,
  fetchCompareSceneIndex,
} from './figureData.js'
import { loadPlotly } from './loadPlotly.js'
import { bindMirroredPlotlyCameras } from './syncPlotlyCameras.js'
import './basemodel-vs-bevision.css'

const PLOT_CONFIG = {
  responsive: true,
  displayModeBar: false,
  scrollZoom: true,
  doubleClick: false,
}

function SceneBar({ scenes, sceneId, loading, onSelect }) {
  if (!scenes.length) return null

  return (
    <div className="bm-bev-compare__scene-bar" role="toolbar" aria-label="Scene selection">
      {scenes.map((scene) => (
        <button
          key={scene.id}
          type="button"
          className={`bm-bev-compare__scene-btn${scene.id === sceneId ? ' bm-bev-compare__scene-btn--active' : ''}`}
          onClick={() => onSelect(scene.id)}
          disabled={loading && scene.id === sceneId}
        >
          {scene.label ?? `Scene ${scene.id}`}
        </button>
      ))}
    </div>
  )
}

function ComparePanel({ label, plotRef, legend, sceneBar }) {
  return (
    <section className="bm-bev-compare__panel">
      {legend}
      {sceneBar}
      <div className="bm-bev-compare__label">{label}</div>
      <div ref={plotRef} className="bm-bev-compare__plot" />
    </section>
  )
}

export default function BasemodelVsBevisionDashboard() {
  const leftRef = useRef(null)
  const rightRef = useRef(null)
  const rootRef = useRef(null)
  const [scenes, setScenes] = useState([])
  const [sceneId, setSceneId] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [legendVisibility, setLegendVisibility] = useState(createLegendVisibility)
  const plotlyRef = useRef(null)
  const plotElsRef = useRef([])

  const toggleLegendItem = useCallback(async (traceIndex) => {
    const Plotly = plotlyRef.current
    const plotEls = plotElsRef.current
    if (!Plotly || plotEls.length !== 2) return

    const nextVisible = legendVisibility[traceIndex] === false
    setLegendVisibility((prev) => ({ ...prev, [traceIndex]: nextVisible }))
    await setTraceVisibility(plotEls, Plotly, traceIndex, nextVisible)
  }, [legendVisibility])

  useEffect(() => {
    let cancelled = false

    fetchCompareSceneIndex()
      .then(({ scenes: nextScenes, defaultScene }) => {
        if (cancelled) return
        setScenes(nextScenes)
        setSceneId(defaultScene)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message ?? String(err))
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!sceneId) return

    let cancelled = false
    let unbindMirror = null
    let resizeObserver = null
    let onLogCamera = null
    let resizeFrame = 0
    let Plotly = null

    async function mountScene() {
      setLoading(true)
      setError(null)
      setLegendVisibility(createLegendVisibility())
      try {
        const [{ shared, basemodel, bevision }, plotly] = await Promise.all([
          fetchCompareFigures(sceneId),
          loadPlotly(),
        ])
        if (cancelled) return

        Plotly = plotly
        plotlyRef.current = plotly
        const leftEl = leftRef.current
        const rightEl = rightRef.current
        if (!leftEl || !rightEl) return
        plotElsRef.current = [leftEl, rightEl]

        if (leftEl.data) Plotly.purge(leftEl)
        if (rightEl.data) Plotly.purge(rightEl)
        if (cancelled) return

        const leftLayout = buildFigureLayout(shared)
        const rightLayout = buildFigureLayout(shared)

        await Promise.all([
          Plotly.newPlot(leftEl, buildFigureTraces(shared, basemodel), leftLayout, PLOT_CONFIG),
          Plotly.newPlot(rightEl, buildFigureTraces(shared, bevision), rightLayout, PLOT_CONFIG),
        ])
        if (cancelled) return

        unbindMirror = bindMirroredPlotlyCameras(leftEl, rightEl, Plotly)

        if (import.meta.env.DEV) {
          onLogCamera = (event) => {
            if (event.altKey && event.key.toLowerCase() === 'c') {
              const cam = leftEl.layout?.scene?.camera
              if (cam) console.log('DEFAULT_SCENE_CAMERA', JSON.stringify(cam, null, 2))
            }
          }
          window.addEventListener('keydown', onLogCamera)
        }

        let lastWidth = 0
        let lastHeight = 0
        const resize = () => {
          const width = Math.round(rootRef.current?.clientWidth ?? 0)
          const height = Math.round(rootRef.current?.clientHeight ?? 0)
          if (width < 1 || height < 1) return
          if (width === lastWidth && height === lastHeight) return
          lastWidth = width
          lastHeight = height
          Plotly.Plots.resize(leftEl)
          Plotly.Plots.resize(rightEl)
        }
        const scheduleResize = () => {
          if (resizeFrame) cancelAnimationFrame(resizeFrame)
          resizeFrame = requestAnimationFrame(() => {
            resizeFrame = 0
            resize()
          })
        }
        resizeObserver = new ResizeObserver(scheduleResize)
        if (rootRef.current) resizeObserver.observe(rootRef.current)
        scheduleResize()
        setLoading(false)
      } catch (err) {
        if (!cancelled) {
          setError(err?.message ?? String(err))
          setLoading(false)
        }
      }
    }

    mountScene()

    return () => {
      cancelled = true
      unbindMirror?.()
      if (onLogCamera) window.removeEventListener('keydown', onLogCamera)
      if (resizeFrame) cancelAnimationFrame(resizeFrame)
      resizeObserver?.disconnect()
      if (Plotly) {
        if (leftRef.current) Plotly.purge(leftRef.current)
        if (rightRef.current) Plotly.purge(rightRef.current)
      }
    }
  }, [sceneId])

  return (
    <div ref={rootRef} className="bm-bev-compare">
      {loading ? <p className="bm-bev-compare__status">Loading comparison…</p> : null}
      {error ? <p className="bm-bev-compare__error">{error}</p> : null}
      <div className="bm-bev-compare__grid">
        <ComparePanel
          label="Basemodel"
          plotRef={leftRef}
          legend={<CompareLegend visibility={legendVisibility} onToggle={toggleLegendItem} />}
          sceneBar={(
            <SceneBar
              scenes={scenes}
              sceneId={sceneId}
              loading={loading}
              onSelect={setSceneId}
            />
          )}
        />
        <ComparePanel
          label="BEVision"
          plotRef={rightRef}
          legend={<CompareLegend visibility={legendVisibility} onToggle={toggleLegendItem} />}
        />
      </div>
    </div>
  )
}

const PLOTLY_SRC = 'https://cdn.plot.ly/plotly-2.35.2.min.js'

let plotlyPromise = null

export function loadPlotly() {
  if (typeof window !== 'undefined' && window.Plotly) {
    return Promise.resolve(window.Plotly)
  }
  if (!plotlyPromise) {
    plotlyPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = PLOTLY_SRC
      script.async = true
      script.onload = () => resolve(window.Plotly)
      script.onerror = () => reject(new Error('Failed to load Plotly'))
      document.head.appendChild(script)
    })
  }
  return plotlyPromise
}

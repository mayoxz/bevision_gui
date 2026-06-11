import fs from 'fs'

const html = fs.readFileSync('d:/Downloads/basemodel.html', 'utf8')
const idx = html.lastIndexOf('Plotly.newPlot(')
console.log('last idx', idx)
console.log(JSON.stringify(html.slice(idx, idx + 400)))

const divIdx = html.lastIndexOf('plotly-graph-div')
console.log('div idx', divIdx)
console.log(JSON.stringify(html.slice(divIdx - 100, divIdx + 200)))

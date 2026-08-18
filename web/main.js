import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const PLIES = 10

const COLOR = {
  x: new THREE.Color('#ff7a5c'),
  o: new THREE.Color('#4aa8ff'),
  draw: new THREE.Color('#94a3b5'),
  gold: new THREE.Color('#ffd166'),
  think: new THREE.Color('#9ef0ff'),
  bg: new THREE.Color('#080b11'),
}

// ------------------------------------------------------- symmetry, client side
// Same tables as generate/collapse_symmetry.py: gather tables, g[k] = source cell
// for output position k. ROT is 90 degrees counter-clockwise.

const ROT = [2, 5, 8, 1, 4, 7, 0, 3, 6]
const FLIP = [6, 7, 8, 3, 4, 5, 0, 1, 2]
const composePerm = (p, q) => q.map((i) => p[i]) // apply p first, then q
const applyPerm = (g, s) => g.map((i) => s[i]).join('')

const TRANSFORMS = []
{
  let r = [0, 1, 2, 3, 4, 5, 6, 7, 8]
  for (let n = 0; n < 4; n++) {
    TRANSFORMS.push({ table: r, n, flip: false })
    TRANSFORMS.push({ table: composePerm(r, FLIP), n, flip: true })
    r = composePerm(r, ROT)
  }
}

const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]

function winnerOf(s) {
  for (const [a, b, c] of LINES) {
    if (s[a] !== '.' && s[a] === s[b] && s[b] === s[c]) return s[a]
  }
  return null
}

function canonOf(s) {
  let best = s
  for (const t of TRANSFORMS) {
    const image = applyPerm(t.table, s)
    if (image < best) best = image
  }
  return best
}

function orbitSizeOf(s) {
  return new Set(TRANSFORMS.map((t) => applyPerm(t.table, s))).size
}

function piecesOf(s) {
  return 9 - (s.match(/\./g) || []).length
}

// ---------------------------------------------------------------- scene setup

const scene = new THREE.Scene()
scene.background = COLOR.bg
scene.fog = new THREE.Fog(COLOR.bg, 150, 460)

const camera = new THREE.PerspectiveCamera(46, 1, 0.5, 1200)
camera.position.set(96, 22, 116)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
document.body.appendChild(renderer.domElement)

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.06
controls.autoRotate = true
controls.autoRotateSpeed = 0.55
controls.target.set(0, -40, 0)

scene.add(new THREE.AmbientLight(0xffffff, 1.25))
const keyLight = new THREE.DirectionalLight(0xffffff, 1.5)
keyLight.position.set(60, 80, 90)
scene.add(keyLight)
const rimLight = new THREE.DirectionalLight(0x6ea8ff, 0.7)
rimLight.position.set(-70, -40, -60)
scene.add(rimLight)

// --------------------------------------------------------------------- colours

function outcomeColor(node) {
  if (node.value > 0) return COLOR.x.clone()
  if (node.value < 0) return COLOR.o.clone()
  return COLOR.draw.clone()
}

function plyColor(node) {
  return new THREE.Color().setHSL(0.58 - 0.5 * (node.ply / 9), 0.62, 0.58)
}

// Structural grouping: hue follows where the pieces sit (edge-heavy blue towards
// corner-heavy red), brighter when the centre is taken.
function structureColor(node) {
  const s = node.id
  const pieces = piecesOf(s)
  if (pieces === 0) return COLOR.draw.clone()
  const corners = [0, 2, 6, 8].filter((i) => s[i] !== '.').length
  const cornerFrac = corners / pieces
  const centreTaken = s[4] !== '.'
  return new THREE.Color().setHSL(0.62 - 0.62 * cornerFrac, 0.6, centreTaken ? 0.66 : 0.44)
}

// ------------------------------------------------------------------- datasets
// Two parallel scenes: the 765-node canonical graph and the full 5478-state graph.
// Each is built once into its own group; toggling is a visibility flip.

function makeLabel(text) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  ctx.font = '600 30px ui-sans-serif, system-ui'
  ctx.fillStyle = 'rgba(223, 230, 240, 0.8)'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 8, 34)
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas),
    transparent: true,
    depthTest: false,
    fog: false,
  }))
  sprite.scale.set(16, 4, 1)
  return sprite
}

const ringGeometry = (() => {
  const pts = []
  for (let i = 0; i <= 96; i++) {
    const a = (2 * Math.PI * i) / 96
    pts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)))
  }
  return new THREE.BufferGeometry().setFromPoints(pts)
})()

function buildDataset(data, key) {
  const { nodes, edges } = data
  const indexById = new Map(nodes.map((n, i) => [n.id, i]))
  const group = new THREE.Group()

  // ---- contiguous ply runs (nodes sorted by (ply, id), edges by source index)
  const nodeStart = [], nodeEnd = [], edgeStart = [], edgeEnd = []
  {
    const nCount = new Array(PLIES).fill(0)
    nodes.forEach((n) => nCount[n.ply]++)
    const eCount = new Array(PLIES).fill(0)
    edges.forEach((e) => eCount[nodes[e.source].ply]++)
    let n = 0, e = 0
    for (let p = 0; p < PLIES; p++) {
      nodeStart[p] = n; n += nCount[p]; nodeEnd[p] = n
      edgeStart[p] = e; e += eCount[p]; edgeEnd[p] = e
    }
  }

  // ---- spheres
  const small = key === 'full'
  const geometry = new THREE.SphereGeometry(1, small ? 8 : 14, small ? 6 : 10)
  const material = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.05 })
  const spheres = new THREE.InstancedMesh(geometry, material, nodes.length)
  spheres.instanceMatrix.setUsage(THREE.StaticDrawUsage)
  // The instanced bounding sphere sits at the origin, so zooming in culls the whole
  // mesh at once. Never cull; we always want every revealed node drawn.
  spheres.frustumCulled = false

  const dummy = new THREE.Object3D()
  nodes.forEach((node, i) => {
    const radius = small
      ? (node.terminal ? 0.42 : 0.34)
      : (0.52 + 0.17 * Math.log2(node.orbit_size)) * (node.terminal ? 1.15 : 1)
    dummy.position.set(...node.pos)
    dummy.scale.setScalar(radius)
    dummy.updateMatrix()
    spheres.setMatrixAt(i, dummy.matrix)
  })
  group.add(spheres)

  // ---- edges, weight shown as brightness
  const positions = new Float32Array(edges.length * 6)
  const colors = new Float32Array(edges.length * 6)
  const tint = new THREE.Color()
  edges.forEach((edge, i) => {
    positions.set(nodes[edge.source].pos, i * 6)
    positions.set(nodes[edge.target].pos, i * 6 + 3)
    const player = nodes[edge.source].ply % 2 === 0 ? 'X' : 'O'
    const weight = edge.weight || 1
    tint.copy(player === 'X' ? COLOR.x : COLOR.o)
      .multiplyScalar(small ? 0.30 : 0.28 + 0.11 * Math.min(weight, 4))
    colors.set([tint.r, tint.g, tint.b], i * 6)
    colors.set([tint.r, tint.g, tint.b], i * 6 + 3)
  })
  const edgeGeometry = new THREE.BufferGeometry()
  edgeGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  edgeGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const lines = new THREE.LineSegments(
    edgeGeometry,
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: small ? 0.34 : 0.5 })
  )
  lines.frustumCulled = false
  group.add(lines)

  // ---- ply labels and rings, so side views read as layers
  const labels = [], rings = []
  for (let p = 0; p < PLIES; p++) {
    let radius = 0
    for (let i = nodeStart[p]; i < nodeEnd[p]; i++) {
      radius = Math.max(radius, Math.hypot(nodes[i].pos[0], nodes[i].pos[2]))
    }
    const label = makeLabel(`ply ${p} · ${nodeEnd[p] - nodeStart[p]}`)
    label.position.set(radius + 10, -p * 9, 0)
    group.add(label)
    labels.push(label)

    const ring = new THREE.LineLoop(
      ringGeometry,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07 })
    )
    ring.scale.setScalar(Math.max(radius, 0.001))
    ring.position.y = -p * 9
    ring.frustumCulled = false
    group.add(ring)
    rings.push(ring)
  }

  // ---- adjacency for hover highlighting
  const adjacency = nodes.map(() => [])
  edges.forEach((edge) => {
    adjacency[edge.source].push({ other: edge.target, isChild: true })
    adjacency[edge.target].push({ other: edge.source, isChild: false })
  })
  const maxDegree = Math.max(...adjacency.map((a) => a.length))

  const hoverGeometry = new THREE.BufferGeometry()
  hoverGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxDegree * 6), 3))
  hoverGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(maxDegree * 6), 3))
  hoverGeometry.setDrawRange(0, 0)
  const hoverLines = new THREE.LineSegments(
    hoverGeometry,
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthTest: false })
  )
  hoverLines.frustumCulled = false
  group.add(hoverLines)

  const palettes = {
    outcome: nodes.map(outcomeColor),
    ply: nodes.map(plyColor),
    structure: nodes.map(structureColor),
  }

  group.visible = false
  scene.add(group)

  return {
    key, nodes, edges, indexById, group, spheres, edgeGeometry,
    nodeStart, nodeEnd, edgeStart, edgeEnd, labels, rings,
    adjacency, hoverGeometry, hoverLines, palettes,
  }
}

const collapsedData = await fetch('/graph.json').then((r) => r.json())
const datasets = { collapsed: buildDataset(collapsedData, 'collapsed') }
let ds = datasets.collapsed
ds.group.visible = true

// Cross-check the JS tables against the Python data once.
{
  let bad = 0
  for (const node of ds.nodes) {
    if (orbitSizeOf(node.id) !== node.orbit_size || canonOf(node.id) !== node.id) bad++
  }
  console[bad ? 'error' : 'log'](
    bad ? `symmetry tables disagree with graph.json on ${bad} nodes`
        : 'symmetry tables verified against graph.json'
  )
}

// ------------------------------------------------------------------- palettes

let mode = 'outcome'

function activeTraceIndices(dataset) {
  const out = []
  for (const board of history) {
    const id = dataset.key === 'full' ? board : canonOf(board)
    const index = dataset.indexById.get(id)
    if (index !== undefined) out.push(index)
  }
  return out
}

function applyPalette(dataset = ds) {
  dataset.palettes[mode].forEach((c, i) => dataset.spheres.setColorAt(i, c))
  for (const i of activeTraceIndices(dataset)) dataset.spheres.setColorAt(i, COLOR.gold)
  dataset.spheres.instanceColor.needsUpdate = true
}

// ------------------------------------------------------------------- animation

let revealed = 0
let growing = true
const GROW_RATE = 1.9

const plyBar = document.getElementById('ply')
const ticks = Array.from({ length: PLIES }, () => {
  const tick = document.createElement('div')
  tick.className = 'tick'
  plyBar.appendChild(tick)
  return tick
})

function applyReveal() {
  const p = Math.min(PLIES - 1, Math.floor(revealed))
  const f = Math.min(1, revealed - p)

  ds.spheres.count = Math.round(ds.nodeStart[p] + f * (ds.nodeEnd[p] - ds.nodeStart[p]))
  const shownEdges = Math.round(ds.edgeStart[p] + f * (ds.edgeEnd[p] - ds.edgeStart[p]))
  ds.edgeGeometry.setDrawRange(0, shownEdges * 2)

  for (let q = 0; q < PLIES; q++) {
    const on = q < revealed
    ds.labels[q].visible = on
    ds.rings[q].visible = on && q > 0
  }
  ticks.forEach((tick, i) => tick.classList.toggle('on', i < revealed))
}

function finishGrowth() {
  if (growing) { revealed = PLIES; growing = false }
}

// ------------------------------------------------------- screen-space picking
// Project every revealed node and take the nearest within a pixel radius. Far more
// forgiving than raycasting against small spheres, and it keeps working at any zoom.

const projected = new THREE.Vector3()
let lastClientX = -1e9, lastClientY = -1e9

function pickNode(clientX, clientY) {
  let best = -1
  let bestDist = 15 // px
  for (let i = 0; i < ds.spheres.count; i++) {
    projected.set(ds.nodes[i].pos[0], ds.nodes[i].pos[1], ds.nodes[i].pos[2]).project(camera)
    if (projected.z < -1 || projected.z > 1) continue
    const sx = (projected.x * 0.5 + 0.5) * innerWidth
    const sy = (-projected.y * 0.5 + 0.5) * innerHeight
    const d = Math.hypot(sx - clientX, sy - clientY)
    if (d < bestDist) { bestDist = d; best = i }
  }
  return best
}

addEventListener('pointermove', (event) => {
  lastClientX = event.clientX
  lastClientY = event.clientY
})

// --------------------------------------------------------------------- hover UI

let hovered = -1
const tip = document.getElementById('tip')
const tipGrid = document.getElementById('tip-grid')

function updateHoverLines(index) {
  const posAttr = ds.hoverGeometry.attributes.position
  const colAttr = ds.hoverGeometry.attributes.color
  if (index === -1) {
    ds.hoverGeometry.setDrawRange(0, 0)
    return
  }
  const from = ds.nodes[index].pos
  const links = ds.adjacency[index]
  links.forEach((link, i) => {
    const to = ds.nodes[link.other].pos
    posAttr.array.set(from, i * 6)
    posAttr.array.set(to, i * 6 + 3)
    // children bright gold, parents cool white
    const c = link.isChild ? [1.0, 0.82, 0.4] : [0.62, 0.74, 0.95]
    colAttr.array.set(c, i * 6)
    colAttr.array.set(c, i * 6 + 3)
  })
  posAttr.needsUpdate = true
  colAttr.needsUpdate = true
  ds.hoverGeometry.setDrawRange(0, links.length * 2)
}

function updateHover() {
  const id = pickNode(lastClientX, lastClientY)
  if (id === hovered) return
  hovered = id
  updateHoverLines(id)

  if (id === -1) {
    tip.style.display = 'none'
    document.body.style.cursor = ''
    return
  }
  document.body.style.cursor = 'pointer'

  const node = ds.nodes[id]
  tipGrid.innerHTML = ''
  for (const ch of node.id) {
    const cell = document.createElement('div')
    cell.className = 'cell' + (ch === 'X' ? ' x' : ch === 'O' ? ' o' : '')
    cell.textContent = ch === '.' ? '' : ch
    tipGrid.appendChild(cell)
  }

  const outcome = node.terminal
    ? node.winner === null ? 'drawn' : `${node.winner} won`
    : node.value > 0 ? 'X wins' : node.value < 0 ? 'O wins' : 'draw'

  document.getElementById('tip-ply').textContent = node.ply
  document.getElementById('tip-move').textContent = node.terminal ? '—' : node.ply % 2 === 0 ? 'X' : 'O'
  document.getElementById('tip-value').textContent = outcome
  document.getElementById('tip-orbit').textContent = orbitSizeOf(node.id)
  tip.style.display = 'block'
}

// ------------------------------------------------- orbit panel (click a node)

const orbitPanel = document.getElementById('orbit')
const obRow = document.getElementById('ob-row')
const obTitle = document.getElementById('ob-title')
const obNote = document.getElementById('ob-note')
let obTimers = []
let obId = null

function clearObTimers() {
  obTimers.forEach(clearTimeout)
  obTimers = []
}

function cssFor(t) {
  if (t.n === 0 && !t.flip) return 'none'
  const rot = t.n ? `rotate(${-90 * t.n}deg)` : ''
  return t.flip ? `rotateX(180deg) ${rot}`.trim() : rot
}

function labelFor(t) {
  if (t.n === 0 && !t.flip) return 'as is'
  const deg = t.n ? `${90 * t.n}°` : ''
  return t.flip ? (deg ? `${deg} + flip` : 'flip') : deg
}

function miniBoard(state, transform, isCanon) {
  const wrap = document.createElement('div')
  wrap.className = 'ob-wrap' + (isCanon ? ' canon' : '')
  const boardEl = document.createElement('div')
  boardEl.className = 'ob-board'
  for (const ch of state) {
    const cell = document.createElement('div')
    cell.className = 'ob-cell' + (ch === 'X' ? ' x' : ch === 'O' ? ' o' : '')
    cell.textContent = ch === '.' ? '' : ch
    boardEl.appendChild(cell)
  }
  const label = document.createElement('div')
  label.className = 'ob-lab'
  label.textContent = isCanon ? 'canonical' : labelFor(transform)
  wrap.appendChild(boardEl)
  wrap.appendChild(label)
  return wrap
}

function openOrbit(id) {
  clearObTimers()
  obId = id
  const canonId = canonOf(id)

  const members = []
  const seenBoards = new Set()
  for (const t of TRANSFORMS) {
    const image = applyPerm(t.table, id)
    if (seenBoards.has(image)) continue
    seenBoards.add(image)
    const back = TRANSFORMS.find((u) => applyPerm(u.table, image) === canonId)
    members.push({ state: image, back, isCanon: image === canonId })
  }

  obTitle.textContent = `${members.length} raw board${members.length > 1 ? 's' : ''} → 1 node`
  obRow.innerHTML = ''
  const wraps = members.map((m) => {
    const wrap = miniBoard(m.state, m.back, m.isCanon)
    obRow.appendChild(wrap)
    return wrap
  })
  orbitPanel.style.display = 'block'

  if (members.length === 1) {
    obNote.textContent = 'Fully symmetric: all 8 transforms leave this board unchanged.'
    return
  }

  obNote.textContent = 'These boards all occur in play — they differ only by rotation or reflection.'

  obTimers.push(setTimeout(() => {
    wraps.forEach((wrap, i) => {
      const boardEl = wrap.firstChild
      boardEl.style.transitionDelay = `${i * 90}ms`
      boardEl.style.transform = cssFor(members[i].back)
    })
    obNote.textContent = 'Rotating and reflecting each copy into the same orientation…'
  }, 500))

  const settled = 500 + 700 + 90 * members.length + 450
  obTimers.push(setTimeout(() => {
    wraps.forEach((wrap) => { if (!wrap.classList.contains('canon')) wrap.classList.add('gone') })
    obNote.textContent = `Identical — stored once as "${canonId}".`
  }, settled))
}

function closeOrbit() {
  clearObTimers()
  obId = null
  orbitPanel.style.display = 'none'
}

document.getElementById('ob-close').onclick = closeOrbit
document.getElementById('ob-replay').onclick = () => obId && openOrbit(obId)

let downX = 0, downY = 0
renderer.domElement.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY })
renderer.domElement.addEventListener('click', (e) => {
  if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return
  const hit = pickNode(e.clientX, e.clientY)
  if (hit !== -1) openOrbit(ds.nodes[hit].id)
  else closeOrbit()
})

// ------------------------------------------------------------------ live game
// history holds every raw board of the current game, empty board included. The
// gold trace maps it into whichever graph is showing: canonicalised in the
// collapsed view, verbatim in the full view.

let history = ['.........']
let gameBoard = '.........'
let gameOver = false

const traceGeometry = new THREE.BufferGeometry()
traceGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PLIES * 3), 3))
traceGeometry.setDrawRange(0, 0)
const traceLine = new THREE.Line(
  traceGeometry,
  new THREE.LineBasicMaterial({ color: COLOR.gold, transparent: true, opacity: 0.95, depthTest: false })
)
traceLine.frustumCulled = false
scene.add(traceLine)

// pulse that runs down the new edge on every move
const marker = new THREE.Mesh(
  new THREE.SphereGeometry(0.55, 12, 8),
  new THREE.MeshBasicMaterial({ color: COLOR.gold, transparent: true })
)
marker.visible = false
scene.add(marker)
let markerAnim = null

function retrace() {
  const indices = activeTraceIndices(ds)
  const attr = traceGeometry.attributes.position
  indices.forEach((nodeIndex, i) => attr.array.set(ds.nodes[nodeIndex].pos, i * 3))
  attr.needsUpdate = true
  traceGeometry.setDrawRange(0, indices.length)
  applyPalette()
}

const gGrid = document.getElementById('g-grid')
const gStatus = document.getElementById('g-status')
const gCells = Array.from({ length: 9 }, (_, i) => {
  const cell = document.createElement('button')
  cell.className = 'gcell'
  cell.onclick = () => playMove(i)
  gGrid.appendChild(cell)
  return cell
})

// ---- the perfect-play opponent, read straight off the solved graph

const AI_MODES = ['off', 'O', 'X', 'both']
let aiMode = 'off'
let aiTimers = []

const collapsedIndex = datasets.collapsed.indexById
const valueOf = (board) => datasets.collapsed.nodes[collapsedIndex.get(canonOf(board))].value

function sideToMove() {
  return piecesOf(gameBoard) % 2 === 0 ? 'X' : 'O'
}

function aiControls(side) {
  return aiMode === 'both' || aiMode === side
}

function bestMoves(side) {
  const options = []
  for (let i = 0; i < 9; i++) {
    if (gameBoard[i] !== '.') continue
    const child = gameBoard.slice(0, i) + side + gameBoard.slice(i + 1)
    options.push({ i, child, value: valueOf(child), wins: winnerOf(child) === side })
  }
  const pick = side === 'X' ? Math.max : Math.min
  const target = pick(...options.map((o) => o.value))
  let best = options.filter((o) => o.value === target)
  if (best.some((o) => o.wins)) best = best.filter((o) => o.wins)
  return best
}

function clearAiTimers() {
  aiTimers.forEach(clearTimeout)
  aiTimers = []
}

function maybeScheduleAI() {
  clearAiTimers()
  renderGame()
  if (gameOver) return
  const side = sideToMove()
  if (!aiControls(side)) return

  gStatus.textContent = `computer (${side}) thinking…`

  // flash the candidates it is reading values from, then commit
  const candidates = []
  for (let i = 0; i < 9; i++) {
    if (gameBoard[i] !== '.') continue
    const child = gameBoard.slice(0, i) + side + gameBoard.slice(i + 1)
    const id = ds.key === 'full' ? child : canonOf(child)
    const index = ds.indexById.get(id)
    if (index !== undefined) candidates.push(index)
  }
  aiTimers.push(setTimeout(() => {
    for (const i of candidates) ds.spheres.setColorAt(i, COLOR.think)
    ds.spheres.instanceColor.needsUpdate = true
  }, 250))
  aiTimers.push(setTimeout(() => {
    const best = bestMoves(side)
    const choice = best[Math.floor(Math.random() * best.length)]
    doMove(choice.i)
  }, 900))
}

function doMove(i) {
  finishGrowth()
  const side = sideToMove()
  gameBoard = gameBoard.slice(0, i) + side + gameBoard.slice(i + 1)
  history.push(gameBoard)

  // pulse from the previous node to the new one, in the active graph
  const indices = activeTraceIndices(ds)
  if (indices.length >= 2) {
    markerAnim = {
      from: ds.nodes[indices[indices.length - 2]].pos,
      to: ds.nodes[indices[indices.length - 1]].pos,
      start: performance.now(),
      duration: 420,
    }
  }
  retrace()

  const won = winnerOf(gameBoard)
  if (won) {
    gameOver = true
    gStatus.textContent = `${won} wins — path traced in gold`
  } else if (!gameBoard.includes('.')) {
    gameOver = true
    gStatus.textContent = 'Draw — path traced in gold'
  } else {
    gStatus.textContent = `${sideToMove()} to move`
  }
  maybeScheduleAI()
}

function playMove(i) {
  if (gameOver || gameBoard[i] !== '.') return
  if (aiControls(sideToMove())) return
  doMove(i)
}

function renderGame() {
  const humanTurn = !gameOver && !aiControls(sideToMove())
  gCells.forEach((cell, i) => {
    const ch = gameBoard[i]
    cell.textContent = ch === '.' ? '' : ch
    cell.className = 'gcell' + (ch === 'X' ? ' x' : ch === 'O' ? ' o' : '')
    cell.disabled = !humanTurn || ch !== '.'
  })
}

function resetGame() {
  clearAiTimers()
  gameBoard = '.........'
  history = ['.........']
  gameOver = false
  markerAnim = null
  marker.visible = false
  gStatus.textContent = 'X to move'
  retrace()
  maybeScheduleAI()
}

document.getElementById('g-reset').onclick = resetGame

const btnAi = document.getElementById('btn-ai')
function cycleAi() {
  aiMode = AI_MODES[(AI_MODES.indexOf(aiMode) + 1) % AI_MODES.length]
  btnAi.innerHTML = `Computer: ${aiMode === 'both' ? 'both sides' : aiMode === 'off' ? 'off' : 'plays ' + aiMode}<span class="key">A</span>`
  maybeScheduleAI()
}
btnAi.onclick = cycleAi

document.getElementById('btn-pv').onclick = () => {
  if (aiMode !== 'both') {
    aiMode = 'both'
    btnAi.innerHTML = 'Computer: both sides<span class="key">A</span>'
  }
  resetGame()
}

// -------------------------------------------------------------- dataset toggle

const btnGraph = document.getElementById('btn-graph')
let loadingFull = false

function updateStats() {
  document.getElementById('s-nodes').textContent = ds.nodes.length
  document.getElementById('s-edges').textContent = ds.edges.length
  document.getElementById('s-states').textContent =
    ds.key === 'collapsed'
      ? ds.nodes.reduce((a, n) => a + n.orbit_size, 0) + ' states'
      : 'nothing — all shown'
}

async function toggleGraph() {
  if (ds.key === 'collapsed') {
    if (!datasets.full) {
      if (loadingFull) return
      loadingFull = true
      btnGraph.innerHTML = 'Graph: loading…'
      const rawData = await fetch('/raw_graph.json').then((r) => r.json())
      datasets.full = buildDataset(rawData, 'full')
      loadingFull = false
    }
    ds.group.visible = false
    ds = datasets.full
  } else {
    ds.group.visible = false
    ds = datasets.collapsed
  }
  ds.group.visible = true
  hovered = -2 // force hover refresh
  btnGraph.innerHTML = `Graph: ${ds.key === 'collapsed' ? 'collapsed' : 'full 5478'}<span class="key">G</span>`
  updateStats()
  applyPalette()
  retrace()
  applyReveal()
}
btnGraph.onclick = toggleGraph

// ------------------------------------------------------------------------ chrome

updateStats()

const legends = {
  outcome: {
    cap: 'Result with perfect play',
    rows: [[COLOR.x, 'X wins'], [COLOR.draw, 'Draw'], [COLOR.o, 'O wins']],
  },
  ply: {
    cap: 'Moves played',
    rows: [0, 3, 6, 9].map((p) => [plyColor({ ply: p }), `ply ${p}`]),
  },
  structure: {
    cap: 'Where the pieces sit',
    rows: [
      [new THREE.Color().setHSL(0.62, 0.6, 0.44), 'edge-heavy'],
      [new THREE.Color().setHSL(0.0, 0.6, 0.44), 'corner-heavy'],
      [new THREE.Color().setHSL(0.31, 0.6, 0.66), 'brighter = centre taken'],
    ],
  },
}

function drawLegend(name) {
  document.getElementById('legend-cap').textContent = legends[name].cap
  document.getElementById('legend-rows').innerHTML = legends[name].rows
    .map(([c, label]) => `<div class="row"><div class="dot" style="background:#${c.getHexString()}"></div>${label}</div>`)
    .join('')
}
drawLegend('outcome')

const MODES = ['outcome', 'ply', 'structure']
const btnColor = document.getElementById('btn-color')
const btnSpin = document.getElementById('btn-spin')

function replayGrowth() {
  revealed = 0
  growing = true
}

function toggleColor() {
  mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length]
  applyPalette()
  drawLegend(mode)
  btnColor.innerHTML = `Color: ${mode}<span class="key">C</span>`
}

function toggleSpin() {
  controls.autoRotate = !controls.autoRotate
  btnSpin.innerHTML = `Auto-rotate: ${controls.autoRotate ? 'on' : 'off'}<span class="key">Space</span>`
}

document.getElementById('btn-grow').onclick = replayGrowth
btnColor.onclick = toggleColor
btnSpin.onclick = toggleSpin

// ---- camera presets: orbit / side / top

const VIEWS = {
  orbit: new THREE.Vector3(96, 22, 116),
  side: new THREE.Vector3(172, -40, 4),
  top: new THREE.Vector3(4, 72, 4),
}
let camTween = null

function flyTo(name) {
  camTween = {
    from: camera.position.clone(),
    to: VIEWS[name].clone(),
    start: performance.now(),
    duration: 900,
  }
}
document.getElementById('v-orbit').onclick = () => flyTo('orbit')
document.getElementById('v-side').onclick = () => flyTo('side')
document.getElementById('v-top').onclick = () => flyTo('top')

addEventListener('keydown', (event) => {
  if (event.key === 'r' || event.key === 'R') replayGrowth()
  if (event.key === 'c' || event.key === 'C') toggleColor()
  if (event.key === 'g' || event.key === 'G') toggleGraph()
  if (event.key === 'a' || event.key === 'A') cycleAi()
  if (event.key === 'p' || event.key === 'P') document.getElementById('btn-pv').click()
  if (event.key === '1') flyTo('orbit')
  if (event.key === '2') flyTo('side')
  if (event.key === '3') flyTo('top')
  if (event.key === 'Escape') closeOrbit()
  if (event.code === 'Space') { event.preventDefault(); toggleSpin() }
})

// ----------------------------------------------------------------------- loop

const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2

// Sized in the loop rather than once at startup: if the pane is hidden at load,
// innerWidth is 0 and a one-shot setSize would leave a blank canvas forever.
let viewW = 0, viewH = 0
const clock = new THREE.Clock()

renderer.setAnimationLoop(() => {
  if ((innerWidth !== viewW || innerHeight !== viewH) && innerWidth > 0 && innerHeight > 0) {
    viewW = innerWidth
    viewH = innerHeight
    camera.aspect = viewW / viewH
    camera.updateProjectionMatrix()
    renderer.setSize(viewW, viewH)
  }

  const dt = Math.min(clock.getDelta(), 0.05)
  const now = performance.now()

  if (growing) {
    revealed = Math.min(PLIES, revealed + dt * GROW_RATE)
    if (revealed >= PLIES) growing = false
  }
  applyReveal()

  if (camTween) {
    const t = Math.min(1, (now - camTween.start) / camTween.duration)
    camera.position.lerpVectors(camTween.from, camTween.to, easeInOut(t))
    if (t >= 1) camTween = null
  }

  if (markerAnim) {
    const t = Math.min(1, (now - markerAnim.start) / markerAnim.duration)
    const e = easeInOut(t)
    marker.visible = true
    marker.position.set(
      markerAnim.from[0] + (markerAnim.to[0] - markerAnim.from[0]) * e,
      markerAnim.from[1] + (markerAnim.to[1] - markerAnim.from[1]) * e,
      markerAnim.from[2] + (markerAnim.to[2] - markerAnim.from[2]) * e,
    )
    marker.material.opacity = 1 - 0.5 * t
    if (t >= 1) { markerAnim = null; marker.visible = false }
  }

  controls.update()
  updateHover()
  renderer.render(scene, camera)
})

applyPalette()
resetGame()

// Хятад → Эрээн → Хил → Улаанбаатар. Тасархай шугам CSS-ээр урсана.
// prefers-reduced-motion үед зураас хөдөлгөөнгүй (landing.css).

const ROUTE = 'M64 348 C120 340 150 300 188 262 C226 224 250 196 292 168 C334 140 370 112 424 76'

const STOPS = [
  { x: 64, y: 348, label: 'Хятад', dx: 18, dy: 28, anchor: 'start' as const },
  { x: 188, y: 262, label: 'Эрээн', dx: 14, dy: -18, anchor: 'start' as const },
  { x: 292, y: 168, label: 'Хил', dx: 14, dy: -16, anchor: 'start' as const },
  { x: 424, y: 76, label: 'Улаанбаатар', dx: -8, dy: 28, anchor: 'end' as const },
]

const DOTS = (() => {
  const dots: { x: number; y: number; r: number }[] = []
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 18; x++) {
      const nx = x / 17
      const ny = y / 15
      const dx = (nx - 0.5) / 0.5
      const dy = (ny - 0.46) / 0.46
      if (dx * dx * 0.92 + dy * dy > 1) continue
      if ((x * 3 + y * 7) % 5 === 0) continue
      dots.push({
        x: 32 + x * 25,
        y: 22 + y * 25,
        r: (x + y) % 6 === 0 ? 2.15 : 1.35,
      })
    }
  }
  return dots
})()

export default function RouteMap() {
  return (
    <svg className="lx-map" viewBox="0 0 500 430" role="img" aria-label="Хятад, Эрээн, Хил, Улаанбаатар чиглэл">
      {DOTS.map(d => (
        <circle key={`${d.x}-${d.y}`} cx={d.x} cy={d.y} r={d.r} className="lx-map-dot" />
      ))}
      <path d={ROUTE} className="lx-route-base" />
      <path d={ROUTE} className="lx-route-dash" pathLength={100} />
      {STOPS.map(s => (
        <g key={s.label}>
          <circle cx={s.x} cy={s.y} r={11} className="lx-stop-ring" />
          <circle cx={s.x} cy={s.y} r={4.5} className="lx-stop-core" />
          <text x={s.x + s.dx} y={s.y + s.dy} textAnchor={s.anchor} className="lx-stop-label">{s.label}</text>
        </g>
      ))}
    </svg>
  )
}

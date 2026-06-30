const widths = [
  ['18%', '22%', '18%', '20%', '14%'],
  ['16%', '25%', '20%', '18%', '12%'],
  ['20%', '19%', '22%', '16%', '15%'],
  ['15%', '24%', '17%', '21%', '13%'],
  ['19%', '21%', '20%', '19%', '14%'],
  ['17%', '23%', '18%', '20%', '13%'],
  ['21%', '18%', '22%', '17%', '15%'],
]

const td: React.CSSProperties = {
  padding: '0.65rem 0.9rem',
  borderBottom: '1px solid var(--border)',
}

export default function SkeletonTable({ rows = 7, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? 'var(--bg)' : 'var(--surface)' }}>
              {Array.from({ length: cols }).map((_, j) => (
                <td key={j} style={td}>
                  <div
                    className="skeleton-line"
                    style={{ height: 14, width: widths[i % widths.length][j % 5] }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

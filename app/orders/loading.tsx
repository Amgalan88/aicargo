export default function OrdersLoading() {
  const widths = ['55%', '40%', '60%', '45%', '50%', '38%', '55%', '42%']
  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '1.5rem 1rem' }}>
      {/* Header skeleton */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div className="skeleton-line" style={{ height: 18, width: 120 }} />
        <div className="skeleton-line" style={{ height: 34, width: 120, borderRadius: 8 }} />
      </div>

      {/* Cards skeleton */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {widths.map((w, i) => (
          <div key={i} className="card" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
              <div className="skeleton-line" style={{ height: 14, width: w }} />
              <div className="skeleton-line" style={{ height: 20, width: 72, borderRadius: 20 }} />
            </div>
            <div className="skeleton-line" style={{ height: 12, width: '35%' }} />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function OrdersLoading() {
  // Matches the compact order list (chips + ~60px rows) so the list does not jump in when data arrives.
  return (
    <div className="page orders-page" aria-hidden>
      <div className="orders-head">
        <div className="skeleton-line" style={{ height: 22, width: 168, borderRadius: 6 }} />
        <div className="skeleton-line" style={{ height: 44, width: 112, borderRadius: 8 }} />
      </div>
      <div className="skeleton-line" style={{ height: 44, width: '100%', borderRadius: 10, marginBottom: '0.9rem' }} />
      <div className="ochips">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="skeleton-line" style={{ height: 44, borderRadius: 9 }} />
        ))}
      </div>
      <div className="olist">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="olist-item">
            <div className="orow" style={{ cursor: 'default' }}>
              <div className="orow-main">
                <div className="skeleton-line" style={{ height: 14, width: `${46 + (i % 3) * 14}%` }} />
                <div className="skeleton-line" style={{ height: 12, width: '52%', marginTop: 8 }} />
              </div>
              <div className="skeleton-line" style={{ height: 18, width: 72, borderRadius: 100, flexShrink: 0 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

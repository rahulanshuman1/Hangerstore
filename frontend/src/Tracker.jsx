const STEPS = [['paid', 'Order placed'], ['shipped', 'Shipped'], ['delivered', 'Delivered']];
const fmt = (d, time) => new Date(d).toLocaleString('en-IN', time
  ? { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }
  : { day: 'numeric', month: 'short', year: 'numeric' });

export default function Tracker({ order }) {
  const hist = order.history || [];
  const when = (s) => {
    const h = [...hist].reverse().find((x) => x.status === s);
    return h ? { at: h.at, note: h.note } : s === 'paid' ? { at: order.createdAt } : null;
  };
  const cancelled = order.status === 'cancelled';
  const idx = STEPS.findIndex(([k]) => k === order.status);
  const t = order.tracking || {};
  return (
    <div className="tracker">
      {cancelled ? (
        <p className="err">This order was cancelled.{when('cancelled')?.note ? ` ${when('cancelled').note}` : ''}</p>
      ) : (
        <ol className="track">
          {STEPS.map(([k, label], i) => {
            const w = when(k);
            return (
              <li key={k} className={i < idx ? 'done' : i === idx ? 'done current' : ''}>
                <strong>{label}</strong>
                {w && i <= idx && <span className="muted">{fmt(w.at, true)}{w.note ? ` · ${w.note}` : ''}</span>}
              </li>
            );
          })}
        </ol>
      )}
      {!cancelled && (t.courier || t.trackingId ? (
        <p className="shipinfo">
          Shipped with <strong>{t.courier || 'our courier'}</strong>
          {t.trackingId && <> · Tracking ID <strong>{t.trackingId}</strong></>}
          {t.url && <> · <a href={t.url} target="_blank" rel="noopener noreferrer">Track shipment</a></>}
          {t.eta && order.status !== 'delivered' && <><br />Expected by {fmt(t.eta)}</>}
        </p>
      ) : order.status === 'paid' && <p className="muted">Courier and tracking details will appear here once your order ships.</p>)}
    </div>
  );
}

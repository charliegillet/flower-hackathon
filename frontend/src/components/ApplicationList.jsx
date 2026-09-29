// Compact list pane — like an inbox folder listing.
export default function ApplicationList({ applications, selectedId, onSelect }) {
  return (
    <div className="list-pane">
      <div className="list-head">Applications</div>
      {applications.length === 0 && <p className="muted padded">No applications yet.</p>}
      {applications.map((a) => (
        <button
          key={a._id}
          className={`list-item ${a._id === selectedId ? 'active' : ''}`}
          onClick={() => onSelect(a._id)}
        >
          <div className="list-item-top">
            <strong>{a.applicant.name || `Applicant ${a.applicant.code}`}</strong>
            <span className={`badge ${a.status}`}>{a.status}</span>
          </div>
          <div className="list-item-sub">
            ${a.loan.amount.toLocaleString()} · {a.loan.purpose}
          </div>
          <div className="list-item-date">{new Date(a.createdAt).toLocaleDateString()}</div>
        </button>
      ))}
    </div>
  );
}

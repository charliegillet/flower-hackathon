export default function ApplicationList({ applications, onSelect }) {
  if (applications.length === 0) {
    return <p className="muted">No applications yet.</p>;
  }
  return (
    <div className="card">
      <h2>Applications</h2>
      <table>
        <thead>
          <tr>
            <th>Applicant</th>
            <th>Loan</th>
            <th>Status</th>
            <th>Submitted</th>
          </tr>
        </thead>
        <tbody>
          {applications.map((a) => (
            <tr key={a._id} onClick={() => onSelect(a._id)}>
              <td>{a.applicant.name}</td>
              <td>
                ${a.loan.amount.toLocaleString()} · {a.loan.purpose}
              </td>
              <td>
                <span className={`badge ${a.status}`}>{a.status}</span>
              </td>
              <td>{new Date(a.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

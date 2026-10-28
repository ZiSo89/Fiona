import { Download, LockKeyhole } from 'lucide-react';
import { overviewCsv } from '../trackerModel.js';

function downloadCsv(month, teams) {
  const url = URL.createObjectURL(new Blob([overviewCsv(month, teams)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `fiona-pontoi-${month}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function AdminOverview({ month, monthTitle, teams, loading, onSelectTeam }) {
  const totals = teams.reduce((sum, team) => ({
    points: sum.points + team.points,
    pending: sum.pending + team.pendingCount,
    locked: sum.locked + (team.paymentLock?.locked ? 1 : 0),
  }), { points: 0, pending: 0, locked: 0 });

  return (
    <section className="admin-overview" aria-labelledby="admin-overview-title">
      <div className="summary-heading">
        <div>
          <p className="eyebrow">ΔΙΑΧΕΙΡΙΣΤΗΣ</p>
          <h2 id="admin-overview-title">Όλα τα συνεργεία · {monthTitle}</h2>
          <p className="admin-overview-note">
            {teams.length} συνεργεία · {totals.points} πόντοι · {totals.pending} εκκρεμή · {totals.locked}/{teams.length} εγκεκριμένα
          </p>
        </div>
        <button type="button" className="toolbar-button" onClick={() => downloadCsv(month, teams)} disabled={!teams.length} aria-label="Εξαγωγή CSV για πληρωμή" title="Εξαγωγή CSV για πληρωμή">
          <Download size={16} />
          <span>Εξαγωγή CSV</span>
        </button>
      </div>
      {loading && !teams.length ? <p className="summary-empty">Φόρτωση…</p> : !teams.length ? (
        <p className="summary-empty">Δεν υπάρχουν εργασίες για αυτόν τον μήνα.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Συνεργείο</th>
                <th scope="col">Εργασίες</th>
                <th scope="col">Πόντοι</th>
                <th scope="col">Εκκρεμή</th>
                <th scope="col">Πληρωμή</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((team) => (
                <tr key={`${team.storeId}|${team.teamName}`}>
                  <th scope="row">
                    <button type="button" className="admin-team-link" onClick={() => onSelectTeam(team)}>
                      <strong>{team.teamName}</strong>
                      <small>{team.storeName}</small>
                    </button>
                  </th>
                  <td>{team.jobCount}</td>
                  <td>{team.points}</td>
                  <td className={team.pendingCount ? 'has-pending' : ''}>{team.pendingCount}</td>
                  <td>{team.paymentLock?.locked ? <span className="admin-locked"><LockKeyhole size={13} /> Εγκρίθηκε</span> : 'Ανοιχτός'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

import { WEEKDAYS, monthLabel, tone, formatLate, formatDuration, countChange, percentChange, formatClosed } from './closedTicketFormat.js';

function Kpi({ label, value, note, tone: kind }) {
  return <div className={`kpi kpi-${kind}`}><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}

function ActivityChart({ activity }) {
  const dailyMax = Math.max(1, ...activity.daily.map((item) => item.total));
  const weekdayMax = Math.max(1, ...activity.weekdays.map((item) => item.total));
  const hourlyMax = Math.max(1, ...activity.hours.map((item) => item.total));
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <>
      <section className="stats-section">
        <h3>Ρυθμός ολοκλήρωσης ανά ημέρα</h3>
        {activity.daily.length > 0
          ? <div className="daily-chart" role="img" aria-label="Ολοκληρωμένες εργασίες ανά ημέρα του μήνα">
            {activity.daily.map((item) => (
              <div className="daily-bar-wrap" key={item.date} title={`${item.day}: ${item.total} εργασίες`}>
                <span className="daily-bar-value">{item.total}</span>
                <span className="daily-bar" style={{ height: `${item.total ? Math.max(4, (item.total / dailyMax) * 100) : 0}%` }} />
                <small>{item.day}</small>
              </div>
            ))}
          </div>
          : <p className="chart-empty">Δεν υπάρχουν δεδομένα για αυτόν τον μήνα.</p>}
      </section>

      <section className="stats-section">
        <h3>Κατανομή φόρτου ανά ημέρα εβδομάδας</h3>
        <div className="pattern-list">
          {weekdays.map((weekday) => {
            const total = activity.weekdays.find((item) => item.weekday === weekday)?.total || 0;
            return <div className="pattern-row" key={weekday}>
              <span>{WEEKDAYS[weekday]}</span>
              <div className="distribution-track"><i style={{ width: `${(total / weekdayMax) * 100}%` }} /></div>
              <strong>{total}</strong>
            </div>;
          })}
        </div>
      </section>

      <section className="stats-section">
        <h3>Ώρα ολοκλήρωσης</h3>
        <div className="hour-chart" role="img" aria-label="Ολοκληρωμένες εργασίες ανά ώρα Ελλάδας">
          {activity.hours.map((item) => (
            <div className="hour-bar-wrap" key={item.hour} title={`${String(item.hour).padStart(2, '0')}:00 · ${item.total} εργασίες`}>
              <i style={{ height: `${item.total ? Math.max(5, (item.total / hourlyMax) * 100) : 0}%` }} />
              {item.hour % 3 === 0 && <small>{String(item.hour).padStart(2, '0')}</small>}
            </div>
          ))}
        </div>
        <small className="chart-caption">Ώρα Ελλάδας · οι μηδενικές ώρες εμφανίζονται χωρίς στήλη</small>
      </section>
    </>
  );
}

function DistributionSection({ title, items, labelFor }) {
  const max = Math.max(1, ...items.map((item) => item.total));
  return (
    <section className="stats-section">
      <h3>{title}</h3>
      {items.length === 0 && <p className="chart-empty">Δεν υπάρχουν διαθέσιμα στοιχεία.</p>}
      {items.map((item, index) => (
        <div className="distribution-row" key={`${labelFor(item)}:${index}`}>
          <div className="distribution-head"><strong>{labelFor(item)}</strong><span>{item.total} · {item.sharePercent}%</span></div>
          <div className="distribution-track" role="img" aria-label={`${labelFor(item)}: ${item.total} εργασίες, ${item.sharePercent}%`}>
            <i style={{ width: `${(item.total / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </section>
  );
}

export function StatsSections({ stats, stores }) {
  const workPercent = stats.totals.onTimePercent;
  const callPercent = stats.firstCall.onTimePercent;
  const callJudged = stats.firstCall.onTime + stats.firstCall.late;
  const previous = stats.comparison.previous;

  return (
    <>
      <div className="kpi-grid">
        <Kpi label="Ολοκληρώθηκαν" value={stats.totals.total} note={countChange(stats.totals.total, previous.total)} tone="none" />
        <Kpi label="Εντός προθεσμίας" value={workPercent === null ? '—' : `${workPercent}%`} note={`${stats.totals.onTime} από ${stats.totals.onTime + stats.totals.late} · ${percentChange(workPercent, previous.onTimePercent)}`} tone={tone(workPercent)} />
        <Kpi label="Ολοκλήρωση εκτός ορίου" value={stats.totals.late} note={`${stats.totals.unknown ? `${stats.totals.unknown} χωρίς προθεσμία · ` : ''}${countChange(stats.totals.late, previous.late)}`} tone={stats.totals.late ? 'bad' : 'good'} />
        <Kpi label="1η κλήση εντός 4ώρου" value={callPercent === null ? '—' : `${callPercent}%`} note={callJudged ? `${stats.firstCall.onTime} από ${callJudged} · ${percentChange(callPercent, previous.firstCallPercent)}` : 'Συγκεντρώνονται δεδομένα'} tone={tone(callPercent)} />
        <Kpi label="Μέσος χρόνος ολοκλήρωσης" value={formatDuration(stats.duration.meanHours)} note={`Προηγ. μήνας: ${formatDuration(previous.meanDurationHours)}`} tone="none" />
        <Kpi label="Διάμεσος χρόνος ολοκλήρωσης" value={formatDuration(stats.duration.medianHours)} note={`Προηγ. μήνας: ${formatDuration(previous.medianDurationHours)}`} tone="none" />
      </div>

      <section className="comparison-note">
        <strong>Σύγκριση με {monthLabel(stats.comparison.previousMonth)}</strong>
        <span>Ολοκληρώθηκαν: {stats.totals.total} τώρα · {previous.total} προηγουμένως</span>
        <span>Εντός προθεσμίας: {workPercent === null ? '—' : `${workPercent}%`} τώρα · {previous.onTimePercent === null ? '—' : `${previous.onTimePercent}%`} προηγουμένως</span>
        <span>Μέσος χρόνος: {formatDuration(stats.duration.meanHours)} τώρα · {formatDuration(previous.meanDurationHours)} προηγουμένως</span>
      </section>

      <ActivityChart activity={stats.activity} />

      <section className="stats-section">
        <h3>Χρόνος από δημιουργία έως ολοκλήρωση</h3>
        <div className="duration-summary">
          <span>Μέσος χρόνος<strong>{formatDuration(stats.duration.meanHours)}</strong></span>
          <span>Διάμεσος χρόνος<strong>{formatDuration(stats.duration.medianHours)}</strong></span>
          <span>Μετρήσιμες<strong>{stats.duration.total} / {stats.totals.total}</strong></span>
        </div>
        {stats.duration.missing > 0 && <small className="chart-caption">{stats.duration.missing} εργασίες δεν έχουν έγκυρες ημερομηνίες δημιουργίας και ολοκλήρωσης.</small>}
      </section>

      <DistributionSection title="Κατανομή ανά υπηρεσία" items={stats.services} labelFor={(item) => item.service} />
      <DistributionSection
        title="Κατανομή ανά κατάστημα"
        items={stats.stores}
        labelFor={(item) => stores.find((store) => store.storeId === item.storeId)?.storeName || item.store}
      />

      <section className="stats-section">
        <h3>Κατανομή ανά συνεργείο</h3>
        {stats.teams.map((team) => (
          <div key={`${team.storeId}:${team.team}`} className="team-row">
            <div className="team-row-head"><strong>{team.team} · {stores.find((store) => store.storeId === team.storeId)?.storeName || team.storeId}</strong><span>{team.total} εργασίες · {team.sharePercent}%</span></div>
            <div className="stack-bar" role="img" aria-label={`${team.onTime} εντός, ${team.late} εκτός, ${team.unknown} άγνωστα`}>
              <span className="seg-good" style={{ flexGrow: team.onTime }} />
              <span className="seg-bad" style={{ flexGrow: team.late }} />
              <span className="seg-none" style={{ flexGrow: team.unknown }} />
            </div>
            <small>Προθεσμία: {team.onTimePercent === null ? 'χωρίς επαρκή δεδομένα' : `${team.onTimePercent}% εντός`} · {team.late} εκπρόθεσμες</small>
          </div>
        ))}
      </section>

      <section className="stats-section">
        <h3>Εκπρόθεσμες εργασίες με τη μεγαλύτερη καθυστέρηση</h3>
        {stats.lateTickets.length === 0 && <p className="chart-empty">Δεν υπάρχουν εργασίες με καταγεγραμμένη καθυστέρηση.</p>}
        {stats.lateTickets.map((ticket) => (
          <div className="late-card" key={`${ticket.storeId}:${ticket.orderId}`}>
            <div>
              <strong>{ticket.customer || `#${ticket.serviceOrderId}`}</strong>
              <span>{ticket.service} · {ticket.team} · {stores.find((store) => store.storeId === ticket.storeId)?.storeName || ticket.storeId}</span>
              {ticket.address && <small>{ticket.address}</small>}
              <small>Ολοκληρώθηκε {formatClosed(ticket.closedAt)}</small>
            </div>
            <b>{formatLate(ticket.hoursLate)}</b>
          </div>
        ))}
      </section>

    </>
  );
}

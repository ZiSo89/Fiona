import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ArrowDownUp,
  CircleAlert,
  Clock,
  Cloud,
  Copy,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  MapPin,
  MessageSquareText,
  Moon,
  Pencil,
  RefreshCw,
  Save,
  Search,
  Sun,
  Trophy,
  X,
} from 'lucide-react';

const categories = [
  { id: 'ftth_installation', name: 'FTTH Installation', points: 50 },
  { id: 'soho_installation_impairment', name: 'SOHO Installation / Impairment', points: 20 },
  { id: 'fwa_installation', name: 'FWA Installation', points: 35 },
  { id: 'dth_tv_impairment', name: 'DTH TV Impairment', points: 18 },
  { id: 'dth_tv_installation', name: 'DTH TV Installation', points: 25 },
  { id: 'all_impairments', name: 'All Impairments', points: 15 },
  { id: 'copper_installation', name: 'Copper Installation', points: 15 },
  { id: 'canceled_eon_installation', name: 'Canceled / EON Installation', points: 5 },
];

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Athens',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const monthFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Athens',
  year: 'numeric',
  month: '2-digit',
});
const visibleDateFormatter = new Intl.DateTimeFormat('el-GR', {
  timeZone: 'Europe/Athens',
  day: 'numeric',
  month: 'long',
  weekday: 'long',
});
const timeFormatter = new Intl.DateTimeFormat('el-GR', {
  timeZone: 'Europe/Athens',
  hour: '2-digit',
  minute: '2-digit',
});
const commentTimeFormatter = new Intl.DateTimeFormat('el-GR', {
  timeZone: 'Europe/Athens',
  dateStyle: 'short',
  timeStyle: 'short',
});

function profileKey(profile) {
  return `${profile.storeId}::${profile.teamName}`;
}

function readTrackerView() {
  try {
    const saved = JSON.parse(localStorage.getItem('project-tracker-view') || '{}');
    return {
      profileKey: typeof saved.profileKey === 'string' ? saved.profileKey : '',
      month: /^\d{4}-\d{2}$/.test(saved.month) ? saved.month : '',
      date: /^\d{4}-\d{2}-\d{2}$/.test(saved.date) ? saved.date : '',
    };
  } catch {
    return { profileKey: '', month: '', date: '' };
  }
}

function currentAthensDate() {
  const parts = Object.fromEntries(dayFormatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function currentAthensMonth() {
  return monthFormatter.format(new Date());
}

function getMonthTitle(month) {
  const formatted = new Intl.DateTimeFormat('el-GR', {
    timeZone: 'Europe/Athens',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${month}-01T12:00:00.000Z`));
  return `${formatted.charAt(0).toLocaleUpperCase('el-GR')}${formatted.slice(1)}`;
}

function shiftMonth(month, amount) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber - 1 + amount, 1)).toISOString().slice(0, 7);
}

function calendarCells(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  const firstDay = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const dayCount = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const total = Math.ceil((firstDay + dayCount) / 7) * 7;
  return Array.from({ length: total }, (_, index) => {
    const day = index - firstDay + 1;
    return day < 1 || day > dayCount ? null : `${month}-${String(day).padStart(2, '0')}`;
  });
}

function formatDate(value) {
  return visibleDateFormatter.format(new Date(`${value}T12:00:00.000Z`));
}

function formatTime(value) {
  return timeFormatter.format(new Date(value));
}

function jobLabel(job) {
  return job.fionaCategory || job.sourceLabel || job.categoryName || 'Αντιστοίχιση κατηγορίας';
}

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : commentTimeFormatter.format(date);
}

async function trackerRequest(path, options = {}) {
  const response = await fetch(`/api/tracker${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Request failed (${response.status})`);
  return data;
}

function App() {
  const today = currentAthensDate();
  const [savedView] = useState(readTrackerView);
  const [profiles, setProfiles] = useState([]);
  const [selectedProfileKey, setSelectedProfileKey] = useState(savedView.profileKey);
  const [month, setMonth] = useState(savedView.month || currentAthensMonth());
  const [selectedDate, setSelectedDate] = useState(savedView.date || today);
  const [monthData, setMonthData] = useState(null);
  const [dayJobs, setDayJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [drafts, setDrafts] = useState({});
  const [savingJobId, setSavingJobId] = useState('');
  const [jobDetails, setJobDetails] = useState({});
  const [loadingJobDetails, setLoadingJobDetails] = useState({});
  const [dayFilter, setDayFilter] = useState('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [newestFirst, setNewestFirst] = useState(false);
  const [editingJobId, setEditingJobId] = useState('');
  const [copiedJobId, setCopiedJobId] = useState('');
  const [darkMode, setDarkMode] = useState(() => {
    try {
      return localStorage.getItem('project-tracker-theme') === 'dark';
    } catch {
      return false;
    }
  });

  const selectedProfile = profiles.find((profile) => profileKey(profile) === selectedProfileKey)
    || profiles[0]
    || null;
  const selectedKey = selectedProfile ? profileKey(selectedProfile) : '';
  const editorMatchesProfile = Boolean(editor && selectedProfile
    && editor.storeId === selectedProfile.storeId && editor.teamName === selectedProfile.teamName);

  useEffect(() => {
    let active = true;
    const loadProfiles = async () => {
      try {
        const data = await trackerRequest('/profiles');
        if (active) {
          setProfiles(data.profiles || []);
          setError('');
        }
      } catch (requestError) {
        if (active) setError(requestError.message);
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadProfiles();
    const timer = window.setInterval(() => {
      void loadProfiles();
      setRefreshTick((tick) => tick + 1);
    }, 60000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!profiles.length) return;
    if (!profiles.some((profile) => profileKey(profile) === selectedProfileKey)) {
      setSelectedProfileKey(profileKey(profiles[0]));
    }
  }, [profiles, selectedProfileKey]);

  useEffect(() => {
    if (!selectedProfile) return;
    try {
      localStorage.setItem('project-tracker-view', JSON.stringify({
        profileKey: selectedKey,
        month,
        date: selectedDate,
      }));
    } catch {
      // Local storage may be disabled; the current view still works.
    }
  }, [selectedKey, month, selectedDate]);

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
    try {
      localStorage.setItem('project-tracker-theme', darkMode ? 'dark' : 'light');
    } catch {
      // Local storage may be disabled; the current page theme still works.
    }
  }, [darkMode]);

  useEffect(() => {
    if (!selectedProfile) {
      setMonthData(null);
      setDayJobs([]);
      setEditor(null);
      return undefined;
    }
    let active = true;
    setRefreshing(true);
    setDayJobs([]);
    const query = new URLSearchParams({
      month,
      storeId: selectedProfile.storeId,
      teamName: selectedProfile.teamName,
    });
    trackerRequest(`/month?${query}`)
      .then((data) => { if (active) { setMonthData(data); setError(''); } })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setRefreshing(false); });
    return () => { active = false; };
  }, [selectedKey, month, refreshTick]);

  useEffect(() => {
    if (!selectedProfile || !selectedDate.startsWith(month)) {
      setSelectedDate(month === currentAthensMonth() ? today : `${month}-01`);
      return undefined;
    }
    let active = true;
    const query = new URLSearchParams({
      date: selectedDate,
      storeId: selectedProfile.storeId,
      teamName: selectedProfile.teamName,
    });
    trackerRequest(`/day?${query}`)
      .then((data) => { if (active) setDayJobs(data.jobs || []); })
      .catch((requestError) => { if (active) setError(requestError.message); });
    return () => { active = false; };
  }, [selectedKey, selectedDate, month, refreshTick]);

  useEffect(() => {
    if (!selectedProfile) return undefined;
    let active = true;
    trackerRequest('/session')
      .then((data) => {
        if (active && data.editor?.storeId === selectedProfile.storeId
          && data.editor?.teamName === selectedProfile.teamName) setEditor(data.editor);
        else if (active) setEditor(null);
      })
      .catch(() => { if (active) setEditor(null); });
    return () => { active = false; };
  }, [selectedKey]);

  useEffect(() => {
    setJobDetails({});
    setLoadingJobDetails({});
  }, [selectedKey]);

  useEffect(() => {
    setDayFilter('all');
    setSearchTerm('');
    setSearchOpen(false);
    setEditingJobId('');
  }, [selectedKey, selectedDate]);

  useEffect(() => {
    if (!editorMatchesProfile || !selectedProfile || !dayJobs.length) return undefined;
    let active = true;
    const pendingJobs = dayJobs.filter((job) => {
      const jobKey = `${job.storeId}::${job.orderId}`;
      return !jobDetails[jobKey] && !loadingJobDetails[jobKey];
    });
    if (!pendingJobs.length) return undefined;

    setLoadingJobDetails((current) => ({
      ...current,
      ...Object.fromEntries(pendingJobs.map((job) => [`${job.storeId}::${job.orderId}`, true])),
    }));
    pendingJobs.forEach((job) => {
      const jobKey = `${job.storeId}::${job.orderId}`;
      const query = new URLSearchParams({ storeId: job.storeId, teamName: job.teamName });
      trackerRequest(`/jobs/${encodeURIComponent(job.orderId)}/details?${query}`)
        .then((response) => {
          if (active) setJobDetails((current) => ({ ...current, [jobKey]: response.details }));
        })
        .catch((requestError) => { if (active) setError(requestError.message); })
        .finally(() => {
          if (active) setLoadingJobDetails((current) => ({ ...current, [jobKey]: false }));
        });
    });
    return () => { active = false; };
  }, [editorMatchesProfile, selectedKey, dayJobs]);

  const handleLogin = async (event) => {
    event.preventDefault();
    if (!selectedProfile) return;
    setLoginError('');
    try {
      const data = await trackerRequest('/login', {
        method: 'POST',
        body: JSON.stringify({
          storeId: selectedProfile.storeId,
          teamName: selectedProfile.teamName,
          password,
        }),
      });
      setEditor({ storeId: data.storeId, teamName: data.teamName });
      setLoginOpen(false);
      setPassword('');
    } catch (requestError) {
      setLoginError(requestError.message);
    }
  };

  const handleLogout = async () => {
    await trackerRequest('/logout', { method: 'POST' }).catch(() => {});
    setEditor(null);
    setJobDetails({});
    setLoadingJobDetails({});
  };

  const saveCorrection = async (job) => {
    const draft = drafts[job.orderId] || { categoryId: job.categoryId || '', pointsOverride: job.pointsOverride ?? '' };
    setSavingJobId(job.orderId);
    try {
      await trackerRequest(`/jobs/${encodeURIComponent(job.orderId)}`, {
        method: 'PUT',
        body: JSON.stringify({
          storeId: selectedProfile.storeId,
          teamName: selectedProfile.teamName,
          categoryId: draft.categoryId || null,
          pointsOverride: draft.pointsOverride === '' ? null : Number(draft.pointsOverride),
        }),
      });
      setDrafts((current) => {
        const next = { ...current };
        delete next[job.orderId];
        return next;
      });
      setRefreshTick((tick) => tick + 1);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingJobId('');
    }
  };

  const copyOrderCode = async (jobId, code) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedJobId(jobId);
      setTimeout(() => setCopiedJobId((current) => (current === jobId ? '' : current)), 1500);
    } catch {
      setError('Η αντιγραφή απέτυχε.');
    }
  };

  const filterOptions = [...dayJobs.reduce((map, job) => map.set(jobLabel(job), (map.get(jobLabel(job)) || 0) + 1), new Map())];
  const needle = searchTerm.trim().toLocaleLowerCase('el-GR');
  const visibleJobs = dayJobs
    .filter((job) => dayFilter === 'all' || jobLabel(job) === dayFilter)
    .filter((job) => {
      if (!needle) return true;
      const details = jobDetails[`${job.storeId}::${job.orderId}`] || {};
      return [jobLabel(job), details.serviceOrderId, details.customerName, details.address, details.latestComment?.text]
        .filter(Boolean).join(' ').toLocaleLowerCase('el-GR').includes(needle);
    })
    .sort((a, b) => (newestFirst ? 1 : -1) * (new Date(b.closedAt) - new Date(a.closedAt)));
  const activeJobId = visibleJobs.some((job) => job.orderId === editingJobId) ? editingJobId : visibleJobs[0]?.orderId;

  const dayMap = new Map((monthData?.days || []).map((day) => [day.date, day]));
  const cells = calendarCells(month);
  const weekRows = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
  const selectedDay = dayMap.get(selectedDate) || { jobCount: dayJobs.length, points: dayJobs.reduce((sum, job) => sum + job.points, 0) };

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/tracker/" aria-label="Fiona Team Points home">
          <span className="brand-mark"><CalendarDays size={17} strokeWidth={2.2} /></span>
          <span className="brand-copy">
            <span className="brand-kicker">FIONA / FIELD WORK</span>
            <span className="brand-title">Team points</span>
          </span>
        </a>
        <div className="topbar-controls">
          {selectedProfile && (
            <label className="profile-select-wrap">
              <span>ΣΥΝΕΡΓΕΙΟ</span>
              <select
                aria-label="Επιλογή συνεργείου"
                value={selectedKey}
                onChange={(event) => setSelectedProfileKey(event.target.value)}
              >
                {profiles.map((profile) => (
                  <option key={profileKey(profile)} value={profileKey(profile)}>
                    {profile.storeName} · {profile.teamName}
                  </option>
                ))}
              </select>
            </label>
          )}
          {editorMatchesProfile ? (
            <button className="toolbar-button editor-on" type="button" onClick={handleLogout} title="Αποσύνδεση επεξεργασίας">
              <LogOut size={16} />
              <span>Επεξεργασία</span>
            </button>
          ) : (
            <button className="toolbar-button" type="button" onClick={() => { setLoginError(''); setLoginOpen(true); }} disabled={!selectedProfile}>
              <LockKeyhole size={16} />
              <span>Σύνδεση επεξεργασίας</span>
            </button>
          )}
          <button className="icon-button theme-toggle" type="button" onClick={() => setDarkMode((value) => !value)} aria-label={darkMode ? 'Ενεργοποίηση φωτεινού θέματος' : 'Ενεργοποίηση σκοτεινού θέματος'} title="Αλλαγή θέματος">
            {darkMode ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>
      </header>

      <div className="page-heading">
        <div>
          <p className="eyebrow">ΗΜΕΡΟΛΟΓΙΟ ΑΠΟΔΟΣΗΣ</p>
          <h1>{selectedProfile?.teamName || 'Ομάδες Fiona'}</h1>
          <p className="heading-subtitle">{selectedProfile?.storeName || 'Fiona'}{selectedProfile ? ` · ${selectedProfile.jobCount} εργασίες` : ''}</p>
        </div>
        <button className="icon-button refresh-button" type="button" onClick={() => setRefreshTick((tick) => tick + 1)} aria-label="Ανανέωση δεδομένων" title="Ανανέωση">
          <RefreshCw size={17} className={refreshing ? 'spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="notice notice-error" role="status">
          <CircleAlert size={17} />
          <span>{error}</span>
          <button className="notice-dismiss" type="button" onClick={() => setError('')} aria-label="Κλείσιμο"><X size={15} /></button>
        </div>
      )}

      {loading ? (
        <div className="loading-state"><RefreshCw size={18} className="spin" /> Φόρτωση…</div>
      ) : !profiles.length ? (
        <section className="empty-state" aria-live="polite">
          <span className="empty-icon"><Cloud size={24} /></span>
          <h2>Δεν υπάρχουν ολοκληρωμένες εργασίες</h2>
          <p>Τα προφίλ θα εμφανιστούν όταν εισαχθούν οι πρώτες ολοκληρώσεις από τη Fiona.</p>
        </section>
      ) : (
        <>
          <section className="tracker-workspace" aria-label="Ημερολόγιο εργασιών">
            <div className="calendar-panel">
              <div className="month-toolbar">
                <div className="month-navigation">
                  <button className="icon-button month-arrow" type="button" onClick={() => { const next = shiftMonth(month, -1); setMonth(next); setSelectedDate(`${next}-01`); }} aria-label="Προηγούμενος μήνας"><ArrowLeft size={17} /></button>
                  <h2>{getMonthTitle(month)}</h2>
                  <button className="icon-button month-arrow" type="button" onClick={() => { const next = shiftMonth(month, 1); setMonth(next); setSelectedDate(`${next}-01`); }} aria-label="Επόμενος μήνας"><ArrowRight size={17} /></button>
                </div>
                <div className="month-points" aria-label={`${monthData?.totalPoints ?? 0} συνολικοί πόντοι`}>
                  <strong>{monthData?.totalPoints ?? 0}</strong><span>pts</span>
                </div>
              </div>

              <div className="calendar-grid" role="grid" aria-label={getMonthTitle(month)}>
                <div className="weekday-row" role="row">
                  {['ΚΥΡ', 'ΔΕΥ', 'ΤΡΙ', 'ΤΕΤ', 'ΠΕΜ', 'ΠΑΡ', 'ΣΑΒ'].map((weekday) => <span role="columnheader" key={weekday}>{weekday}</span>)}
                </div>
                <div className="calendar-weeks">
                  {weekRows.map((week, weekIndex) => (
                    <div className="calendar-week" role="row" key={`${month}-week-${weekIndex}`}>
                      {week.map((date, dayIndex) => {
                        if (!date) return <span className="calendar-empty" role="gridcell" key={`${weekIndex}-${dayIndex}`} />;
                        const day = dayMap.get(date);
                        const selected = selectedDate === date;
                        return (
                          <button
                            className={`calendar-day${selected ? ' selected' : ''}${date === today ? ' today' : ''}${day?.jobCount ? ' has-work' : ''}`}
                            type="button"
                            role="gridcell"
                            aria-selected={selected}
                            aria-label={`${formatDate(date)}${day?.jobCount ? `, ${day.jobCount} εργασίες, ${day.points} πόντοι` : ''}`}
                            key={date}
                            onClick={() => setSelectedDate(date)}
                          >
                            <span className="day-number">{Number(date.slice(-2))}</span>
                            {day?.jobCount ? <span className="day-points">{day.points} pts</span> : <span className="day-empty-mark" />}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
              <div className="calendar-footer">
                <span><i className="legend-dot" /> Ημέρα με ολοκληρωμένες εργασίες</span>
                <span className="live-state"><span className="live-dot" /> Ενημέρωση σε πραγματικό χρόνο</span>
              </div>
            </div>

            <section className="day-panel" aria-label="Εργασίες επιλεγμένης ημέρας">
              <div className="day-panel-heading">
                <div>
                  <p className="eyebrow">{selectedDate === today ? 'ΣΗΜΕΡΑ' : 'ΗΜΕΡΑ'}</p>
                  <h2>{formatDate(selectedDate)}</h2>
                </div>
                <span className="day-total"><Trophy size={16} />{selectedDay.points}<small>pts</small></span>
              </div>
              {dayJobs.length > 0 && (
                <div className="day-toolbar">
                  <div className="day-filters" role="group" aria-label="Φίλτρο τύπου εργασίας">
                    <button type="button" className={`filter-chip${dayFilter === 'all' ? ' active' : ''}`} onClick={() => setDayFilter('all')}>Όλες ({dayJobs.length})</button>
                    {filterOptions.map(([label, count]) => (
                      <button type="button" key={label} className={`filter-chip${dayFilter === label ? ' active' : ''}`} onClick={() => setDayFilter(label)}>{label} ({count})</button>
                    ))}
                  </div>
                  <div className="day-tools">
                    <button type="button" className={`tool-button${searchOpen ? ' active' : ''}`} aria-label="Αναζήτηση" aria-pressed={searchOpen} onClick={() => { setSearchOpen((open) => !open); setSearchTerm(''); }}><Search size={15} /></button>
                    <button type="button" className={`tool-button${newestFirst ? ' active' : ''}`} aria-label={newestFirst ? 'Παλαιότερες πρώτα' : 'Νεότερες πρώτα'} aria-pressed={newestFirst} onClick={() => setNewestFirst((value) => !value)}><ArrowDownUp size={15} /></button>
                  </div>
                </div>
              )}
              {searchOpen && (
                <input className="day-search" type="search" autoFocus placeholder="Αναζήτηση εργασίας…" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
              )}
              <div className="job-list">
                {visibleJobs.length ? visibleJobs.map((job) => {
                  const jobKey = `${job.storeId}::${job.orderId}`;
                  const details = jobDetails[jobKey];
                  const isActive = job.orderId === activeJobId;
                  const draft = drafts[job.orderId] || { categoryId: job.categoryId || '', pointsOverride: job.pointsOverride ?? '' };
                  const isDirty = draft.categoryId !== (job.categoryId || '')
                    || String(draft.pointsOverride) !== String(job.pointsOverride ?? '');
                  return (
                    <article className="job-row" key={`${job.storeId}-${job.orderId}`}>
                      <div className="job-category-line">
                        <span className={`category-marker ${job.mapped ? 'mapped' : 'unmapped'}`} />
                        <h3>{jobLabel(job)}</h3>
                        <span className="job-time"><Clock size={11} />{formatTime(job.closedAt)}</span>
                        {job.mapped ? <span className="job-points">+{job.points} pts</span> : <span className="pending-label">Εκκρεμεί</span>}
                      </div>
                      {editorMatchesProfile && (
                        <>
                          <div className="job-details-panel">
                            {loadingJobDetails[jobKey] ? (
                              <p className="job-details-loading"><LoaderCircle size={14} className="spin" /> Φόρτωση στοιχείων…</p>
                            ) : details ? (
                              <>
                                <div className="job-code-line">
                                  <span className="job-code">{details.serviceOrderId}</span>
                                  <button type="button" className="copy-button" aria-label="Αντιγραφή κωδικού" onClick={() => void copyOrderCode(jobKey, details.serviceOrderId)}>
                                    {copiedJobId === jobKey ? <Check size={12} /> : <Copy size={12} />}
                                  </button>
                                </div>
                                {(details.customerName || details.address) && (
                                  <div className="job-person">
                                    <span className="job-person-label">ΌΝΟΜΑ / ΣΥΝΔΡΟΜΗΤΗΣ</span>
                                    {details.customerName && <strong>{details.customerName}</strong>}
                                    {details.address && <p className="job-address"><MapPin size={12} />{details.address}</p>}
                                  </div>
                                )}
                                {details.latestComment && (
                                  <div className="job-comment">
                                    <span className="job-comment-label"><MessageSquareText size={13} /> Τελευταίο σχόλιο</span>
                                    <blockquote>
                                      <p>{details.latestComment.text}</p>
                                      {details.latestComment.at && <small>{formatDateTime(details.latestComment.at)}</small>}
                                    </blockquote>
                                  </div>
                                )}
                              </>
                            ) : null}
                          </div>
                          {isActive ? (
                            <div className="correction-controls">
                            <label>
                              <span>Κατηγορία</span>
                              <select
                                value={draft.categoryId}
                                onChange={(event) => setDrafts((current) => ({ ...current, [job.orderId]: { ...draft, categoryId: event.target.value } }))}
                              >
                                <option value="">Χωρίς αντιστοίχιση</option>
                                {categories.map((category) => <option value={category.id} key={category.id}>{category.name} · {category.points} pts</option>)}
                              </select>
                            </label>
                            <label className="points-input">
                              <span>Πόντοι override</span>
                              <input
                                type="number"
                                min="0"
                                max="1000"
                                step="1"
                                placeholder={categories.find((category) => category.id === draft.categoryId)?.points ?? '0'}
                                value={draft.pointsOverride}
                                onChange={(event) => setDrafts((current) => ({ ...current, [job.orderId]: { ...draft, pointsOverride: event.target.value } }))}
                              />
                            </label>
                            <button className="save-correction" type="button" disabled={!isDirty || savingJobId === job.orderId} onClick={() => void saveCorrection(job)}>
                              {savingJobId === job.orderId ? <RefreshCw size={15} className="spin" /> : <Save size={15} />}
                              <span>Αποθήκευση</span>
                            </button>
                          </div>
                          ) : (
                            <div className="job-card-footer">
                              <span>Κατηγορία: <strong>{job.categoryName || 'Χωρίς αντιστοίχιση'}</strong></span>
                              <button type="button" className="edit-points-link" onClick={() => setEditingJobId(job.orderId)}>Επεξεργασία πόντων <Pencil size={12} /></button>
                            </div>
                          )}
                        </>
                      )}
                    </article>
                  );
                }) : (
                  <div className="no-jobs">
                    <span className="no-jobs-mark"><CalendarDays size={18} /></span>
                    <p>{dayJobs.length ? 'Καμία εργασία δεν ταιριάζει με τα φίλτρα.' : 'Δεν υπάρχουν εργασίες αυτή την ημέρα.'}</p>
                  </div>
                )}
              </div>
              <div className="day-panel-footer">
                <span>Σύνολο εργασιών ημέρας: <strong>{selectedDay.jobCount}</strong></span>
                <span>Καθαροί πόντοι: <strong className="net-points">{selectedDay.points} pts</strong></span>
              </div>
            </section>
          </section>

          <section className="monthly-summary" aria-labelledby="summary-title">
            <div className="summary-heading">
              <div>
                <p className="eyebrow">ΑΝΑ ΚΑΤΗΓΟΡΙΑ</p>
                <h2 id="summary-title">Μηνιαία σύνοψη</h2>
              </div>
              <div className="summary-total"><strong>{monthData?.totalPoints ?? 0}</strong><span>pts</span></div>
            </div>
            {monthData?.categories?.length ? (
              <div className="summary-list">
                {monthData.categories.map((entry) => (
                  <div className={`summary-row${entry.mapped ? '' : ' is-pending'}`} key={entry.categoryId || 'unmapped'}>
                    <span className="category-marker" />
                    <span className="summary-category">{entry.categoryName}</span>
                    <span className="summary-count">{entry.jobCount} {entry.jobCount === 1 ? 'εργασία' : 'εργασίες'}</span>
                    <strong>{entry.points} pts</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="summary-empty">Δεν έχουν καταγραφεί εργασίες για αυτόν τον μήνα.</p>
            )}
          </section>
        </>
      )}

      {loginOpen && selectedProfile && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setLoginOpen(false); }}>
          <section className="login-modal" role="dialog" aria-modal="true" aria-labelledby="login-title">
            <div className="modal-heading">
              <span className="modal-icon"><LockKeyhole size={19} /></span>
              <button className="icon-button close-modal" type="button" onClick={() => setLoginOpen(false)} aria-label="Κλείσιμο"><X size={18} /></button>
            </div>
            <h2 id="login-title">Σύνδεση επεξεργασίας</h2>
            <p>{selectedProfile.storeName} · {selectedProfile.teamName}</p>
            <form onSubmit={handleLogin}>
              <label className="password-label" htmlFor="team-password">Κωδικός συνεργείου</label>
              <input
                id="team-password"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              {loginError && <p className="login-error" role="alert">{loginError}</p>}
              <button className="login-submit" type="submit"><Check size={16} /> Σύνδεση</button>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

export default App;
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ArrowDownUp,
  CircleAlert,
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
import CategoryPicker from './components/CategoryPicker.jsx';
import { categories, categoryLabel, pointsNote } from './categories.js';
import {
  profileKey,
  jobKey,
  applyJobDraft,
  updateMonthJob,
  scrollToJob,
  readTrackerView,
  currentAthensDate,
  currentAthensMonth,
  getMonthTitle,
  shiftMonth,
  calendarCells,
  formatDate,
  jobLabel,
  formatDateTime,
  trackerRequest,
  jobGreekLabel,
} from './trackerModel.js';

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
  const lastMonthViewRef = useRef('');
  const [error, setError] = useState('');
  const [editor, setEditor] = useState(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginRole, setLoginRole] = useState('editor');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [drafts, setDrafts] = useState({});
  const [savingJobId, setSavingJobId] = useState('');
  const [savingMonthLock, setSavingMonthLock] = useState(false);
  const [jobDetails, setJobDetails] = useState({});
  const [loadingJobDetails, setLoadingJobDetails] = useState({});
  const [dayFilter, setDayFilter] = useState('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [newestFirst, setNewestFirst] = useState(false);
  const [editingJobId, setEditingJobId] = useState('');
  const [pickerJobId, setPickerJobId] = useState('');
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
  const editorIsAdmin = editor?.role === 'admin';
  const editorMatchesProfile = Boolean(editorIsAdmin || (editor && selectedProfile
    && editor.storeId === selectedProfile.storeId && editor.teamName === selectedProfile.teamName));
  const monthLockMatchesView = monthData?.profileKey === selectedKey && monthData?.month === month;
  const monthLocked = Boolean(monthLockMatchesView && monthData?.paymentLock?.locked);
  const canEditCorrections = editorMatchesProfile && (editorIsAdmin || !monthLocked);

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
    // Keep the current list during the periodic refresh so the page height and scroll position stay stable.
    const viewKey = `${selectedKey}|${month}`;
    if (lastMonthViewRef.current !== viewKey) {
      lastMonthViewRef.current = viewKey;
      setDayJobs([]);
    }
    const query = new URLSearchParams({
      month,
      storeId: selectedProfile.storeId,
      teamName: selectedProfile.teamName,
    });
    trackerRequest(`/month?${query}`)
      .then((data) => { if (active) { setMonthData({ ...data, profileKey: selectedKey }); setError(''); } })
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
        if (active && (data.editor?.role === 'admin'
          || (data.editor?.storeId === selectedProfile.storeId
            && data.editor?.teamName === selectedProfile.teamName))) setEditor(data.editor);
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
          role: loginRole,
          password,
        }),
      });
      setEditor(data.editor);
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

  const updateMonthLock = async () => {
    if (!editorIsAdmin || !selectedProfile) return;
    setSavingMonthLock(true);
    try {
      const data = await trackerRequest('/month-lock', {
        method: 'PUT',
        body: JSON.stringify({
          storeId: selectedProfile.storeId,
          teamName: selectedProfile.teamName,
          month,
          locked: !monthLocked,
        }),
      });
      setMonthData((current) => current && current.profileKey === selectedKey && current.month === month
        ? { ...current, paymentLock: data.paymentLock }
        : current);
      setRefreshTick((tick) => tick + 1);
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingMonthLock(false);
    }
  };

  const saveCorrection = async (job) => {
    const key = jobKey(job);
    const draft = drafts[key] || { categoryId: job.categoryId || '' };
    const previousJob = dayJobs.find((entry) => jobKey(entry) === key) || job;
    setSavingJobId(key);
    try {
      const data = await trackerRequest(`/jobs/${encodeURIComponent(job.orderId)}`, {
        method: 'PUT',
        body: JSON.stringify({
          storeId: selectedProfile.storeId,
          teamName: selectedProfile.teamName,
          categoryId: draft.categoryId || null,
          ...(draft.pointsOverride !== undefined ? { pointsOverride: draft.pointsOverride } : {}),
        }),
      });
      setDayJobs((current) => current.map((entry) => (jobKey(entry) === key ? data.job : entry)));
      setMonthData((current) => current?.profileKey === selectedKey && current.month === month
        ? updateMonthJob(current, previousJob, data.job)
        : current);
      setDrafts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      setPickerJobId('');
      scrollToJob(key);
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

  const dayJobsWithDrafts = dayJobs.map((job) => applyJobDraft(job, drafts[jobKey(job)]));
  const liveMonthData = dayJobsWithDrafts.reduce(
    (current, job, index) => updateMonthJob(current, dayJobs[index], job),
    monthData,
  );
  const liveMonthTotal = liveMonthData?.totalPoints ?? 0;
  const filterOptions = [...dayJobsWithDrafts.reduce((map, job) => map.set(jobLabel(job), (map.get(jobLabel(job)) || 0) + 1), new Map())];
  const needle = searchTerm.trim().toLocaleLowerCase('el-GR');
  const visibleJobs = dayJobsWithDrafts
    .filter((job) => dayFilter === 'all' || jobLabel(job) === dayFilter)
    .filter((job) => {
      if (!needle) return true;
      const details = jobDetails[`${job.storeId}::${job.orderId}`] || {};
      return [jobLabel(job), jobGreekLabel(job), details.serviceOrderId, details.customerName, details.address, details.latestComment?.text]
        .filter(Boolean).join(' ').toLocaleLowerCase('el-GR').includes(needle);
    })
    .sort((a, b) => (newestFirst ? 1 : -1) * (new Date(b.closedAt) - new Date(a.closedAt)));
  const activeJobId = visibleJobs.some((job) => jobKey(job) === editingJobId)
    ? editingJobId
    : visibleJobs[0] ? jobKey(visibleJobs[0]) : '';

  const dayMap = new Map((liveMonthData?.days || []).map((day) => [day.date, day]));
  const cells = calendarCells(month);
  const weekRows = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
  const selectedDay = dayMap.get(selectedDate) || { jobCount: dayJobsWithDrafts.length, points: dayJobsWithDrafts.reduce((sum, job) => sum + job.points, 0) };

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
            <button className="toolbar-button editor-on" type="button" onClick={handleLogout} title="Αποσύνδεση">
              <LogOut size={16} />
              <span>Αποσύνδεση</span>
            </button>
          ) : (
            <button className="toolbar-button" type="button" onClick={() => { setLoginError(''); setLoginRole('editor'); setLoginOpen(true); }} disabled={!selectedProfile}>
              <LockKeyhole size={16} />
              <span>Σύνδεση</span>
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
                <div className="month-summary-actions">
                  {monthLocked && (
                    <span className="month-lock-status"><LockKeyhole size={14} /> Κλειδωμένο για πληρωμή</span>
                  )}
                  {editorIsAdmin && (
                    <button
                      className={`month-lock-button${monthLocked ? ' is-locked' : ''}`}
                      type="button"
                      disabled={savingMonthLock || !monthLockMatchesView}
                      onClick={() => void updateMonthLock()}
                    >
                      {savingMonthLock ? <RefreshCw size={14} className="spin" /> : <LockKeyhole size={14} />}
                      {monthLocked ? 'Ξεκλείδωμα' : 'Έγκριση πληρωμής'}
                    </button>
                  )}
                  <div className="month-points" aria-label={`${liveMonthTotal} συνολικοί πόντοι`}>
                    <strong>{liveMonthTotal}</strong><span>pts</span>
                  </div>
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
                  const key = jobKey(job);
                  const details = jobDetails[key];
                  const isActive = key === activeJobId;
                  const originalJob = dayJobs.find((entry) => jobKey(entry) === key) || job;
                  const draft = drafts[key] || { categoryId: job.categoryId || '' };
                  const isDirty = Boolean(draft.categorySelected)
                    || draft.categoryId !== (originalJob.categoryId || '')
                    || (draft.pointsOverride !== undefined && draft.pointsOverride !== originalJob.pointsOverride);
                  const pickerOpen = pickerJobId === key || (!draft.categoryId && !draft.pickerClosed);
                  return (
                    <article className="job-row" key={key} data-job-key={key}>
                      <div className="job-category-line">
                        <span className={`category-marker ${job.mapped ? 'mapped' : 'unmapped'}`} />
                        <h3>{jobLabel(job)}</h3>
                        {job.mapped ? <span className="job-points">+{job.points} pts</span> : <span className="pending-label">Εκκρεμεί</span>}
                      </div>
                      {jobGreekLabel(job) && <p className="job-greek-label">{jobGreekLabel(job)}</p>}
                      {pointsNote(job) && <p className="points-note">{pointsNote(job)}</p>}
                      {editorMatchesProfile && (
                        <>
                          <div className="job-details-panel">
                            {loadingJobDetails[key] ? (
                              <p className="job-details-loading"><LoaderCircle size={14} className="spin" /> Φόρτωση στοιχείων…</p>
                            ) : details ? (
                              <>
                                <div className="job-code-line">
                                  <span className="job-code">{details.serviceOrderId}</span>
                                  <button type="button" className={`copy-button${copiedJobId === key ? ' is-copied' : ''}`} aria-label="Αντιγραφή κωδικού" onClick={() => void copyOrderCode(key, details.serviceOrderId)}>
                                    {copiedJobId === key ? <Check size={12} /> : <Copy size={12} />}
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
                          {canEditCorrections && isActive ? (
                            <div className="correction-controls">
                              <div className="category-current">
                                <span>
                                  {isDirty ? 'Νέα επιλογή' : job.mapped && !job.correctedAt ? 'Αυτόματα' : 'Κατηγορία'}
                                  : <strong>{categoryLabel(draft.categoryId)}</strong>
                                  {!isDirty && job.mapped && !job.correctedAt && <Check size={12} />}
                                </span>
                                {draft.categoryId && (
                                  <button type="button" className="edit-points-link" onClick={() => {
                                    if (pickerJobId === key) scrollToJob(key);
                                    setPickerJobId(pickerJobId === key ? '' : key);
                                  }}>
                                    {pickerJobId === key ? 'Κλείσιμο' : 'Αλλαγή'}
                                  </button>
                                )}
                                {pickerOpen && !draft.categoryId && (
                                  <button
                                    type="button"
                                    className="edit-points-link"
                                    onClick={() => {
                                      setPickerJobId('');
                                      scrollToJob(key);
                                      setDrafts((current) => ({ ...current, [key]: { ...draft, pickerClosed: true } }));
                                    }}
                                  >
                                    Κλείσιμο
                                  </button>
                                )}
                                {!pickerOpen && !draft.categoryId && (
                                  <button
                                    type="button"
                                    className="edit-points-link"
                                    onClick={() => {
                                      setPickerJobId(key);
                                      setDrafts((current) => ({ ...current, [key]: { ...draft, pickerClosed: false } }));
                                    }}
                                  >
                                    Αλλαγή
                                  </button>
                                )}
                              </div>
                              {pickerOpen && (
                                <CategoryPicker
                                  value={draft.categoryId}
                                  current={originalJob.categoryId}
                                  pointsValue={job.points}
                                  onChange={(categoryId) => {
                                    const selectedCategory = categories.find((category) => category.id === categoryId);
                                    setDrafts((current) => ({
                                      ...current,
                                      [key]: {
                                        ...draft,
                                        categoryId,
                                        pointsOverride: selectedCategory?.id === 'cabling_repair' ? selectedCategory.points : null,
                                        categorySelected: true,
                                        pickerClosed: false,
                                      },
                                    }));
                                    setPickerJobId(key);
                                  }}
                                  onPointsChange={(pointsOverride) => {
                                    setDrafts((current) => ({
                                      ...current,
                                      [key]: { ...draft, pointsOverride, categorySelected: true, pickerClosed: false },
                                    }));
                                  }}
                                />
                              )}
                            <button className={`save-correction${isDirty ? ' needs-save' : ''}`} type="button" disabled={!isDirty || savingJobId === key} onClick={() => void saveCorrection(job)}>
                              {savingJobId === key ? <RefreshCw size={15} className="spin" /> : <Save size={15} />}
                              <span>Αποθήκευση</span>
                            </button>
                          </div>
                          ) : canEditCorrections ? (
                            <div className="job-card-footer">
                              <span>Κατηγορία: <strong>{categoryLabel(job.categoryId, job.categoryName)}</strong></span>
                              <button type="button" className="edit-points-link" onClick={() => setEditingJobId(key)}>Επεξεργασία πόντων <Pencil size={12} /></button>
                            </div>
                          ) : monthLocked ? (
                            <div className="job-card-footer">
                              <span>Κατηγορία: <strong>{categoryLabel(job.categoryId, job.categoryName)}</strong></span>
                              <span className="locked-job-label"><LockKeyhole size={12} /> Εγκεκριμένο</span>
                            </div>
                          ) : (
                            <div className="job-card-footer">
                              <span>Κατηγορία: <strong>{categoryLabel(job.categoryId, job.categoryName)}</strong></span>
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
              <div className="summary-total"><strong>{liveMonthTotal}</strong><span>pts</span></div>
            </div>
            {liveMonthData?.categories?.length ? (
              <div className="summary-list">
                {[...liveMonthData.categories].sort((a, b) => b.jobCount - a.jobCount || b.points - a.points).map((entry) => (
                  <div className={`summary-row${entry.mapped ? '' : ' is-pending'}`} key={entry.categoryId || 'unmapped'}>
                    <span className="category-marker" />
                    <span className="summary-category">{categoryLabel(entry.categoryId, entry.categoryName)}</span>
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
            <h2 id="login-title">Σύνδεση</h2>
            <p>{selectedProfile.storeName} · {selectedProfile.teamName}</p>
            <form onSubmit={handleLogin}>
              <label className="password-label" htmlFor="login-role">Τύπος χρήστη</label>
              <select id="login-role" value={loginRole} onChange={(event) => setLoginRole(event.target.value)}>
                <option value="editor">Τεχνικός / συνεργείο</option>
                <option value="admin">Διαχειριστής</option>
              </select>
              <label className="password-label" htmlFor="team-password">
                {loginRole === 'admin' ? 'Κωδικός admin' : 'Κωδικός συνεργείου'}
              </label>
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
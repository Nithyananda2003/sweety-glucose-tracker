import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, CalendarDays, Check, ChevronLeft, ChevronRight, Coffee, Droplet, Heart, Info, LayoutDashboard, List, LoaderCircle, LogOut, Moon, Pencil, Plus, ShieldCheck, Sparkles, Sun, Sunrise, Trash2, X } from 'lucide-react';
import { SLOTS, todayInZone } from '../../shared/domain.js';
import { api } from './api.js';
import ReadingForm from './ReadingForm.jsx';

const slotIcons = [Sunrise, Coffee, Sun, Moon];
const fmt = (date, options = {}) => new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', ...options, timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
const initials = (name) => name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
const reportLabels = { daily: 'Daily', monthToDate: 'Month to date', monthly: 'Previous month' };
function Brand() { return <div className="brand"><span className="brand-mark"><Droplet size={25} strokeWidth={1.8} /><Activity size={18} /></span><span>sweety<span className="brand-dot">.</span></span></div>; }

function Auth({ onAuth }) {
  const [register, setRegister] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setError(''); setBusy(true);
    try { const result = await api(`/auth/${register ? 'register' : 'login'}`, { method: 'POST', body: form }); onAuth(result.user); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  return <main className="auth-page">
    <section className="auth-story"><Brand /><div className="story-copy"><span className="eyebrow light">YOUR EVERYDAY GLUCOSE COMPANION</span><h1>Small check-ins.<br /><em>A clearer picture.</em></h1><p>A little more understanding. A little more peace of mind. Make space for your health, one reading at a time.</p><div className="story-illustration" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><span className="floating-sun"><Sun size={32} /></span><div className="illustration-card"><span><Droplet size={20} /> Today's check-in <Check size={16} /></span><strong>110 <small>mg/dl</small></strong><svg viewBox="0 0 260 65"><path d="M0 48 C25 48 30 15 55 22 S85 62 110 36 S145 10 170 28 S220 45 260 13" fill="none" stroke="#77b5a1" strokeWidth="3" /></svg><span className="illustration-caption">A small step, every day.</span></div><span className="floating-heart"><Heart size={28} /></span></div></div><span className="auth-footer"><ShieldCheck size={16} /> Your readings. Your private space.</span></section>
    <section className="auth-content"><div className="auth-form"><span className="eyebrow">LET'S MAKE HEALTH A HABIT</span><h2>{register ? 'Your fresh start.' : 'Welcome back.'}</h2><p className="muted">{register ? 'Create your account and take the first small step.' : 'A little time for you. Log in to your Sweety space.'}</p><form onSubmit={submit}>
      {register && <label>Your name<input autoComplete="name" value={form.name} maxLength={80} required onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Alex Morgan" /></label>}
      <label>Email address<input type="email" autoComplete="email" value={form.email} maxLength={254} required onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" /></label>
      <label>Password<input type="password" autoComplete={register ? 'new-password' : 'current-password'} value={form.password} minLength={register ? 8 : undefined} required onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={register ? 'At least 8 characters' : 'Enter your password'} /></label>
      {error && <div role="alert" className="error"><Info size={17} />{error}</div>}
      <button className="button primary full" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : null}{register ? 'Create account' : 'Log in'}<ArrowRight size={18} /></button>
    </form><p className="auth-switch">{register ? 'Already have an account?' : 'New to Sweety?'} <button onClick={() => { setRegister(!register); setError(''); }}>{register ? 'Log in' : 'Create an account'}</button></p><div className="demo-hint"><Sparkles size={18} /><div><strong>Just looking around?</strong><p>After running the seed, try <b>demo@sweety.app</b><br />with password <b>SweetyDemo123!</b></p><button onClick={() => { setRegister(false); setForm({ name: '', email: 'demo@sweety.app', password: 'SweetyDemo123!' }); setError(''); }}>Fill demo credentials <ArrowRight size={14} /></button></div></div></div><p className="auth-bottom">Made for your everyday wellbeing <Heart size={13} /></p></section>
  </main>;
}

function Chart({ trend, selectedDate, loading }) {
  const [hover, setHover] = useState(null);
  const width = 660; const height = 190; const left = 39; const right = 15; const top = 15; const bottom = 30;
  const values = trend.map((point) => point.average);
  const low = values.length ? Math.max(0, Math.floor((Math.min(...values) - 20) / 20) * 20) : 60;
  const high = values.length ? Math.max(low + 60, Math.ceil((Math.max(...values) + 20) / 20) * 20) : 180;
  const lastDay = Number(selectedDate.slice(-2));
  const plotHeight = height - top - bottom;
  const x = (day) => left + ((day - 1) / Math.max(1, lastDay - 1)) * (width - left - right);
  const y = (value) => top + ((high - value) / (high - low)) * plotHeight;
  const points = trend.map((point) => ({ ...point, x: x(Number(point.date.slice(-2))), y: y(point.average) }));
  const line = points.map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`).join(' ');
  const area = points.length ? `${line} L${points.at(-1).x},${height - bottom} L${points[0].x},${height - bottom} Z` : '';
  const ticks = [...new Set([1, Math.max(1, Math.round(lastDay / 3)), Math.max(1, Math.round(lastDay * 2 / 3)), lastDay])];
  return <div className="chart-wrap">
    {loading ? <div className="chart-empty"><LoaderCircle className="spin" size={23} />Loading your trend…</div> : !points.length ? <div className="chart-empty"><Activity size={28} /><strong>Your story starts with one reading</strong><span>Add a reading to see your monthly trend here.</span></div> : <>
      <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Daily average glucose for ${fmt(selectedDate, { month: 'long', day: undefined })}, from ${low} to ${high} mg/dl`}>
        <defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5d9f87" stopOpacity=".2" /><stop offset="100%" stopColor="#5d9f87" stopOpacity=".01" /></linearGradient></defs>
        {[0, 1, 2, 3].map((step) => { const value = Math.round(high - step * (high - low) / 3); return <g key={step}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke="#e6ece7" strokeDasharray="4 5" /><text x={left - 12} y={y(value) + 4} textAnchor="end">{value}</text></g>; })}
        <path d={area} fill="url(#chart-fill)" /><path d={line} fill="none" stroke="#287763" strokeWidth="2.5" strokeLinejoin="round" />
        {points.map((point) => <circle tabIndex="0" key={point.date} cx={point.x} cy={point.y} r={hover?.date === point.date ? 5 : 3.5} fill="#fff" stroke="#287763" strokeWidth="2" onMouseEnter={() => setHover(point)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(point)} onBlur={() => setHover(null)}><title>{fmt(point.date)}: {point.average.toFixed(1)} mg/dl ({point.count} readings)</title></circle>)}
        {ticks.map((day) => <text key={day} x={x(day)} y={height - 6} textAnchor="middle">{String(day).padStart(2, '0')} {fmt(selectedDate, { day: undefined, month: 'short' })}</text>)}
      </svg>
      <div className="chart-legend"><span className="legend-dot" />{hover ? `${fmt(hover.date)} · ${hover.average.toFixed(1)} mg/dl · ${hover.count} readings` : 'Daily average'}<span className="chart-unit">mg/dl</span></div>
    </>}
  </div>;
}

function ReadingTable({ rows, onEdit, onDelete, empty = 'No readings here yet. Your next check-in is a fresh start.' }) {
  return !rows.length ? <div className="table-empty"><Droplet size={26} /><p>{empty}</p></div> : <div className="table-scroll"><table><thead><tr><th>Date</th><th>Time slot</th><th>Glucose level</th><th className="actions-heading">Actions</th></tr></thead><tbody>{rows.map((row) => {
    const index = SLOTS.findIndex((slot) => slot.key === row.slot); const Icon = slotIcons[index];
    return <tr key={row.id}><td className="date-cell">{fmt(row.date, { year: 'numeric' })}</td><td><span className="slot-label"><Icon size={17} />{SLOTS[index].label}{index === 0 && <span className="fasting">Fasting</span>}</span></td><td><span className="table-value">{row.value}</span><span className="unit"> mg/dl</span></td><td><div className="row-actions"><button className="icon-button" aria-label={`Edit ${SLOTS[index].label} reading on ${row.date}`} onClick={() => onEdit(row)}><Pencil size={16} /></button><button className="icon-button danger" aria-label={`Delete ${SLOTS[index].label} reading on ${row.date}`} onClick={() => onDelete(row)}><Trash2 size={16} /></button></div></td></tr>;
  })}</tbody></table></div>;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [config, setConfig] = useState(null);
  const [bootError, setBootError] = useState('');
  const [view, setView] = useState('overview');
  const [date, setDate] = useState(todayInZone());
  const [reports, setReports] = useState(null);
  const [reportType, setReportType] = useState('daily');
  const [list, setList] = useState({ readings: [], page: 1, pages: 0, total: 0 });
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [help, setHelp] = useState(false);
  const today = config?.today || todayInZone();
  const retryBoot = useCallback(async () => {
    setBooting(true); setBootError('');
    try {
      const settings = await api('/config'); setConfig(settings); setDate(settings.today);
      try { const result = await api('/auth/me'); setUser(result.user); }
      catch (error) { if (error.status !== 401) throw error; }
    } catch (error) { setBootError(error.message); }
    finally { setBooting(false); }
  }, []);
  useEffect(() => { retryBoot(); }, [retryBoot]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true); setError(''); setReports(null);
    const query = new URLSearchParams({ page: String(page), limit: view === 'readings' ? '12' : '5' });
    if (filter === 'day' && view === 'readings') { query.set('from', date); query.set('to', date); }
    Promise.all([api(`/reports?date=${date}`), api(`/readings?${query}`)])
      .then(([reports, list]) => { if (active) { setReports(reports); setList(list); } })
      .catch((error) => { if (active) { setError(error.message); if (error.status === 401) setUser(null); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user, date, page, view, filter, revision]);
  const closeForm = useCallback(() => setEditing(null), []);
  const refresh = (message) => { setRevision((value) => value + 1); setNotice(message); };
  async function save(body) {
    await api(editing.id ? `/readings/${editing.id}` : '/readings', { method: editing.id ? 'PUT' : 'POST', body });
    setEditing(null); setDate(body.date); refresh(editing.id ? 'Your reading has been updated.' : 'Reading saved. One small step for you.');
  }
  async function remove() {
    setDeletingBusy(true);
    try { await api(`/readings/${deleting.id}`, { method: 'DELETE' }); setDeleting(null); if (list.readings.length === 1 && page > 1) setPage(page - 1); refresh('Reading deleted.'); }
    catch (error) { setDeleting(null); setError(error.message); }
    finally { setDeletingBusy(false); }
  }
  async function logout() {
    try { await api('/auth/logout', { method: 'POST' }); setUser(null); setReports(null); setList({ readings: [], page: 1, total: 0, pages: 0 }); setEditing(null); setDeleting(null); setView('overview'); setPage(1); setError(''); }
    catch (error) { setError(error.message); }
  }
  function changeDate(value) {
    if (!value || value > today || value < '1900-01-01') return;
    setDate(value); setPage(1);
  }
  function shiftDate(offset) { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + offset); changeDate(d.toISOString().slice(0, 10)); }
  function navigate(next) { setView(next); setPage(1); setFilter('all'); }
  if (booting) return <div className="boot"><Brand /><LoaderCircle className="spin" size={25} /><span>Opening your space…</span></div>;
  if (bootError) return <div className="boot"><Brand /><p role="alert">{bootError}</p><button className="button primary" onClick={retryBoot}>Try again</button></div>;
  if (!user) return <Auth onAuth={(user) => { setUser(user); setDate(today); }} />;
  const report = reports?.[reportType];
  const daily = reports?.daily;
  const complete = daily?.count || 0;
  const currentMonth = fmt(date, { month: 'long', year: 'numeric', day: undefined });
  const dateLabel = date === today ? 'Today' : fmt(date, { weekday: 'long', month: undefined, day: undefined });
  return <div className="app-shell">
    <aside className="sidebar"><Brand /><div className="space-label">YOUR HEALTH SPACE</div><nav aria-label="Main navigation">{[
      ['overview', LayoutDashboard, 'Overview'], ['readings', List, 'My readings'], ['reports', BarChart3, 'Reports'],
    ].map(([key, Icon, label]) => <button key={key} className={view === key ? 'nav-item active' : 'nav-item'} onClick={() => navigate(key)} aria-current={view === key ? 'page' : undefined}><Icon size={19} />{label}{view === key && <span className="nav-dot" />}</button>)}</nav>
      <div className="sidebar-note"><span className="note-heart"><Heart size={21} /></span><h3>A little care,<br />every single day.</h3><p>Small habits help you understand your health better.</p><span className="note-sprout" aria-hidden="true">✳</span></div>
      <div className="sidebar-bottom"><button className="help-link" onClick={() => setHelp(true)}><Info size={17} /> A little guidance <ArrowUpRight size={15} /></button><div className="profile"><span className="avatar">{initials(user.name)}</span><div><strong>{user.name}</strong><span>Your personal account</span></div><button className="icon-button" onClick={logout} aria-label="Log out"><LogOut size={17} /></button></div></div>
    </aside>
    <div className="main-shell"><header className="topbar"><span className="breadcrumb">Your space <ChevronRight size={13} /><strong>{view === 'overview' ? 'Overview' : view === 'readings' ? 'My readings' : 'Reports'}</strong></span><span className="private-label"><ShieldCheck size={15} /> Just for you</span></header>
      <main className="main-content">
        <div className="page-heading"><div><span className="eyebrow"><span className="tiny-sun">✦</span> ONE READING AT A TIME</span><h1>{view === 'overview' ? 'Your day, at a glance.' : view === 'readings' ? 'Your readings, all together.' : 'A clearer picture of you.'}</h1><p>{view === 'overview' ? `Hello, ${user.name.split(' ')[0]}. A small check-in goes a long way.` : view === 'readings' ? 'A simple record of the little steps you take each day.' : 'Find the patterns in your daily and monthly readings.'}</p></div><button className="button primary add-button" onClick={() => setEditing({ slot: SLOTS.find((slot) => !daily?.readings.some((r) => r.slot === slot.key))?.key || 'morning' })}><Plus size={18} />Add reading</button></div>
        <div className="date-toolbar"><div className="selected-day"><span className="date-icon"><CalendarDays size={18} /></span><strong>{dateLabel}</strong><span className="date-separator" /><span>{fmt(date, { weekday: 'short', year: 'numeric' })}</span></div><div className="date-controls"><button className="icon-button" aria-label="Previous day" onClick={() => shiftDate(-1)} disabled={date <= '1900-01-01'}><ChevronLeft size={17} /></button><label className="date-input-label"><span className="sr-only">Selected date</span><input type="date" aria-label="Selected date" value={date} max={today} min="1900-01-01" onChange={(e) => changeDate(e.target.value)} /></label><button className="icon-button" aria-label="Next day" disabled={date >= today} onClick={() => shiftDate(1)}><ChevronRight size={17} /></button>{date !== today && <button className="text-button" onClick={() => changeDate(today)}>Today</button>}</div></div>
        {error && <div className="error page-error" role="alert"><Info size={17} />{error}<button onClick={() => setRevision((v) => v + 1)}>Try again</button></div>}
        {view !== 'readings' && <>
          <div className="report-switch-row"><div className="segmented" aria-label="Report period">{Object.entries(reportLabels).map(([key, label]) => <button key={key} className={reportType === key ? 'selected' : ''} onClick={() => setReportType(key)} aria-pressed={reportType === key}>{label}</button>)}</div><span className="report-range">{report ? reportType === 'daily' ? fmt(report.from, { year: 'numeric' }) : `${fmt(report.from)} – ${fmt(report.to, { year: 'numeric' })}` : 'Loading report…'}</span></div>
          <div className="stats-grid" aria-busy={loading}>
            <div className="stat-card stat-average"><div className="stat-title">Average glucose<span className="stat-symbol"><Activity size={18} /></span></div><div className="stat-number">{report?.average !== null && report?.average !== undefined ? report.average.toFixed(1) : '—'} <span>mg/dl</span></div><span className="stat-caption">Your {reportType === 'daily' ? 'daily' : 'period'} average</span><svg className="mini-spark" viewBox="0 0 120 36" aria-hidden="true"><path d="M1 30L15 20L29 24L43 9L57 16L71 8L85 15L100 5L118 10" fill="none" stroke="currentColor" strokeWidth="2" /></svg></div>
            <div className="stat-card"><div className="stat-title">Highest reading<span className="stat-symbol peach"><ArrowUpRight size={18} /></span></div><div className="stat-number">{report?.highest ?? '—'} <span>mg/dl</span></div><span className="stat-caption">The high point of your {reportType === 'daily' ? 'day' : 'period'}</span></div>
            <div className="stat-card"><div className="stat-title">Lowest reading<span className="stat-symbol blue"><ArrowDownRight size={18} /></span></div><div className="stat-number">{report?.lowest ?? '—'} <span>mg/dl</span></div><span className="stat-caption">The low point of your {reportType === 'daily' ? 'day' : 'period'}</span></div>
            <div className="stat-card"><div className="stat-title">Readings logged<span className="stat-symbol sand"><Droplet size={18} /></span></div><div className="stat-number">{report?.count ?? '—'} {reportType === 'daily' && <span>/ 4</span>}</div><span className="stat-caption">{reportType === 'daily' ? `${4 - complete} ${4 - complete === 1 ? 'check-in' : 'check-ins'} left for this day` : 'Little moments of care'}</span></div>
          </div>
          {report && report.count === 0 && <div className="empty-report"><Sparkles size={19} /><span>No readings for this period yet. Add your first check-in whenever you're ready.</span></div>}
          <div className="middle-grid"><section className="panel trend-panel"><div className="panel-heading"><div><h2>Your glucose story</h2><p>Daily averages · {currentMonth}</p></div><span className="soft-badge"><span />Month to date</span></div><Chart trend={reports?.trend || []} selectedDate={date} loading={loading} /><div className="chart-foot"><Info size={14} /><span>Every reading is a piece of your bigger picture.</span></div></section>
          <section className="panel checkin-panel"><div className="panel-heading"><div><h2>{date === today ? "Today's" : 'Daily'} check-ins</h2><p>A little rhythm for your day</p></div><span className="completion">{complete}<span>/4</span></span></div><div className="progress-track"><div style={{ width: `${complete * 25}%` }} /></div><div className="slot-list">{SLOTS.map((slot, index) => {
            const reading = daily?.readings.find((row) => row.slot === slot.key); const Icon = slotIcons[index];
            return <button key={slot.key} className={`slot-row ${reading ? 'logged' : ''}`} onClick={() => setEditing(reading || { slot: slot.key })} disabled={loading}><span className={`slot-icon slot-${index}`}><Icon size={19} /></span><span className="slot-text"><strong>{slot.label}</strong><small>{index === 0 ? 'Fasting' : 'Post-meal'}</small></span>{reading ? <span className="slot-result">{reading.value}<small> mg/dl</small><Check size={14} /></span> : <span className="slot-add"><Plus size={16} /> Add</span>}</button>;
          })}</div></section></div>
        </>}
        <section className="panel readings-panel"><div className="panel-heading"><div><h2>{view === 'readings' ? 'Reading history' : view === 'reports' ? 'Daily reading details' : 'Recent readings'}<span className="count-badge">{view === 'reports' ? complete : list.total}</span></h2><p>{view === 'reports' ? `Each check-in for ${fmt(date, { year: 'numeric' })}` : 'Your small steps, in one place'}</p></div>{view === 'overview' ? <button className="text-button" onClick={() => navigate('readings')}>View all readings <ArrowRight size={15} /></button> : view === 'readings' ? <select aria-label="Filter readings" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}><option value="all">All dates</option><option value="day">Selected date</option></select> : <span className="soft-badge">{fmt(date)}</span>}</div>
          {loading ? <div className="table-empty"><LoaderCircle className="spin" size={22} /><span>Loading your readings…</span></div> : error ? <div className="table-empty">Your readings couldn't be loaded. Please try again.</div> : <ReadingTable rows={view === 'reports' ? daily?.readings || [] : list.readings} onEdit={setEditing} onDelete={setDeleting} />}
          {view === 'readings' && list.pages > 0 && <div className="pagination"><span>{list.total} readings · Page {page} of {list.pages}</span><div><button className="button secondary small" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}><ChevronLeft size={15} />Previous</button><button className="button secondary small" disabled={page >= list.pages || loading} onClick={() => setPage(page + 1)}>Next<ChevronRight size={15} /></button></div></div>}
        </section>
        <footer className="page-footer"><span><Heart size={13} /> A little care goes a long way.</span><span>Sweety is a personal log, not medical advice.</span></footer>
      </main>
    </div>
    {editing && <ReadingForm reading={editing} date={date} today={today} onSave={save} onClose={closeForm} />}
    {deleting && <ConfirmDelete reading={deleting} busy={deletingBusy} onCancel={() => setDeleting(null)} onDelete={remove} />}
    {notice && <div className="toast" role="status"><span><Check size={17} /></span>{notice}<button className="icon-button" aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={16} /></button></div>}
    {help && <Guidance onClose={() => setHelp(false)} timezone={config?.timezone} />}
  </div>;
}

function Dialog({ children, title, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.querySelector('button')?.focus();
    const listener = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const buttons = ref.current.querySelectorAll('button:not(:disabled)');
        if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons[buttons.length - 1]?.focus(); }
        else if (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]) { event.preventDefault(); buttons[0]?.focus(); }
      }
    };
    document.addEventListener('keydown', listener);
    return () => { document.removeEventListener('keydown', listener); previous?.focus(); };
  }, [onClose]);
  return <div className="modal-backdrop"><section ref={ref} role="dialog" aria-modal="true" aria-labelledby="dialog-title" className="modal"><h2 id="dialog-title">{title}</h2>{children}</section></div>;
}
function ConfirmDelete({ reading, onCancel, onDelete, busy }) {
  return <Dialog title="Delete this reading?" onClose={() => { if (!busy) onCancel(); }}><p className="muted">The {SLOTS.find((slot) => slot.key === reading.slot).label.toLowerCase()} reading of <strong>{reading.value} mg/dl</strong> on {fmt(reading.date)} will be removed. This cannot be undone.</p><div className="form-actions"><button className="button secondary" onClick={onCancel} disabled={busy}>Keep reading</button><button className="button delete" onClick={onDelete} disabled={busy}>{busy ? 'Deleting…' : 'Delete reading'}</button></div></Dialog>;
}
function Guidance({ onClose, timezone }) {
  return <Dialog title="A little guidance" onClose={onClose}><div className="guidance-copy"><p>Log up to four readings each day: morning (fasting), after breakfast, after lunch, and after dinner. Use the timing recommended by your care team.</p><p>Select a date to view or update an earlier day. Each time slot can have one whole-number reading between 40 and 600 mg/dl.</p><p><strong>Daily</strong> shows the selected date. <strong>Month to date</strong> starts on the first of that month. <strong>Previous month</strong> covers the full month before it.</p><p>Dates use <strong>{timezone}</strong>. Values are a personal record; Sweety does not interpret results or replace your clinician's advice.</p></div><button className="button primary full" onClick={onClose}>Got it <Check size={17} /></button></Dialog>;
}

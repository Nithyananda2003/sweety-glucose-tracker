import { useEffect, useState } from 'react';
import {
  Activity,
  BarChart3,
  CalendarDays,
  Droplet,
  Heart,
  Info,
  LoaderCircle,
  LogOut,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { api } from './api.js';
import { SLOTS } from '../../shared/domain.js';
import Chart from './GlucoseChart.jsx';

const labels = { daily: 'Daily', monthToDate: 'Month to date', monthly: 'Previous month' };
const format = (date) =>
  new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));

export default function DoctorDashboard({ user, today, timezone, onLogout, logoutError }) {
  const [patients, setPatients] = useState([]);
  const [patientId, setPatientId] = useState('');
  const [date, setDate] = useState(today);
  const [period, setPeriod] = useState('daily');
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api('/doctor/patients')
      .then(({ patients }) => {
        if (!active) return;
        setPatients(patients);
        setPatientId((current) =>
          patients.some((p) => String(p.id) === current) ? current : String(patients[0]?.id || ''),
        );
        setLoading(false);
      })
      .catch((error) => {
        if (active) {
          setError(error.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [retry]);
  useEffect(() => {
    let active = true;
    setReport(null);
    if (!patientId) return;
    setLoading(true);
    setError('');
    api(`/doctor/patients/${patientId}/reports?date=${date}`)
      .then((data) => {
        if (active) setReport(data);
      })
      .catch((error) => {
        if (active) setError(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [patientId, date, retry]);
  const patient = patients.find((patient) => String(patient.id) === patientId);
  const selected = report?.[period];
  return (
    <div className="app-shell doctor-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Droplet size={25} />
            <Activity size={18} />
          </span>
          <span>
            sweety<span className="brand-dot">.</span>
          </span>
        </div>
        <div className="space-label">YOUR DOCTOR WORKSPACE</div>
        <nav aria-label="Doctor navigation">
          <span className="nav-item active">
            <Users size={19} />
            Patient reports
            <span className="nav-dot" />
          </span>
        </nav>
        <div className="sidebar-note">
          <ShieldCheck className="note-heart" size={23} />
          <h3>
            Care, with
            <br />a clearer picture.
          </h3>
          <p>View the reports shared by patients assigned to you.</p>
        </div>
        <div className="sidebar-bottom">
          <div className="profile">
            <span className="avatar">DR</span>
            <div>
              <strong>{user.name}</strong>
              <span>Doctor · read-only access</span>
            </div>
            <button className="icon-button" aria-label="Log out" onClick={onLogout}>
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="breadcrumb">
            Doctor workspace <strong>Patient reports</strong>
          </span>
          <span className="private-label">
            <ShieldCheck size={15} />
            Assigned patients only
          </span>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">A LITTLE CONTEXT FOR BETTER CARE</span>
              <h1>Your patients, at a glance.</h1>
              <p>Daily and monthly reports, in one private workspace.</p>
            </div>
            <span className="soft-badge">
              <ShieldCheck size={13} />
              Read-only access
            </span>
          </div>
          <div className="doctor-toolbar">
            <label>
              Assigned patient
              <select
                aria-label="Assigned patient"
                value={patientId}
                onChange={(event) => setPatientId(event.target.value)}
                disabled={!patients.length}
              >
                {!patients.length && <option value="">No assigned patients</option>}
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.name} · {patient.email}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Report date
              <input
                type="date"
                value={date}
                max={today}
                min="1900-01-01"
                onChange={(event) => {
                  if (event.target.value >= '1900-01-01' && event.target.value <= today)
                    setDate(event.target.value);
                }}
              />
            </label>
            <button
              className="button secondary"
              onClick={() => setRetry((value) => value + 1)}
              disabled={loading}
            >
              Refresh reports
            </button>
          </div>
          {(error || logoutError) && (
            <div className="error page-error" role="alert">
              <Info size={17} />
              {error || logoutError}
              <button onClick={() => setRetry((value) => value + 1)}>Try again</button>
            </div>
          )}
          {!patients.length && !loading && !error ? (
            <section className="panel doctor-empty">
              <Users size={35} />
              <h2>No patients assigned yet</h2>
              <p>
                Your assigned patients will appear here. Contact the app owner to set up an
                assignment.
              </p>
            </section>
          ) : (
            <>
              {patient && (
                <div className="doctor-patient-heading">
                  <span className="avatar">{patient.name[0]}</span>
                  <div>
                    <strong>{patient.name}</strong>
                    <span>{patient.email}</span>
                  </div>
                  <span className="muted">
                    <CalendarDays size={14} />
                    {format(date)}
                  </span>
                </div>
              )}
              <div className="report-switch-row">
                <div className="segmented" aria-label="Report period">
                  {Object.entries(labels).map(([key, label]) => (
                    <button
                      key={key}
                      className={period === key ? 'selected' : ''}
                      onClick={() => setPeriod(key)}
                      aria-pressed={period === key}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <span className="report-range">
                  {selected
                    ? `${format(selected.from)} – ${format(selected.to)}`
                    : 'Loading report…'}
                </span>
              </div>
              <div className="stats-grid" aria-busy={loading}>
                {[
                  [
                    'Average glucose',
                    selected?.average == null ? '—' : selected.average.toFixed(1),
                    Activity,
                  ],
                  ['Highest reading', selected?.highest ?? '—', BarChart3],
                  ['Lowest reading', selected?.lowest ?? '—', Droplet],
                  ['Readings logged', selected?.count ?? '—', CalendarDays],
                ].map(([label, value, Icon], index) => (
                  <div key={label} className={`stat-card ${index === 0 ? 'stat-average' : ''}`}>
                    <div className="stat-title">
                      {label}
                      <span className="stat-symbol">
                        <Icon size={18} />
                      </span>
                    </div>
                    <div className="stat-number">
                      {value} {index < 3 && <span>mg/dl</span>}
                    </div>
                    <span className="stat-caption">{labels[period]} report</span>
                  </div>
                ))}
              </div>
              {selected?.count === 0 && (
                <div className="empty-report">
                  <Info size={18} />
                  No readings for this period yet. Check another date or return after the next
                  check-in.
                </div>
              )}
              <section className="panel trend-panel doctor-trend">
                <div className="panel-heading">
                  <div>
                    <h2>Glucose over the month</h2>
                    <p>Daily averages through {format(date)}</p>
                  </div>
                  <span className="soft-badge">Month to date</span>
                </div>
                <Chart trend={report?.trend || []} selectedDate={date} loading={loading} />
              </section>
              <section className="panel readings-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Daily reading details</h2>
                    <p>Each check-in for {format(date)}</p>
                  </div>
                  <span className="soft-badge">{report?.daily.count ?? 0} / 4 readings</span>
                </div>
                {loading ? (
                  <div className="table-empty">
                    <LoaderCircle className="spin" size={22} />
                    Loading patient readings…
                  </div>
                ) : !report?.daily.readings.length ? (
                  <div className="table-empty">
                    <Droplet size={26} />
                    <p>No readings recorded for this date.</p>
                  </div>
                ) : (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Time slot</th>
                          <th>Glucose level</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.daily.readings.map((reading) => (
                          <tr key={reading.id}>
                            <td>{format(reading.date)}</td>
                            <td>
                              {SLOTS.find((slot) => slot.key === reading.slot).label}
                              {reading.slot === 'morning' ? ' (fasting)' : ''}
                            </td>
                            <td>
                              <span className="table-value">{reading.value}</span>
                              <span className="unit"> mg/dl</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
          <footer className="page-footer">
            <span>
              <Heart size={13} />A little care goes a long way.
            </span>
            <span>Calendar timezone: {timezone}</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

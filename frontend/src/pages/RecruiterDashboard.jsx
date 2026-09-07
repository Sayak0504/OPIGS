import { useState, useEffect } from 'react';
import { api, getName, logout } from '../api';

const STAGES = [
  { key: 'applied',      label: 'Applied',      color: '#3B82F6' },
  { key: 'shortlisted',  label: 'Shortlisted',  color: '#F59E0B' },
  { key: 'interviewing', label: 'Interviewing', color: '#10B981' },
];

export default function RecruiterDashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState('all');

  const load = () =>
    api('/api/recruiter/applicants')
      .then(setData)
      .catch((e) => setErr(e.message));

  useEffect(() => { load(); }, []);

  const setStatus = async (id, status) => {
    try {
      await api(`/api/recruiter/applicants/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  if (err) return <div style={S.page}><div style={S.err}>{err}</div><button onClick={logout} style={S.logout}>Log out</button></div>;
  if (!data) return <div style={S.page}>Loading...</div>;

  const shown = filter === 'all'
    ? data.applicants
    : data.applicants.filter((a) => a.status === filter);

  return (
    <div style={S.page}>
      <div style={S.bar}>
        <div>
          <h1 style={S.h1}>{data.company}</h1>
          <div style={S.sub}>Recruiter portal · {getName()}</div>
        </div>
        <button onClick={logout} style={S.logout}>Log out</button>
      </div>

      <div style={S.stats}>
        {STAGES.map((s) => (
          <div key={s.key} style={S.stat}>
            <div style={{ fontSize: 26, fontWeight: 700, color: s.color }}>
              {data.applicants.filter((a) => a.status === s.key).length}
            </div>
            <div style={S.statLabel}>{s.label}</div>
          </div>
        ))}
        <div style={S.stat}>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#111827' }}>{data.jobs.length}</div>
          <div style={S.statLabel}>Open roles</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {['all', ...STAGES.map((s) => s.key)].map((k) => (
          <button key={k} onClick={() => setFilter(k)}
            style={{ ...S.chip, backgroundColor: filter === k ? '#2563EB' : '#fff',
                     color: filter === k ? '#fff' : '#374151' }}>
            {k === 'all' ? 'All' : STAGES.find((s) => s.key === k).label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div style={S.empty}>
          {data.jobs.length === 0
            ? 'No job postings exist for your company yet. Ask the placement cell to add one.'
            : 'No applicants in this stage.'}
        </div>
      ) : shown.map((a) => (
        <div key={a.application_id} style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#111827' }}>{a.name}</div>
              <div style={S.meta}>
                {a.roll_number} · {a.program || 'program not set'} · CGPA {a.cgpa || '—'} · class of {a.passing_year || '—'}
              </div>
              <div style={{ ...S.meta, marginTop: 4 }}>
                Applied for <strong>{a.job_role}</strong> · 📄 {a.cv_name}
              </div>
            </div>

            <select value={a.status} onChange={(e) => setStatus(a.application_id, e.target.value)} style={S.select}>
              {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>

          <button
            onClick={() => setOpen(open === a.application_id ? null : a.application_id)}
            style={S.toggle}>
            {open === a.application_id ? '▾ Hide profile' : '▸ View skills and projects'}
          </button>

          {open === a.application_id && (
            <div style={S.detail}>
              <div style={S.label}>Technical skills</div>
              <div style={S.text}>{a.tech_skills || 'Not listed'}</div>

              <div style={{ ...S.label, marginTop: 12 }}>Core expertise</div>
              <div style={S.text}>{a.core_expertise || 'Not listed'}</div>

              <div style={{ ...S.label, marginTop: 12 }}>Projects ({a.projects.length})</div>
              {a.projects.length === 0 && <div style={S.text}>None listed</div>}
              {a.projects.map((p, i) => (
                <div key={i} style={S.proj}>
                  <div style={{ fontWeight: 600, color: '#111827', fontSize: 14 }}>{p.title}</div>
                  {p.overview && <div style={{ ...S.text, fontStyle: 'italic' }}>{p.overview}</div>}
                  {p.description && <div style={{ ...S.text, whiteSpace: 'pre-wrap' }}>{p.description}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const S = {
  page:   { padding: '36px 40px', maxWidth: 940, margin: '0 auto', fontFamily: '"Inter","Segoe UI",Roboto,sans-serif', textAlign: 'left' },
  bar:    { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  h1:     { margin: 0, fontSize: 26, color: '#111827' },
  sub:    { fontSize: 13, color: '#6B7280', marginTop: 4 },
  logout: { padding: '8px 16px', backgroundColor: '#F3F4F6', color: '#374151', border: '1px solid #D1D5DB', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  stats:  { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 22 },
  stat:   { backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '16px 18px' },
  statLabel: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  chip:   { padding: '6px 14px', border: '1px solid #D1D5DB', borderRadius: 20, cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  card:   { backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 18, marginBottom: 12 },
  meta:   { fontSize: 13, color: '#6B7280', marginTop: 3 },
  select: { padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13, backgroundColor: '#F9FAFB', cursor: 'pointer' },
  toggle: { marginTop: 12, padding: '5px 11px', fontSize: 12.5, backgroundColor: '#EEF2FF', color: '#4F46E5', border: '1px solid #C7D2FE', borderRadius: 5, cursor: 'pointer', fontWeight: 600 },
  detail: { marginTop: 12, paddingTop: 12, borderTop: '1px solid #E5E7EB' },
  label:  { fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  text:   { fontSize: 13.5, color: '#374151', marginTop: 3, lineHeight: 1.55 },
  proj:   { marginTop: 8, padding: '10px 12px', backgroundColor: '#F9FAFB', borderRadius: 7, border: '1px solid #E5E7EB' },
  empty:  { padding: 22, backgroundColor: '#F9FAFB', border: '1px dashed #D1D5DB', borderRadius: 10, color: '#6B7280', fontSize: 14 },
  err:    { padding: 18, backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, color: '#B91C1C', marginBottom: 16 },
};
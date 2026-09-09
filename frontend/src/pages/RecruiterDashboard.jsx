import { useState, useEffect } from 'react';
import { api, getName, logout } from '../api';

const STAGES = [
  { key: 'applied',      label: 'Applied',      color: '#3B82F6' },
  { key: 'shortlisted',  label: 'Shortlisted',  color: '#F59E0B' },
  { key: 'interviewing', label: 'Interviewing', color: '#8B5CF6' },
  { key: 'offered',      label: 'Offered',      color: '#EC4899' },
  { key: 'hired',        label: 'Hired',        color: '#10B981' },
];
const SETTABLE = ['applied', 'shortlisted', 'interviewing'];

const TABS = [
  { key: 'applicants', label: '👤 Applicants' },
  { key: 'postings',   label: '💼 My Postings' },
  { key: 'offers',     label: '🎁 Offers' },
  { key: 'contact',    label: '✉️ Contact Cell' },
];

const BLANK_JOB   = { role: '', ctc: '', deadline: '', location: '', description: '', eligibility: '' };
const BLANK_OFFER = { role: '', ctc: '', location: '', joining_date: '', details: '' };
const BLANK_MSG   = { subject: '', body: '' };

export default function RecruiterDashboard() {
  const [tab, setTab] = useState('applicants');
  const [msg, setMsg] = useState(null);

  const [data, setData] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [offers, setOffers] = useState([]);
  const [threads, setThreads] = useState([]);

  const [openProfile, setOpenProfile] = useState(null);
  const [offerFor, setOfferFor] = useState(null);
  const [offerForm, setOfferForm] = useState(BLANK_OFFER);

  const [jobForm, setJobForm] = useState(BLANK_JOB);
  const [msgForm, setMsgForm] = useState(BLANK_MSG);
  const [filter, setFilter] = useState('all');

  const fail = (e) => setMsg({ kind: 'err', text: e.message });
  const ok   = (t) => setMsg({ kind: 'ok', text: t });

  const loadAll = () => {
    api('/api/recruiter/applicants').then(setData).catch(fail);
    api('/api/jobs').then(setJobs).catch(fail);
    api('/api/recruiter/offers').then(setOffers).catch(fail);
    api('/api/messages').then(setThreads).catch(fail);
  };

  useEffect(() => { loadAll(); }, []);

  const setStatus = async (id, status) => {
    try {
      await api(`/api/recruiter/applicants/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      loadAll();
    } catch (e) { fail(e); }
  };

  const postJob = async () => {
    if (!jobForm.role.trim() || !jobForm.ctc.trim()) {
      return setMsg({ kind: 'err', text: 'Role and CTC are required.' });
    }
    try {
      const r = await api('/api/jobs', { method: 'POST', body: JSON.stringify(jobForm) });
      setJobForm(BLANK_JOB);
      ok(r.message);
      loadAll();
    } catch (e) { fail(e); }
  };

  const removeJob = async (id) => {
    if (!window.confirm('Delete this posting?')) return;
    try { await api(`/api/jobs/${id}`, { method: 'DELETE' }); loadAll(); } catch (e) { fail(e); }
  };

  const sendOffer = async (studentUserId) => {
    if (!offerForm.role.trim() || !offerForm.ctc.trim()) {
      return setMsg({ kind: 'err', text: 'Role and CTC are required on an offer.' });
    }
    try {
      const r = await api('/api/offers', {
        method: 'POST',
        body: JSON.stringify({ ...offerForm, student_user_id: studentUserId }),
      });
      setOfferFor(null);
      setOfferForm(BLANK_OFFER);
      ok(r.message);
      loadAll();
    } catch (e) { fail(e); }
  };

  const sendMessage = async () => {
    if (!msgForm.subject.trim() || !msgForm.body.trim()) {
      return setMsg({ kind: 'err', text: 'Subject and message are required.' });
    }
    try {
      const r = await api('/api/messages', { method: 'POST', body: JSON.stringify(msgForm) });
      setMsgForm(BLANK_MSG);
      ok(r.message);
      loadAll();
    } catch (e) { fail(e); }
  };

  if (!data) return <div style={S.page}>Loading...</div>;

  const shown = filter === 'all' ? data.applicants : data.applicants.filter((a) => a.status === filter);
  const pendingJobs = jobs.filter((j) => j.status === 'pending').length;

  const Pill = ({ status }) => {
    const map = {
      approved: ['#DCFCE7', '#166534'], accepted: ['#DCFCE7', '#166534'],
      pending: ['#FEF3C7', '#92400E'], pending_admin: ['#FEF3C7', '#92400E'],
      rejected: ['#FEE2E2', '#B91C1C'], rejected_by_admin: ['#FEE2E2', '#B91C1C'],
      declined: ['#FEE2E2', '#B91C1C'], closed: ['#E5E7EB', '#374151'],
    };
    const [bg, fg] = map[status] || ['#E5E7EB', '#374151'];
    return <span style={{ ...S.pill, backgroundColor: bg, color: fg }}>{(status || '').replace(/_/g, ' ')}</span>;
  };

  return (
    <div style={S.page}>
      <div style={S.bar}>
        <div>
          <h1 style={S.h1}>{data.company}</h1>
          <div style={S.sub}>Recruiter portal · {getName()}</div>
        </div>
        <button onClick={logout} style={S.logout}>Log out</button>
      </div>

      <div style={S.tabs}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => { setTab(t.key); setMsg(null); }}
            style={{ ...S.tab, backgroundColor: tab === t.key ? '#2563EB' : '#fff', color: tab === t.key ? '#fff' : '#374151' }}>
            {t.label}
            {t.key === 'postings' && pendingJobs > 0 && <span style={S.badge}>{pendingJobs}</span>}
          </button>
        ))}
      </div>

      {msg && (
        <div style={{ ...S.msg,
          backgroundColor: msg.kind === 'err' ? '#FEF2F2' : '#ECFDF5',
          color: msg.kind === 'err' ? '#B91C1C' : '#065F46',
          borderColor: msg.kind === 'err' ? '#FECACA' : '#A7F3D0' }}>{msg.text}</div>
      )}

      {/* ---------- APPLICANTS ---------- */}
      {tab === 'applicants' && (<>
        <div style={{ ...S.stats, gridTemplateColumns: 'repeat(5,1fr)' }}>
          {STAGES.map((s) => (
            <div key={s.key} style={S.stat}>
              <div style={{ fontSize: 25, fontWeight: 700, color: s.color }}>
                {data.applicants.filter((a) => a.status === s.key).length}
              </div>
              <div style={S.statLabel}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {['all', ...STAGES.map((s) => s.key)].map((k) => (
            <button key={k} onClick={() => setFilter(k)}
              style={{ ...S.chip, backgroundColor: filter === k ? '#2563EB' : '#fff', color: filter === k ? '#fff' : '#374151' }}>
              {k === 'all' ? 'All' : STAGES.find((s) => s.key === k).label}
            </button>
          ))}
        </div>

        {shown.length === 0 && (
          <div style={S.empty}>
            {data.jobs.length === 0
              ? 'You have no approved postings yet, so nobody can apply. Add one under My Postings.'
              : 'No applicants in this stage.'}
          </div>
        )}

        {shown.map((a) => (
          <div key={a.application_id} style={S.card}>
            <div style={S.rowTop}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>
                  {a.name}
                  {a.placement_status === 'closed' && (
                    <span style={{ ...S.pill, backgroundColor: '#E5E7EB', color: '#374151', marginLeft: 8 }}>placed elsewhere</span>
                  )}
                </div>
                <div style={S.meta}>{a.roll_number} · {a.program || '—'} · CGPA {a.cgpa || '—'} · {a.passing_year || '—'}</div>
                <div style={{ ...S.meta, marginTop: 3 }}>Applied for <strong>{a.job_role}</strong> · 📄 {a.cv_name}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                {SETTABLE.includes(a.status) ? (
                  <select value={a.status} onChange={(e) => setStatus(a.application_id, e.target.value)} style={S.select}>
                    {SETTABLE.map((k) => <option key={k} value={k}>{STAGES.find((s) => s.key === k).label}</option>)}
                  </select>
                ) : (
                  <Pill status={a.status} />
                )}
                {SETTABLE.includes(a.status) && (
                  <button onClick={() => {
                    if (window.confirm(`Reject ${a.name}? They will be removed from your list.`)) setStatus(a.application_id, 'rejected');
                  }} style={S.danger}>Reject</button>
                )}
              </div>
            </div>

            <div style={{ marginTop: 11, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => setOpenProfile(openProfile === a.application_id ? null : a.application_id)} style={S.subtle}>
                {openProfile === a.application_id ? '▾ Hide profile' : '▸ View profile'}
              </button>
              {a.placement_status !== 'closed' && a.status === 'interviewing' && (
                <button onClick={() => { setOfferFor(offerFor === a.student_user_id ? null : a.student_user_id); setOfferForm({ ...BLANK_OFFER, role: a.job_role }); }} style={S.primarySm}>
                  🎁 Send offer
                </button>
              )}
            </div>

            {openProfile === a.application_id && (
              <div style={S.detail}>
                <div style={S.label}>Technical skills</div>
                <div style={S.text}>{a.tech_skills || 'Not listed'}</div>
                <div style={{ ...S.label, marginTop: 11 }}>Core expertise</div>
                <div style={S.text}>{a.core_expertise || 'Not listed'}</div>
                <div style={{ ...S.label, marginTop: 11 }}>Projects ({a.projects.length})</div>
                {a.projects.length === 0 && <div style={S.text}>None listed</div>}
                {a.projects.map((p, i) => (
                  <div key={i} style={S.proj}>
                    <div style={{ fontWeight: 600, color: '#111827', fontSize: 14 }}>{p.title}</div>
                    {p.overview && <div style={{ ...S.text, fontStyle: 'italic' }}>{p.overview}</div>}
                    {p.description && <div style={S.text}>{p.description}</div>}
                  </div>
                ))}
              </div>
            )}

            {offerFor === a.student_user_id && (
              <div style={{ ...S.detail, backgroundColor: '#F5F3FF', margin: '12px -18px -18px', padding: 18, borderRadius: '0 0 10px 10px' }}>
                <div style={{ fontWeight: 700, color: '#4F46E5', marginBottom: 10 }}>Offer to {a.name}</div>
                <div style={S.grid2}>
                  <div><div style={S.label}>Role *</div>
                    <input value={offerForm.role} onChange={(e) => setOfferForm({ ...offerForm, role: e.target.value })} style={S.input} /></div>
                  <div><div style={S.label}>CTC *</div>
                    <input value={offerForm.ctc} onChange={(e) => setOfferForm({ ...offerForm, ctc: e.target.value })} placeholder="18 LPA" style={S.input} /></div>
                </div>
                <div style={S.grid2}>
                  <div><div style={S.label}>Location</div>
                    <input value={offerForm.location} onChange={(e) => setOfferForm({ ...offerForm, location: e.target.value })} placeholder="Bangalore" style={S.input} /></div>
                  <div><div style={S.label}>Joining</div>
                    <input value={offerForm.joining_date} onChange={(e) => setOfferForm({ ...offerForm, joining_date: e.target.value })} placeholder="July 2027" style={S.input} /></div>
                </div>
                <div style={S.label}>Details</div>
                <textarea value={offerForm.details} onChange={(e) => setOfferForm({ ...offerForm, details: e.target.value })} rows={3}
                  placeholder="Team, bond, relocation, anything the student should know." style={{ ...S.input, resize: 'vertical', fontFamily: 'inherit' }} />
                <div style={S.note}>
                  The placement cell reviews every offer before the student sees it.
                </div>
                <button onClick={() => sendOffer(a.student_user_id)} style={{ ...S.primary, marginRight: 8 }}>Submit offer</button>
                <button onClick={() => setOfferFor(null)} style={S.subtle}>Cancel</button>
              </div>
            )}
          </div>
        ))}
      </>)}

      {/* ---------- POSTINGS ---------- */}
      {tab === 'postings' && (<>
        <div style={S.card}>
          <h2 style={S.h2}>New job posting</h2>
          <p style={S.help}>Goes to the placement cell for approval. Students see it only once approved.</p>
          <div style={S.grid2}>
            <div><div style={S.label}>Role *</div>
              <input value={jobForm.role} onChange={(e) => setJobForm({ ...jobForm, role: e.target.value })} placeholder="Embedded Software Engineer" style={S.input} /></div>
            <div><div style={S.label}>CTC *</div>
              <input value={jobForm.ctc} onChange={(e) => setJobForm({ ...jobForm, ctc: e.target.value })} placeholder="18 LPA" style={S.input} /></div>
          </div>
          <div style={S.grid2}>
            <div><div style={S.label}>Deadline</div>
              <input value={jobForm.deadline} onChange={(e) => setJobForm({ ...jobForm, deadline: e.target.value })} placeholder="2026-10-15" style={S.input} /></div>
            <div><div style={S.label}>Location</div>
              <input value={jobForm.location} onChange={(e) => setJobForm({ ...jobForm, location: e.target.value })} placeholder="Bangalore" style={S.input} /></div>
          </div>
          <div style={S.label}>Role description</div>
          <textarea value={jobForm.description} onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })} rows={3} style={{ ...S.input, resize: 'vertical', fontFamily: 'inherit' }} />
          <div style={S.label}>Eligibility</div>
          <textarea value={jobForm.eligibility} onChange={(e) => setJobForm({ ...jobForm, eligibility: e.target.value })} rows={2} placeholder="CGPA 7+, no active backlogs, ECE/EE/IE" style={{ ...S.input, resize: 'vertical', fontFamily: 'inherit' }} />
          <button onClick={postJob} style={S.primary}>Submit for approval</button>
        </div>

        <div style={S.label}>Your postings ({jobs.length})</div>
        {jobs.length === 0 && <div style={S.empty}>Nothing posted yet.</div>}
        {jobs.map((j) => (
          <div key={j.id} style={S.card}>
            <div style={S.rowTop}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{j.role}</div>
                <div style={S.meta}>{j.ctc} · {j.location || '—'} · deadline {j.deadline || '—'}</div>
              </div>
              <Pill status={j.status} />
            </div>
            {j.reject_reason && <div style={{ ...S.text, color: '#B91C1C' }}><strong>Rejected:</strong> {j.reject_reason}</div>}
            <button onClick={() => removeJob(j.id)} style={{ ...S.danger, marginTop: 10 }}>Delete</button>
          </div>
        ))}
      </>)}

      {/* ---------- OFFERS ---------- */}
      {tab === 'offers' && (<>
        <div style={S.label}>Offers extended ({offers.length})</div>
        {offers.length === 0 && <div style={S.empty}>No offers sent yet. Send one from the Applicants tab.</div>}
        {offers.map((o) => (
          <div key={o.id} style={S.card}>
            <div style={S.rowTop}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{o.student} <span style={{ fontWeight: 400, color: '#6B7280', fontSize: 13 }}>{o.roll_number}</span></div>
                <div style={S.meta}>{o.role} · {o.ctc} · sent {o.created_at?.slice(0, 10)}</div>
              </div>
              <Pill status={o.status} />
            </div>
            {o.admin_reason && <div style={{ ...S.text, color: '#B91C1C' }}><strong>Placement cell:</strong> {o.admin_reason}</div>}
            {o.student_note && <div style={{ ...S.text }}><strong>Student:</strong> {o.student_note}</div>}
          </div>
        ))}
      </>)}

      {/* ---------- CONTACT ---------- */}
      {tab === 'contact' && (<>
        <div style={S.card}>
          <h2 style={S.h2}>Message the placement cell</h2>
          <div style={S.label}>Subject</div>
          <input value={msgForm.subject} onChange={(e) => setMsgForm({ ...msgForm, subject: e.target.value })} placeholder="Interview slot request" style={S.input} />
          <div style={S.label}>Message</div>
          <textarea value={msgForm.body} onChange={(e) => setMsgForm({ ...msgForm, body: e.target.value })} rows={4} style={{ ...S.input, resize: 'vertical', fontFamily: 'inherit' }} />
          <button onClick={sendMessage} style={S.primary}>Send</button>
        </div>

        <div style={S.label}>Your messages ({threads.length})</div>
        {threads.length === 0 && <div style={S.empty}>No messages yet.</div>}
        {threads.map((m) => (
          <div key={m.id} style={S.card}>
            <div style={{ fontWeight: 700, color: '#111827' }}>{m.subject}</div>
            <div style={S.meta}>{m.created_at?.slice(0, 16)}</div>
            <div style={S.text}>{m.body}</div>
            {m.admin_reply
              ? <div style={S.reply}><strong>Placement cell:</strong> {m.admin_reply}</div>
              : <div style={{ ...S.meta, marginTop: 8, fontStyle: 'italic' }}>Awaiting a reply.</div>}
          </div>
        ))}
      </>)}
    </div>
  );
}

const S = {
  page:   { padding: '32px 40px', maxWidth: 920, margin: '0 auto', fontFamily: '"Inter","Segoe UI",Roboto,sans-serif', textAlign: 'left' },
  bar:    { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  h1:     { margin: 0, fontSize: 25, color: '#111827' },
  h2:     { margin: '0 0 8px', fontSize: 17, color: '#111827' },
  sub:    { fontSize: 13, color: '#6B7280', marginTop: 4 },
  help:   { margin: '0 0 14px', fontSize: 13, color: '#6B7280', lineHeight: 1.5 },
  logout: { padding: '8px 16px', backgroundColor: '#F3F4F6', color: '#374151', border: '1px solid #D1D5DB', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  tabs:   { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 },
  tab:    { padding: '8px 14px', border: '1px solid #D1D5DB', borderRadius: 20, cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 },
  badge:  { backgroundColor: '#F59E0B', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700 },
  stats:  { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 18 },
  stat:   { backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '15px 17px' },
  statLabel: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  chip:   { padding: '6px 14px', border: '1px solid #D1D5DB', borderRadius: 20, cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  card:   { backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 18, marginBottom: 12 },
  rowTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  pill:   { padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap' },
  select: { padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13, backgroundColor: '#F9FAFB', cursor: 'pointer' },
  grid2:  { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  input:  { width: '100%', padding: '9px 11px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13.5, boxSizing: 'border-box', outline: 'none', marginBottom: 9, display: 'block' },
  primary:{ padding: '9px 18px', backgroundColor: '#2563EB', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 13.5, cursor: 'pointer' },
  primarySm:{ padding: '7px 14px', backgroundColor: '#4F46E5', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 12.5, cursor: 'pointer' },
  subtle: { padding: '7px 14px', backgroundColor: '#F3F4F6', color: '#4B5563', border: '1px solid #D1D5DB', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 12.5 },
  danger: { padding: '7px 14px', backgroundColor: '#FEE2E2', color: '#DC2626', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 12.5 },
  label:  { fontSize: 11.5, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.4, margin: '14px 0 5px' },
  text:   { fontSize: 13.5, color: '#374151', marginTop: 6, lineHeight: 1.6, whiteSpace: 'pre-wrap' },
  meta:   { fontSize: 12.5, color: '#6B7280', marginTop: 3 },
  detail: { marginTop: 12, paddingTop: 12, borderTop: '1px solid #E5E7EB' },
  proj:   { marginTop: 8, padding: '10px 12px', backgroundColor: '#F9FAFB', borderRadius: 7, border: '1px solid #E5E7EB' },
  reply:  { marginTop: 10, padding: '9px 12px', backgroundColor: '#EFF6FF', borderRadius: 7, fontSize: 13, color: '#1E40AF' },
  note:   { fontSize: 12, color: '#6B7280', margin: '4px 0 12px', fontStyle: 'italic' },
  msg:    { padding: '10px 13px', borderRadius: 8, fontSize: 13, border: '1px solid', marginBottom: 14 },
  empty:  { padding: 18, backgroundColor: '#F9FAFB', border: '1px dashed #D1D5DB', borderRadius: 9, color: '#6B7280', fontSize: 13.5 },
};
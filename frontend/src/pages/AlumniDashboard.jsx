import { useState, useEffect } from 'react';
import { api, getName, logout } from '../api';

const BLANK = { company_name: '', role: '', year: '', rounds: '', questions: '', advice: '', outcome: 'selected' };

export default function AlumniDashboard() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = () => api('/api/experiences').then(setItems).catch((e) => setMsg(e.message));
  useEffect(() => { load(); }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async () => {
    if (!form.company_name.trim() || !form.role.trim() || !form.questions.trim()) {
      setMsg('Company, role and questions are required.');
      return;
    }
    setBusy(true);
    try {
      await api('/api/experiences', { method: 'POST', body: JSON.stringify(form) });
      setForm(BLANK);
      setMsg('Posted. Thanks for helping the juniors.');
      load();
    } catch (e) {
      setMsg(e.message);
    }
    setBusy(false);
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this experience?')) return;
    await api(`/api/experiences/${id}`, { method: 'DELETE' }).catch((e) => setMsg(e.message));
    load();
  };

  const mine = items.filter((i) => i.mine);

  return (
    <div style={S.page}>
      <div style={S.bar}>
        <div>
          <h1 style={S.h1}>Alumni Interview Bank</h1>
          <div style={S.sub}>Signed in as {getName()}</div>
        </div>
        <button onClick={logout} style={S.logout}>Log out</button>
      </div>

      <div style={S.card}>
        <h2 style={S.h2}>Share an interview experience</h2>
        <p style={S.help}>
          Describe the structure and themes of the process. Please don't reproduce
          proprietary test material.
        </p>

        <div style={S.grid2}>
          <div><div style={S.label}>Company *</div>
            <input value={form.company_name} onChange={set('company_name')} placeholder="Samsung R&D" style={S.input} /></div>
          <div><div style={S.label}>Role *</div>
            <input value={form.role} onChange={set('role')} placeholder="Embedded Software Engineer" style={S.input} /></div>
        </div>

        <div style={S.grid3}>
          <div><div style={S.label}>Year</div>
            <input value={form.year} onChange={set('year')} placeholder="2025" style={S.input} /></div>
          <div><div style={S.label}>Rounds</div>
            <input value={form.rounds} onChange={set('rounds')} placeholder="2 technical, 1 HR" style={S.input} /></div>
          <div><div style={S.label}>Outcome</div>
            <select value={form.outcome} onChange={set('outcome')} style={S.input}>
              <option value="selected">Selected</option>
              <option value="rejected">Not selected</option>
              <option value="waitlisted">Waitlisted</option>
            </select></div>
        </div>

        <div style={S.label}>Questions asked *</div>
        <textarea value={form.questions} onChange={set('questions')} rows={5}
          placeholder={'One per line, e.g.\nExplain how an interrupt differs from polling\nDesign a rate limiter\nWalk me through your final year project'}
          style={{ ...S.input, resize: 'vertical', fontFamily: 'inherit' }} />

        <div style={{ ...S.label, marginTop: 10 }}>Advice for juniors</div>
        <textarea value={form.advice} onChange={set('advice')} rows={3}
          placeholder="What you'd prepare differently."
          style={{ ...S.input, resize: 'vertical', fontFamily: 'inherit' }} />

        {msg && <div style={S.msg}>{msg}</div>}

        <button onClick={submit} disabled={busy} style={{ ...S.submit, opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Posting...' : 'Post experience'}
        </button>
      </div>

      <h2 style={{ ...S.h2, marginTop: 30 }}>My contributions ({mine.length})</h2>

      {mine.length === 0 ? (
        <div style={S.empty}>You haven't posted anything yet.</div>
      ) : mine.map((x) => (
        <div key={x.id} style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>
                {x.company_name} — {x.role}
              </div>
              <div style={S.meta}>
                {[x.year, x.rounds, x.outcome].filter(Boolean).join(' · ')}
                {' · '}
                <span style={{ fontWeight: 700, color: x.status === 'approved' ? '#166534' : x.status === 'rejected' ? '#B91C1C' : '#92400E' }}>
                  {x.status === 'approved' ? 'published' : x.status === 'rejected' ? 'rejected' : 'awaiting review'}
                </span>
              </div>
              {x.reject_reason && <div style={{ ...S.text, color: '#B91C1C' }}>Reason: {x.reject_reason}</div>}            </div>
            <button onClick={() => remove(x.id)} style={S.remove}>Delete</button>
          </div>

          <div style={{ ...S.label, marginTop: 12 }}>Questions</div>
          <div style={S.text}>{x.questions}</div>

          {x.advice && (<>
            <div style={{ ...S.label, marginTop: 10 }}>Advice</div>
            <div style={S.text}>{x.advice}</div>
          </>)}
        </div>
      ))}
    </div>
  );
}

const S = {
  page:   { padding: '36px 40px', maxWidth: 820, margin: '0 auto', fontFamily: '"Inter","Segoe UI",Roboto,sans-serif', textAlign: 'left' },
  bar:    { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  h1:     { margin: 0, fontSize: 26, color: '#111827' },
  h2:     { margin: '0 0 6px', fontSize: 18, color: '#111827' },
  sub:    { fontSize: 13, color: '#6B7280', marginTop: 4 },
  help:   { margin: '0 0 16px', fontSize: 13, color: '#6B7280', lineHeight: 1.5 },
  logout: { padding: '8px 16px', backgroundColor: '#F3F4F6', color: '#374151', border: '1px solid #D1D5DB', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  card:   { backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 22, marginBottom: 14 },
  grid2:  { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 },
  grid3:  { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 10 },
  label:  { fontSize: 11.5, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  input:  { width: '100%', padding: '9px 11px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13.5, boxSizing: 'border-box', outline: 'none', marginBottom: 8 },
  submit: { marginTop: 8, padding: '11px 22px', backgroundColor: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  msg:    { marginTop: 10, padding: '9px 12px', backgroundColor: '#EFF6FF', color: '#1E40AF', borderRadius: 6, fontSize: 13 },
  meta:   { fontSize: 13, color: '#6B7280', marginTop: 3 },
  text:   { fontSize: 13.5, color: '#374151', marginTop: 3, lineHeight: 1.6, whiteSpace: 'pre-wrap' },
  remove: { padding: '5px 12px', fontSize: 12, backgroundColor: '#FEE2E2', color: '#DC2626', border: 'none', borderRadius: 5, cursor: 'pointer', fontWeight: 600 },
  empty:  { padding: 20, backgroundColor: '#F9FAFB', border: '1px dashed #D1D5DB', borderRadius: 10, color: '#6B7280', fontSize: 14 },
};
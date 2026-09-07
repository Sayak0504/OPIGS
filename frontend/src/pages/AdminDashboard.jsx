import { useState, useEffect } from 'react';
import { api, apiUpload, getName, logout } from '../api';

export default function AdminDashboard() {
  const [docs, setDocs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);      // { kind: 'ok' | 'err', text: '' }

  const loadDocs = () =>
    api('/api/policy/documents')
      .then((r) => setDocs(r.documents || []))
      .catch((e) => setMsg({ kind: 'err', text: e.message }));

  useEffect(() => { loadDocs(); }, []);

  const upload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setBusy(true);
    setMsg({ kind: 'ok', text: `Reading and indexing ${file.name}. This takes a few seconds...` });

    try {
      const form = new FormData();
      form.append('file', file);
      const res = await apiUpload('/api/policy/upload', form);
      setMsg({ kind: 'ok', text: `Indexed ${res.doc_name} into ${res.chunks} searchable passages.` });
      loadDocs();
    } catch (err) {
      setMsg({ kind: 'err', text: err.message });
    }
    setBusy(false);
    e.target.value = '';        // let the same file be re-picked
  };

  const remove = async (name) => {
    if (!window.confirm(`Remove ${name}? Students will no longer get answers from it.`)) return;
    try {
      await api(`/api/policy/${encodeURIComponent(name)}`, { method: 'DELETE' });
      setMsg({ kind: 'ok', text: `Removed ${name}.` });
      loadDocs();
    } catch (err) {
      setMsg({ kind: 'err', text: err.message });
    }
  };

  return (
    <div style={S.page}>
      <div style={S.bar}>
        <div>
          <h1 style={S.h1}>Placement Cell Dashboard</h1>
          <div style={S.sub}>Signed in as {getName()}</div>
        </div>
        <button onClick={logout} style={S.logout}>Log out</button>
      </div>

      <div style={S.card}>
        <h2 style={S.h2}>Policy Documents</h2>
        <p style={S.help}>
          Upload the placement policy as a PDF. It is split into passages and indexed so the
          student assistant can answer policy questions and cite the exact page. Uploading a
          file with the same name replaces the previous version.
        </p>

        <label style={{ ...S.upload, opacity: busy ? 0.55 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}>
          <input type="file" accept="application/pdf" onChange={upload} disabled={busy} style={{ display: 'none' }} />
          {busy ? 'Indexing...' : '📄 Choose a PDF to upload'}
        </label>

        {msg && (
          <div style={{ ...S.msg, backgroundColor: msg.kind === 'err' ? '#FEF2F2' : '#ECFDF5',
                        color: msg.kind === 'err' ? '#B91C1C' : '#065F46',
                        borderColor: msg.kind === 'err' ? '#FECACA' : '#A7F3D0' }}>
            {msg.text}
          </div>
        )}

        <div style={{ marginTop: 22 }}>
          <div style={S.label}>Indexed documents ({docs.length})</div>

          {docs.length === 0 ? (
            <div style={S.empty}>
              Nothing indexed yet. Until a policy is uploaded, the assistant tells students
              it cannot answer policy questions.
            </div>
          ) : (
            docs.map((d) => (
              <div key={d} style={S.row}>
                <span style={{ fontSize: 14, color: '#111827' }}>📕 {d}</span>
                <button onClick={() => remove(d)} style={S.remove}>Remove</button>
              </div>
            ))
          )}
        </div>
      </div>

      <div style={{ ...S.card, backgroundColor: '#F8FAFC' }}>
        <h2 style={S.h2}>Coming next</h2>
        <p style={S.help}>Offer statistics, branch-wise reporting and company visit trends.</p>
      </div>
    </div>
  );
}

const S = {
  page:   { padding: '36px 40px', maxWidth: 860, margin: '0 auto', fontFamily: '"Inter","Segoe UI",Roboto,sans-serif', textAlign: 'left' },
  bar:    { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  h1:     { margin: 0, fontSize: 26, color: '#111827' },
  sub:    { fontSize: 13, color: '#6B7280', marginTop: 4 },
  logout: { padding: '8px 16px', backgroundColor: '#F3F4F6', color: '#374151', border: '1px solid #D1D5DB', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  card:   { backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 26, marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  h2:     { margin: '0 0 8px', fontSize: 18, color: '#111827' },
  help:   { margin: '0 0 16px', fontSize: 13.5, color: '#6B7280', lineHeight: 1.55 },
  upload: { display: 'inline-block', padding: '11px 20px', backgroundColor: '#2563EB', color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: 14 },
  msg:    { marginTop: 14, padding: '10px 13px', borderRadius: 8, fontSize: 13, border: '1px solid' },
  label:  { fontSize: 12, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  empty:  { padding: '16px', backgroundColor: '#F9FAFB', border: '1px dashed #D1D5DB', borderRadius: 8, fontSize: 13, color: '#6B7280' },
  row:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 14px', backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, marginBottom: 8 },
  remove: { padding: '5px 12px', fontSize: 12, backgroundColor: '#FEE2E2', color: '#DC2626', border: 'none', borderRadius: 5, cursor: 'pointer', fontWeight: 600 },
};
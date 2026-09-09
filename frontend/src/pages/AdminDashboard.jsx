import { useState, useEffect } from 'react';
import { api, apiUpload, getName, logout } from '../api';

const TABS = [
  { key: 'notices',     label: '📌 Notices' },
  { key: 'jobs',        label: '💼 Job Approvals' },
  { key: 'experiences', label: '🎓 Experiences' },
  { key: 'recruiters',  label: '🏢 Recruiters' },
  { key: 'pipeline',    label: '📊 Pipeline' },
  { key: 'offers',      label: '🎁 Offers' },
  { key: 'students',    label: '👥 Students' },
  { key: 'inbox',       label: '✉️ Inbox' },
  { key: 'policy',      label: '📖 Policy Docs' },
];

const BLANK_NOTICE = { title: '', content: '', category: 'update' };

export default function AdminDashboard() {
  const [tab, setTab] = useState('notices');
  const [msg, setMsg] = useState(null);           // { kind, text }

  const [notices, setNotices] = useState([]);
  const [notice, setNotice] = useState(BLANK_NOTICE);

  const [jobs, setJobs] = useState([]);
  const [exps, setExps] = useState([]);
  const [recruiters, setRecruiters] = useState([]);
  const [inbox, setInbox] = useState([]);
  const [offers, setOffers] = useState([]);
  const [students, setStudents] = useState([]);
  const [openStudent, setOpenStudent] = useState(null);
  const [pipeline, setPipeline] = useState([]);
  const [replyFor, setReplyFor] = useState(null);
  const [replyText, setReplyText] = useState('');

  const [docs, setDocs] = useState([]);
  const [busy, setBusy] = useState(false);

  const fail = (e) => setMsg({ kind: 'err', text: e.message });
  const ok2 = (t) => setMsg({ kind: 'ok', text: t });

  const loadAll = () => {
    api('/api/notices').then(setNotices).catch(fail);
    api('/api/admin/jobs').then(setJobs).catch(fail);
    api('/api/admin/experiences').then(setExps).catch(fail);
    api('/api/admin/recruiters').then(setRecruiters).catch(fail);
    api('/api/admin/messages').then(setInbox).catch(fail);
    api('/api/admin/offers').then(setOffers).catch(fail);
    api('/api/admin/students').then(setStudents).catch(fail);
    api('/api/admin/pipeline').then(setPipeline).catch(fail);
    api('/api/policy/documents').then((r) => setDocs(r.documents || [])).catch(fail);
  };

  useEffect(() => { loadAll(); }, []);

  /* ---------- actions ---------- */

  const postNotice = async () => {
    if (!notice.title.trim() || !notice.content.trim()) {
      setMsg({ kind: 'err', text: 'Title and content are required.' });
      return;
    }
    try {
      await api('/api/notices', { method: 'POST', body: JSON.stringify(notice) });
      setNotice(BLANK_NOTICE);
      setMsg({ kind: 'ok', text: 'Notice published.' });
      loadAll();
    } catch (e) { fail(e); }
  };

  const removeNotice = async (id) => {
    if (!window.confirm('Delete this notice?')) return;
    try {
      await api(`/api/notices/${id}`, { method: 'DELETE' });
      loadAll();
    } catch (e) { fail(e); }
  };

  const moderate = async (kind, id, decision) => {
    let reason = '';
    if (decision === 'rejected') {
      reason = window.prompt('Reason for rejection (shown to the poster):') || '';
      if (!reason.trim()) return;
    }
    try {
      await api(`/api/admin/${kind}/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ decision, reason }),
      });
      setMsg({ kind: 'ok', text: `Marked ${decision}.` });
      loadAll();
    } catch (e) { fail(e); }
  };

  const toggleRecruiter = async (id) => {
    try {
      const r = await api(`/api/admin/recruiters/${id}`, { method: 'PATCH' });
      setMsg({ kind: 'ok', text: r.is_verified ? 'Recruiter approved.' : 'Recruiter access revoked.' });
      loadAll();
    } catch (e) { fail(e); }
  };

  const issueReset = async (id, email) => {
    try {
      const r = await api(`/api/admin/issue-reset/${id}`, { method: 'POST' });
      window.prompt(`Give this code to ${email}. Valid ${r.expires_in_minutes} minutes.`, r.token);
    } catch (e) { fail(e); }
  };

  const sendReply = async (id) => {
    if (!replyText.trim()) return;
    try {
      await api(`/api/admin/messages/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ reply: replyText }),
      });
      setReplyFor(null);
      setReplyText('');
      loadAll();
    } catch (e) { fail(e); }
  };

  const uploadPolicy = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true);
    setMsg({ kind: 'ok', text: `Indexing ${file.name}...` });
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await apiUpload('/api/policy/upload', form);
      setMsg({ kind: 'ok', text: `Indexed ${r.doc_name} into ${r.chunks} passages.` });
      loadAll();
    } catch (err) { fail(err); }
    setBusy(false);
    e.target.value = '';
  };

  const removePolicy = async (name) => {
    if (!window.confirm(`Remove ${name}?`)) return;
    try {
      await api(`/api/policy/${encodeURIComponent(name)}`, { method: 'DELETE' });
      loadAll();
    } catch (e) { fail(e); }
  };

  /* ---------- counts for tab badges ---------- */
  const pendingJobs   = jobs.filter((j) => j.status === 'pending').length;
  const pendingExps   = exps.filter((x) => x.status === 'pending').length;
  const pendingRecs   = recruiters.filter((r) => !r.is_verified).length;
  const pendingOffers = offers.filter((o) => o.status === 'pending_admin').length;
  const unread        = inbox.filter((m) => !m.is_read).length;

  const badge = { jobs: pendingJobs, experiences: pendingExps, recruiters: pendingRecs, offers: pendingOffers, inbox: unread };

  const Pill = ({ status }) => (
    <span style={{ ...S.pill,
      backgroundColor: status === 'approved' ? '#DCFCE7' : status === 'rejected' ? '#FEE2E2' : '#FEF3C7',
      color:           status === 'approved' ? '#166534' : status === 'rejected' ? '#B91C1C' : '#92400E' }}>
      {status}
    </span>
  );

  return (
    <div style={S.page}>
      <div style={S.bar}>
        <div>
          <h1 style={S.h1}>Placement Cell Dashboard</h1>
          <div style={S.sub}>Signed in as {getName()}</div>
        </div>
        <button onClick={logout} style={S.logout}>Log out</button>
      </div>

      <div style={S.tabs}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => { setTab(t.key); setMsg(null); }}
            style={{ ...S.tab,
              backgroundColor: tab === t.key ? '#2563EB' : '#fff',
              color: tab === t.key ? '#fff' : '#374151' }}>
            {t.label}
            {badge[t.key] > 0 && <span style={S.badge}>{badge[t.key]}</span>}
          </button>
        ))}
      </div>

      {msg && (
        <div style={{ ...S.msg,
          backgroundColor: msg.kind === 'err' ? '#FEF2F2' : '#ECFDF5',
          color:           msg.kind === 'err' ? '#B91C1C' : '#065F46',
          borderColor:     msg.kind === 'err' ? '#FECACA' : '#A7F3D0' }}>
          {msg.text}
        </div>
      )}

      {/* ---------------- NOTICES ---------------- */}
      {tab === 'notices' && (
        <>
          <div style={S.card}>
            <h2 style={S.h2}>Publish a notice</h2>
            <input value={notice.title} onChange={(e) => setNotice({ ...notice, title: e.target.value })}
              placeholder="Title" style={S.input} />
            <textarea value={notice.content} onChange={(e) => setNotice({ ...notice, content: e.target.value })}
              rows={3} placeholder="Details students need to know" style={{ ...S.input, resize: 'vertical', fontFamily: 'inherit' }} />
            <select value={notice.category} onChange={(e) => setNotice({ ...notice, category: e.target.value })} style={{ ...S.input, maxWidth: 200 }}>
              <option value="update">Update</option>
              <option value="urgent">Urgent</option>
              <option value="event">Event</option>
            </select>
            <button onClick={postNotice} style={S.primary}>Publish</button>
          </div>

          <div style={S.label}>Published ({notices.length})</div>
          {notices.length === 0 && <div style={S.empty}>No notices yet.</div>}
          {notices.map((n) => (
            <div key={n.id} style={S.card}>
              <div style={S.rowTop}>
                <div>
                  <span style={{ ...S.pill, backgroundColor: n.category === 'urgent' ? '#FEE2E2' : '#DBEAFE',
                                 color: n.category === 'urgent' ? '#DC2626' : '#2563EB' }}>
                    {(n.category || 'update').toUpperCase()}
                  </span>
                  <span style={{ fontWeight: 700, marginLeft: 8, color: '#111827' }}>{n.title}</span>
                </div>
                <button onClick={() => removeNotice(n.id)} style={S.danger}>Delete</button>
              </div>
              <div style={S.text}>{n.content}</div>
            </div>
          ))}
        </>
      )}

      {/* ---------------- JOB APPROVALS ---------------- */}
      {tab === 'jobs' && (
        <>
          <div style={S.label}>Job postings ({jobs.length}, {pendingJobs} awaiting review)</div>
          {jobs.length === 0 && <div style={S.empty}>No job postings yet.</div>}
          {jobs.map((j) => (
            <div key={j.id} style={S.card}>
              <div style={S.rowTop}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>
                    {j.company_name} — {j.role}
                  </div>
                  <div style={S.meta}>
                    {j.ctc} · {j.location || 'location not set'} · deadline {j.deadline}
                  </div>
                </div>
                <Pill status={j.status} />
              </div>

              {j.description && <div style={S.text}><strong>Role:</strong> {j.description}</div>}
              {j.eligibility && <div style={S.text}><strong>Eligibility:</strong> {j.eligibility}</div>}
              {j.reject_reason && <div style={{ ...S.text, color: '#B91C1C' }}><strong>Rejected:</strong> {j.reject_reason}</div>}

              {j.status !== 'approved' && (
                <button onClick={() => moderate('jobs', j.id, 'approved')} style={{ ...S.primary, marginRight: 8 }}>Approve</button>
              )}
              {j.status !== 'rejected' && (
                <button onClick={() => moderate('jobs', j.id, 'rejected')} style={S.danger}>Reject</button>
              )}
            </div>
          ))}
        </>
      )}

      {/* ---------------- EXPERIENCES ---------------- */}
      {tab === 'experiences' && (
        <>
          <div style={S.label}>Interview experiences ({exps.length}, {pendingExps} awaiting review)</div>
          {exps.length === 0 && <div style={S.empty}>Nothing submitted yet.</div>}
          {exps.map((x) => (
            <div key={x.id} style={S.card}>
              <div style={S.rowTop}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>
                    {x.company_name} — {x.role}
                  </div>
                  <div style={S.meta}>
                    by {x.author_name} · {[x.year, x.rounds, x.outcome].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <Pill status={x.status} />
              </div>

              <div style={{ ...S.label, marginTop: 10 }}>Questions</div>
              <div style={S.text}>{x.questions}</div>
              {x.advice && (<>
                <div style={{ ...S.label, marginTop: 8 }}>Advice</div>
                <div style={S.text}>{x.advice}</div>
              </>)}

              <div style={{ marginTop: 12 }}>
                {x.status !== 'approved' && (
                  <button onClick={() => moderate('experiences', x.id, 'approved')} style={{ ...S.primary, marginRight: 8 }}>Approve</button>
                )}
                {x.status !== 'rejected' && (
                  <button onClick={() => moderate('experiences', x.id, 'rejected')} style={S.danger}>Reject</button>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      {/* ---------------- RECRUITERS ---------------- */}
      {tab === 'recruiters' && (
        <>
          <div style={S.label}>Recruiter accounts ({recruiters.length})</div>
          {recruiters.length === 0 && <div style={S.empty}>No recruiters have registered.</div>}
          {recruiters.map((r) => (
            <div key={r.id} style={S.card}>
              <div style={S.rowTop}>
                <div>
                  <div style={{ fontWeight: 700, color: '#111827' }}>{r.company_name || '(no company)'}</div>
                  <div style={S.meta}>{r.full_name} · {r.email}</div>
                </div>
                <Pill status={r.is_verified ? 'approved' : 'pending'} />
              </div>
              <div style={{ marginTop: 10 }}>
                <button onClick={() => toggleRecruiter(r.id)}
                  style={r.is_verified ? S.danger : { ...S.primary, marginRight: 8 }}>
                  {r.is_verified ? 'Revoke access' : 'Approve'}
                </button>
                <button onClick={() => issueReset(r.id, r.email)} style={{ ...S.subtle, marginLeft: 8 }}>
                  Issue reset code
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {/* ---------------- INBOX ---------------- */}
      {tab === 'inbox' && (
        <>
          <div style={S.label}>Messages ({inbox.length}, {unread} unread)</div>
          {inbox.length === 0 && <div style={S.empty}>No messages.</div>}
          {inbox.map((m) => (
            <div key={m.id} style={{ ...S.card, borderLeft: m.is_read ? '1px solid #E5E7EB' : '4px solid #2563EB' }}>
              <div style={S.rowTop}>
                <div>
                  <div style={{ fontWeight: 700, color: '#111827' }}>{m.subject}</div>
                  <div style={S.meta}>
                    {m.from_name} ({m.from_role}{m.company_name ? `, ${m.company_name}` : ''}) · {m.created_at?.slice(0, 16)}
                  </div>
                </div>
                {!m.is_read && <span style={{ ...S.pill, backgroundColor: '#DBEAFE', color: '#2563EB' }}>new</span>}
              </div>

              <div style={S.text}>{m.body}</div>

              {m.admin_reply && (
                <div style={S.reply}><strong>Your reply:</strong> {m.admin_reply}</div>
              )}

              {replyFor === m.id ? (
                <div style={{ marginTop: 10 }}>
                  <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={3}
                    placeholder="Reply..." style={{ ...S.input, resize: 'vertical', fontFamily: 'inherit' }} />
                  <button onClick={() => sendReply(m.id)} style={{ ...S.primary, marginRight: 8 }}>Send</button>
                  <button onClick={() => { setReplyFor(null); setReplyText(''); }} style={S.subtle}>Cancel</button>
                </div>
              ) : (
                <button onClick={() => { setReplyFor(m.id); setReplyText(m.admin_reply || ''); }}
                  style={{ ...S.subtle, marginTop: 10 }}>
                  {m.admin_reply ? 'Edit reply' : 'Reply'}
                </button>
              )}
            </div>
          ))}
        </>
      )}

      {/* ---------------- PIPELINE ---------------- */}
      {tab === 'pipeline' && (<>
        <p style={S.help}>
          Where every applicant stands, by company. Publish a stage to post those roll numbers
          to the notice board.
        </p>

        {pipeline.length === 0 && <div style={S.empty}>No applications yet.</div>}

        {pipeline.map((c) => (
          <div key={c.company_name} style={S.card}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#111827', marginBottom: 4 }}>{c.company_name}</div>
            <div style={S.meta}>{c.total} applications</div>

            {['applied', 'shortlisted', 'interviewing', 'offered', 'hired', 'rejected', 'declined'].map((st) => {
              const list = c.stages[st] || [];
              if (list.length === 0) return null;

              return (
                <div key={st} style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #E5E7EB' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ ...S.label, margin: 0 }}>{st} ({list.length})</div>
                    {['shortlisted', 'interviewing', 'offered', 'hired'].includes(st) && (
                      <button onClick={async () => {
                        if (!window.confirm(`Publish the ${st} roll numbers for ${c.company_name} to the notice board?`)) return;
                        try {
                          const r = await api('/api/admin/publish-stage', {
                            method: 'POST',
                            body: JSON.stringify({ company_name: c.company_name, stage: st }),
                          });
                          ok2(`Published ${r.published} roll numbers.`);
                          loadAll();
                        } catch (e) { fail(e); }
                      }} style={S.subtle}>📢 Publish</button>
                    )}
                  </div>

                  {list.map((s, i) => (
                    <div key={i} style={{ ...S.meta, marginTop: 4 }}>
                      <strong>{s.roll_number || '—'}</strong> · {s.name} · {s.program || '—'} · CGPA {s.cgpa || '—'} · {s.role}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </>)}

      {/* ---------------- OFFERS ---------------- */}
      {tab === 'offers' && (<>
        <div style={S.label}>Offers ({offers.length}, {pendingOffers} awaiting approval)</div>
        {offers.length === 0 && <div style={S.empty}>No offers extended yet.</div>}
        {offers.map((o) => (
          <div key={o.id} style={S.card}>
            <div style={S.rowTop}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>
                  {o.company_name} → {o.student_name}
                </div>
                <div style={S.meta}>
                  {o.roll_number} · {o.program || '—'} · CGPA {o.cgpa || '—'} · {o.student_email}
                </div>
                <div style={{ ...S.meta, marginTop: 3 }}>
                  <strong>{o.role}</strong> · {o.ctc} · {o.location || '—'} · joining {o.joining_date || '—'}
                </div>
              </div>
              <Pill status={o.status} />
            </div>

            {o.details && <div style={S.text}>{o.details}</div>}
            {o.admin_reason && <div style={{ ...S.text, color: '#B91C1C' }}><strong>Rejected:</strong> {o.admin_reason}</div>}
            {o.student_note && <div style={S.reply}><strong>Student replied:</strong> {o.student_note}</div>}
            {o.decided_at && <div style={S.meta}>Responded {o.decided_at.slice(0, 16)}</div>}

            {o.status === 'pending_admin' && (
              <div style={{ marginTop: 12 }}>
                <button onClick={() => moderate('offers', o.id, 'approved')} style={{ ...S.primary, marginRight: 8 }}>Approve</button>
                <button onClick={() => moderate('offers', o.id, 'rejected')} style={S.danger}>Reject</button>
              </div>
            )}
          </div>
        ))}
      </>)}

      {/* ---------------- STUDENTS ---------------- */}
      {tab === 'students' && (<>
        <div style={S.stats}>
          <div style={S.stat}><div style={{ fontSize: 25, fontWeight: 700, color: '#111827' }}>{students.length}</div><div style={S.statLabel}>Registered</div></div>
          <div style={S.stat}><div style={{ fontSize: 25, fontWeight: 700, color: '#10B981' }}>{students.filter((s) => s.offers.some((o) => o.status === 'accepted')).length}</div><div style={S.statLabel}>Placed</div></div>
          <div style={S.stat}><div style={{ fontSize: 25, fontWeight: 700, color: '#6B7280' }}>{students.filter((s) => s.placement_status === 'closed').length}</div><div style={S.statLabel}>Closed out</div></div>
          <div style={S.stat}><div style={{ fontSize: 25, fontWeight: 700, color: '#F59E0B' }}>{students.filter((s) => !s.profile_complete).length}</div><div style={S.statLabel}>Incomplete CV</div></div>
        </div>

        {students.length === 0 && <div style={S.empty}>No students registered.</div>}
        {students.map((s) => (
          <div key={s.user_id} style={S.card}>
            <div style={S.rowTop}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{s.full_name}</div>
                <div style={S.meta}>{s.roll_number || 'no roll number'} · {s.email} · {s.phone || 'no phone'}</div>
                <div style={{ ...S.meta, marginTop: 3 }}>
                  {s.program || '—'} · CGPA {s.cgpa || '—'} · {s.passing_year || '—'} · {s.project_count} projects · {s.application_count} applications
                </div>
              </div>
              <Pill status={s.placement_status} />
            </div>

            {s.closed_reason && <div style={{ ...S.text, color: '#6B7280' }}>{s.closed_reason}</div>}
            {!s.profile_complete && <div style={{ ...S.text, color: '#B45309' }}>CV incomplete.</div>}

            {s.journeys && s.journeys.length > 0 && (<>
              <div style={{ ...S.label, marginTop: 12 }}>Company history</div>
              {s.journeys.map((j, i) => (
                <div key={i} style={{ ...S.meta, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <strong style={{ color: '#111827', minWidth: 130 }}>{j.company}</strong>
                  {j.path.map((p, k) => (
                    <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {k > 0 && <span style={{ color: '#9CA3AF' }}>→</span>}
                      <span style={{
                        padding: '2px 9px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                        backgroundColor: p === 'hired' ? '#DCFCE7' : ['rejected', 'declined'].includes(p) ? '#FEE2E2' : '#F3F4F6',
                        color:           p === 'hired' ? '#166534' : ['rejected', 'declined'].includes(p) ? '#B91C1C' : '#4B5563',
                      }}>{p}</span>
                    </span>
                  ))}
                </div>
              ))}
            </>)}
            
            {s.offers.length > 0 && (<>
              <div style={{ ...S.label, marginTop: 10 }}>Offers</div>
              {s.offers.map((o, i) => (
                <div key={i} style={{ ...S.meta, marginTop: 2 }}>{o.company} — {o.role} ({o.ctc}) · <strong>{o.status}</strong></div>
              ))}
            </>)}

            <button onClick={async () => {
              if (openStudent?.user_id === s.user_id) return setOpenStudent(null);
              try { setOpenStudent(await api(`/api/admin/students/${s.user_id}`)); } catch (e) { fail(e); }
            }} style={{ ...S.subtle, marginTop: 11 }}>
              {openStudent?.user_id === s.user_id ? '▾ Hide full CV' : '▸ View full CV'}
            </button>

            {openStudent?.user_id === s.user_id && openStudent.profile && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #E5E7EB' }}>
                <div style={S.label}>Skills</div>
                <div style={S.text}>{openStudent.profile.tech_skills || '—'}</div>
                <div style={S.label}>Expertise</div>
                <div style={S.text}>{openStudent.profile.core_expertise || '—'}</div>
                <div style={S.label}>Projects</div>
                {(openStudent.profile.projects || []).map((p, i) => (
                  <div key={i} style={{ ...S.rowItem, display: 'block' }}>
                    <div style={{ fontWeight: 600, color: '#111827', fontSize: 14 }}>{p.title} <span style={{ fontWeight: 400, color: '#6B7280' }}>{p.date}</span></div>
                    {p.overview && <div style={{ ...S.text, fontStyle: 'italic' }}>{p.overview}</div>}
                    {p.description && <div style={S.text}>{p.description}</div>}
                  </div>
                ))}
                <div style={S.label}>Applications</div>
                {openStudent.applications.length === 0 && <div style={S.text}>None</div>}
                {openStudent.applications.map((a, i) => (
                  <div key={i} style={S.meta}>{a.company} — {a.role} · <strong>{a.status}</strong> · {a.cv_name}</div>
                ))}
              </div>
            )}
          </div>
        ))}
      </>)}

      {/* ---------------- POLICY ---------------- */}
      {tab === 'policy' && (
        <div style={S.card}>
          <h2 style={S.h2}>Policy Documents</h2>
          <p style={S.help}>
            Uploaded PDFs are split into passages and indexed so the student assistant can
            answer policy questions and cite the page. Same filename replaces the old version.
          </p>

          <label style={{ ...S.primary, display: 'inline-block', opacity: busy ? 0.55 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}>
            <input type="file" accept="application/pdf" onChange={uploadPolicy} disabled={busy} style={{ display: 'none' }} />
            {busy ? 'Indexing...' : '📄 Upload a PDF'}
          </label>

          <div style={{ ...S.label, marginTop: 20 }}>Indexed ({docs.length})</div>
          {docs.length === 0 && <div style={S.empty}>Nothing indexed. The policy bot will say it cannot answer.</div>}
          {docs.map((d) => (
            <div key={d} style={S.rowItem}>
              <span style={{ fontSize: 14, color: '#111827' }}>📕 {d}</span>
              <button onClick={() => removePolicy(d)} style={S.danger}>Remove</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const S = {
  page:   { padding: '32px 40px', maxWidth: 900, margin: '0 auto', fontFamily: '"Inter","Segoe UI",Roboto,sans-serif', textAlign: 'left' },
  bar:    { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  h1:     { margin: 0, fontSize: 25, color: '#111827' },
  h2:     { margin: '0 0 10px', fontSize: 17, color: '#111827' },
  sub:    { fontSize: 13, color: '#6B7280', marginTop: 4 },
  help:   { margin: '0 0 14px', fontSize: 13, color: '#6B7280', lineHeight: 1.5 },
  logout: { padding: '8px 16px', backgroundColor: '#F3F4F6', color: '#374151', border: '1px solid #D1D5DB', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  tabs:   { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 },
  tab:    { padding: '8px 14px', border: '1px solid #D1D5DB', borderRadius: 20, cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 },
  badge:  { backgroundColor: '#DC2626', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700 },
  card:   { backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 18, marginBottom: 12 },
  rowTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  rowItem:{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 13px', backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, marginBottom: 8 },
  pill:   { padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap' },
  input:  { width: '100%', padding: '9px 11px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13.5, boxSizing: 'border-box', outline: 'none', marginBottom: 9, display: 'block' },
  primary:{ padding: '9px 18px', backgroundColor: '#2563EB', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 13.5, cursor: 'pointer' },
  danger: { padding: '7px 14px', backgroundColor: '#FEE2E2', color: '#DC2626', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 12.5 },
  subtle: { padding: '7px 14px', backgroundColor: '#F3F4F6', color: '#4B5563', border: '1px solid #D1D5DB', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 12.5 },
  label:  { fontSize: 11.5, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.4, margin: '18px 0 9px' },
  text:   { fontSize: 13.5, color: '#374151', marginTop: 7, lineHeight: 1.6, whiteSpace: 'pre-wrap' },
  meta:   { fontSize: 12.5, color: '#6B7280', marginTop: 3 },
  reply:  { marginTop: 10, padding: '9px 12px', backgroundColor: '#EFF6FF', borderRadius: 7, fontSize: 13, color: '#1E40AF' },
  msg:    { padding: '10px 13px', borderRadius: 8, fontSize: 13, border: '1px solid', marginBottom: 14 },
  empty:  { padding: 18, backgroundColor: '#F9FAFB', border: '1px dashed #D1D5DB', borderRadius: 9, color: '#6B7280', fontSize: 13.5 },
};
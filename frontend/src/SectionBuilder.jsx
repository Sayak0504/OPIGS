import RichEditor from './RichEditor';

export const SECTION_TYPES = [
  ['internships',          'Internships'],
  ['projects',             'Projects'],
  ['internships_projects', 'Internships and Projects'],
  ['academic',             'Academic Achievement'],
  ['certification',        'Certification'],
  ['training',             'Training'],
  ['experience',           'Experience'],
  ['entrepreneurial',      'Entrepreneurial Experience'],
  ['competition',          'Competition/Conference'],
  ['publication',          'Publication'],
  ['responsibilities',     'Position of Responsibilities'],
  ['extracurricular',      'Extra-Curricular Activities'],
  ['skills',               'Skills and Expertise'],
  ['coursework',           'Coursework Information'],
];

const labelOf = (t) => (SECTION_TYPES.find(([k]) => k === t) || [t, t])[1];

const blankEntry = (type) =>
  type === 'skills'
    ? { tech_skills: '', core_expertise: '' }
    : { title: '', date: '', overview: '', description: '' };

export default function SectionBuilder({ sections, setSections, isLocked, inputStyle }) {
  const used = sections.map((s) => s.type);
  const available = SECTION_TYPES.filter(([k]) => !used.includes(k));

  const update = (fn) => {
    const next = sections.map((s) => ({ ...s, entries: [...(s.entries || [])] }));
    fn(next);
    setSections(next);
  };

  const addSection = (type) => { if (type) update((n) => n.push({ type, entries: [blankEntry(type)] })); };
  const removeSection = (i) => { if (window.confirm(`Remove the ${labelOf(sections[i].type)} section and everything in it?`)) update((n) => n.splice(i, 1)); };
  const moveSection = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= sections.length) return;
    update((n) => { [n[i], n[j]] = [n[j], n[i]]; });
  };

  const addEntry = (i) => update((n) => n[i].entries.push(blankEntry(n[i].type)));
  const removeEntry = (i, k) => update((n) => n[i].entries.splice(k, 1));
  const moveEntry = (i, k, dir) => {
    const j = k + dir;
    update((n) => { if (j >= 0 && j < n[i].entries.length) [n[i].entries[k], n[i].entries[j]] = [n[i].entries[j], n[i].entries[k]]; });
  };
  const setField = (i, k, field, value) => update((n) => { n[i].entries[k] = { ...n[i].entries[k], [field]: value }; });

  const IconBtn = ({ onClick, disabled, title, children, danger }) => (
    <button type="button" onClick={onClick} disabled={disabled || isLocked} title={title}
      style={{ padding: '3px 9px', fontSize: 13, lineHeight: 1.3,
        backgroundColor: danger ? '#FEE2E2' : '#F3F4F6', color: danger ? '#DC2626' : '#4B5563',
        border: '1px solid ' + (danger ? '#FECACA' : '#D1D5DB'), borderRadius: 5,
        cursor: (disabled || isLocked) ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1 }}>
      {children}
    </button>
  );

  return (
    <div style={{ marginTop: 10, borderTop: '1px solid #E5E7EB', paddingTop: 15 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <h3 style={{ margin: 0, color: '#111827', fontSize: 18 }}>CV Sections</h3>
        <span style={{ fontSize: 12, color: '#6B7280' }}>{sections.length} of {SECTION_TYPES.length}</span>
      </div>
      <p style={{ fontSize: 12.5, color: '#6B7280', margin: '0 0 12px' }}>
        Sections print in the order below. Use ↑ ↓ to rearrange.
      </p>

      {sections.length === 0 && (
        <div style={{ padding: 16, backgroundColor: '#F9FAFB', border: '1px dashed #D1D5DB', borderRadius: 8, color: '#6B7280', fontSize: 13 }}>
          No sections yet. Add one below.
        </div>
      )}

      {sections.map((s, i) => (
        <div key={s.type} style={{ border: '1px solid #E5E7EB', borderRadius: 9, marginBottom: 14, overflow: 'hidden' }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 13px', backgroundColor: '#EEF2FF', borderBottom: '1px solid #E5E7EB' }}>
            <span style={{ backgroundColor: '#4F46E5', color: '#fff', borderRadius: 5, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{i + 1}</span>
            <span style={{ fontWeight: 700, color: '#3730A3', fontSize: 14.5, flex: 1 }}>{labelOf(s.type)}</span>
            <IconBtn onClick={() => moveSection(i, -1)} disabled={i === 0} title="Move up">↑</IconBtn>
            <IconBtn onClick={() => moveSection(i, 1)} disabled={i === sections.length - 1} title="Move down">↓</IconBtn>
            <IconBtn onClick={() => removeSection(i)} danger title="Remove section">✕</IconBtn>
          </div>

          <div style={{ padding: 13 }}>
            {(s.entries || []).map((e, k) => (
              <div key={k} style={{ backgroundColor: '#F9FAFB', padding: 13, borderRadius: 8, border: '1px solid #E5E7EB', marginBottom: 10 }}>

                {s.type === 'skills' ? (
                  <>
                    <label style={LBL}>Programming Languages &amp; Tools</label>
                    <input value={e.tech_skills || ''} onChange={(ev) => setField(i, k, 'tech_skills', ev.target.value)}
                      disabled={isLocked} placeholder="C++, Python, FastAPI, React" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', marginBottom: 10 }} />
                    <label style={LBL}>Expertise</label>
                    <input value={e.core_expertise || ''} onChange={(ev) => setField(i, k, 'core_expertise', ev.target.value)}
                      disabled={isLocked} placeholder="Algorithms, Hardware Interfacing" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 10 }}>
                      <div style={{ flex: 1 }}>
                        <label style={LBL}>Heading</label>
                        <input value={e.title || ''} onChange={(ev) => setField(i, k, 'title', ev.target.value)}
                          disabled={isLocked} placeholder="Title | Organisation | Location" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
                      </div>
                      <div style={{ width: 145 }}>
                        <label style={LBL}>Date</label>
                        <input value={e.date || ''} onChange={(ev) => setField(i, k, 'date', ev.target.value)}
                          disabled={isLocked} placeholder="Apr '26 - Aug '26" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
                      </div>
                      <IconBtn onClick={() => moveEntry(i, k, -1)} disabled={k === 0} title="Move up">↑</IconBtn>
                      <IconBtn onClick={() => moveEntry(i, k, 1)} disabled={k === s.entries.length - 1} title="Move down">↓</IconBtn>
                      <IconBtn onClick={() => removeEntry(i, k)} danger title="Remove entry">✕</IconBtn>
                    </div>

                    <label style={LBL}>Overview <span style={{ fontWeight: 400, color: '#9CA3AF' }}>(optional)</span></label>
                    <textarea value={e.overview || ''} onChange={(ev) => setField(i, k, 'overview', ev.target.value)}
                      disabled={isLocked} placeholder="One line summary." rows={2}
                      style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', resize: 'vertical', marginBottom: 10 }} />

                    <label style={LBL}>Description</label>
                    <RichEditor value={e.description || ''} onChange={(html) => setField(i, k, 'description', html)} disabled={isLocked} />
                  </>
                )}
              </div>
            ))}

            {!isLocked && s.type !== 'skills' && (
              <button type="button" onClick={() => addEntry(i)}
                style={{ padding: '5px 11px', fontSize: 13, backgroundColor: '#F3F4F6', color: '#4B5563', border: '1px dashed #D1D5DB', borderRadius: 6, cursor: 'pointer' }}>
                + Add entry to {labelOf(s.type)}
              </button>
            )}
          </div>
        </div>
      ))}

      {!isLocked && available.length > 0 && (
        <div style={{ display: 'flex', gap: 9, alignItems: 'center', marginTop: 6 }}>
          <select defaultValue="" onChange={(ev) => { addSection(ev.target.value); ev.target.value = ''; }}
            style={{ ...inputStyle, flex: 1 }}>
            <option value="">+ Add a section...</option>
            {available.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

const LBL = { fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 };
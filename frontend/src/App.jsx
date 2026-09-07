import { useState, useEffect, useRef } from 'react';
import { api, apiBlob, apiUpload, getName, logout } from "./api";
import RichEditor from './RichEditor';

const STAGES = [
  { key: 'applied',      label: 'Applied',      color: '#3B82F6' },
  { key: 'shortlisted',  label: 'Shortlisted',  color: '#F59E0B' },
  { key: 'interviewing', label: 'Interviewing', color: '#10B981' },
];

function App() {
  const [activeTab, setActiveTab] = useState('cv_builder');
  const [chatOpen, setChatOpen] = useState(false);

  // --- Admin Deadline Logic ---
  // In a production app, this date would be fetched from the backend (Admin settings)
  const CV_DEADLINE = new Date('2026-09-15T23:59:59'); 
  const isLocked = new Date() > CV_DEADLINE;

  // --- Database State ---
  const [notices, setNotices] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [applications, setApplications] = useState([]);
  const [cvChoice, setCvChoice] = useState({});
  const [dragId, setDragId] = useState(null);
  const [aiBusy, setAiBusy] = useState(null);
  const [aiUndo, setAiUndo] = useState({});
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatMode, setChatMode] = useState('assistant');   // assistant | policy
  const chatEndRef = useRef(null);
  const [saveState, setSaveState] = useState('idle');   // idle | dirty | saving | saved | error
  const [saveError, setSaveError] = useState('');
  const saveTimerRef = useRef(null);
  const loadedRef = useRef(false);
  const lastSavedRef = useRef(null);

    useEffect(() => {
    api('/api/notices').then(setNotices).catch(console.error);
    api('/api/jobs').then(setJobs).catch(console.error);
    loadPhoto();
    loadApplications();

    api('/api/student/me')
      .then((p) => {
        setName(p.full_name || '');
        setRollNumber(p.roll_number || '');
        setEmail(p.email || '');
        setPhone(p.phone || '');
        setSkills(p.tech_skills || '');
        setProjects(p.projects || []);
        setProgram(p.program || '');
        setDegree(p.degree || '');
        setInstitute(p.institute || '');
        setPassingYear(p.passing_year || '');
        setCgpa(p.cgpa || '');
        setLinkedinUrl(p.linkedin_url || '');
        setLinkedinName(p.linkedin_name || '');
        setExpertise(p.core_expertise || '');
        loadedRef.current = true;
      })
      .catch((err) => {
        console.error(err);
        loadedRef.current = true;
      });
  }, []);

  // --- CV Builder State ---
  const [name, setName] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [skills, setSkills] = useState('');
  const [program, setProgram] = useState('');
  const [degree, setDegree] = useState('');
  const [institute, setInstitute] = useState('');
  const [passingYear, setPassingYear] = useState('');
  const [cgpa, setCgpa] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [linkedinName, setLinkedinName] = useState('');
  const [expertise, setExpertise] = useState('');
  
  // Dynamic Projects Array
  const [projects, setProjects] = useState([]);
  
  const [pdfUrl, setPdfUrl] = useState(null);
  const [loading, setLoading] = useState(false);

  // Helper to add a new empty project to the form
  const addProject = () => {
    setProjects([...projects, { title: '', date: '', overview: '', description: '' }]);
  };

  // Helper to update a specific project's text
  const updateProject = (index, field, value) => {
    const updatedProjects = [...projects];
    updatedProjects[index][field] = value;
    setProjects(updatedProjects);
  };

    const removeProject = (index) => {
    setProjects(projects.filter((_, i) => i !== index));
  };

  const updatePoint = (projIndex, pointIndex, value) => {
    const next = [...projects];
    next[projIndex].points = [...(next[projIndex].points || [])];
    next[projIndex].points[pointIndex] = value;
    setProjects(next);
  };

  const addPoint = (projIndex) => {
    const next = [...projects];
    next[projIndex].points = [...(next[projIndex].points || []), ''];
    setProjects(next);
  };

  const removePoint = (projIndex, pointIndex) => {
    const next = [...projects];
    next[projIndex].points = next[projIndex].points.filter((_, i) => i !== pointIndex);
    setProjects(next);
  };

  const buildPayload = () => ({
    name: name,
    roll_number: rollNumber,
    program: program,
    phone: phone,
    email: email,
    linkedin_url: linkedinUrl,
    linkedin_name: linkedinName,
    photo_filename: "photo.jpg",
    education: [{ year: passingYear, degree: degree, institute: institute, score: cgpa }],
    projects: projects
      .filter(p => p.title.trim())
      .map(p => ({
        title: p.title,
        date: p.date,
        overview: (p.overview || '').trim(),
        description: p.description || '',
      })),
    internships: [],
    tech_skills: skills,
    core_expertise: expertise
  });

  /* ---------- auto-save ---------- */

  const payloadKey = JSON.stringify(buildPayload());

  const runAutoSave = async (key) => {
    setSaveState('saving');
    try {
      await api('/api/student/save', {
        method: 'POST',
        body: JSON.stringify(buildPayload()),
      });
      lastSavedRef.current = key;
      setSaveError('');
      setSaveState('saved');
    } catch (err) {
      setSaveError(err.message);
      setSaveState('error');
    }
  };

  useEffect(() => {
    if (isLocked || !loadedRef.current) return;

    // first snapshot after loading — this is the saved state, nothing to do
    if (lastSavedRef.current === null) {
      lastSavedRef.current = payloadKey;
      return;
    }

    if (payloadKey === lastSavedRef.current) return;

    setSaveState('dirty');
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => runAutoSave(payloadKey), 1500);

    return () => clearTimeout(saveTimerRef.current);
  }, [payloadKey, isLocked]);
  
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatBusy]);

    const sendChat = async (preset) => {
    const text = (preset ?? chatInput).trim();
    if (!text || chatBusy) return;

    const next = [...chatMessages, { role: 'user', content: text }];
    setChatMessages(next);
    setChatInput('');
    setChatBusy(true);

    try {
      if (chatMode === 'policy') {
        const res = await api('/api/policy/ask', {
          method: 'POST',
          body: JSON.stringify({ question: text }),
        });
        setChatMessages([...next, {
          role: 'assistant',
          content: res.answer,
          sources: res.sources || [],
        }]);
      } else {
        const res = await api('/api/ai/chat', {
          method: 'POST',
          body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })) }),
        });
        setChatMessages([...next, { role: 'assistant', content: res.reply }]);
      }
    } catch (err) {
      setChatMessages([...next, { role: 'assistant', content: `Sorry — ${err.message}` }]);
    }
    setChatBusy(false);
  };

  const saveProfile = async () => {
    clearTimeout(saveTimerRef.current);
    setSaveState('saving');
    try {
      await api('/api/student/save', {
        method: 'POST',
        body: JSON.stringify(buildPayload()),
      });
      lastSavedRef.current = JSON.stringify(buildPayload());
      setSaveError('');
      setSaveState('saved');
    } catch (err) {
      setSaveError(err.message);
      setSaveState('error');
      alert(err.message);
    }
  };
  const magicWrite = async (index, count = 3) => {
    const proj = projects[index];
    const source = (proj.overview || '').trim() || (proj.points || []).join(' ');

    if (!source) {
      alert('Describe the project in the Overview box first, then let AI turn it into bullets.');
      return;
    }

    setAiBusy(index);
    try {
      const res = await api('/api/ai/magic-write', {
        method: 'POST',
        body: JSON.stringify({ title: proj.title, notes: source, count }),
      });
      setAiUndo({ ...aiUndo, [index]: proj.points || [] });
      updateProject(index, 'points', res.bullets);
    } catch (err) {
      alert(err.message);
    }
    setAiBusy(null);
  };

  const undoMagicWrite = (index) => {
    updateProject(index, 'points', aiUndo[index]);
    const next = { ...aiUndo };
    delete next[index];
    setAiUndo(next);
  };


    const loadApplications = () =>
    api('/api/applications').then(setApplications).catch(console.error);

  const applyToJob = async (jobId) => {
    try {
      const res = await api('/api/applications', {
        method: 'POST',
        body: JSON.stringify({ job_id: jobId, cv_name: cvChoice[jobId] || 'Base_CV.pdf' }),
      });
      alert(res.message);
      loadApplications();
    } catch (err) {
      alert(err.message);
    }
  };

  const moveCard = async (newStatus) => {
    const id = dragId;
    setDragId(null);
    const card = applications.find((a) => a.id === id);
    if (!card || card.status === newStatus) return;

    // move it on screen first, so the drag feels instant
    setApplications((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: newStatus } : a))
    );

    try {
      await api(`/api/applications/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
    } catch (err) {
      alert(err.message);
      loadApplications();   // server said no — pull the truth back
    }
  };

  const withdraw = async (id) => {
    if (!window.confirm('Withdraw this application?')) return;
    try {
      await api(`/api/applications/${id}`, { method: 'DELETE' });
      loadApplications();
    } catch (err) {
      alert(err.message);
    }
  };

  const loadPhoto = async () => {
    try {
      const blob = await apiBlob('/api/student/photo');
      setPhotoUrl(URL.createObjectURL(blob));
    } catch {
      setPhotoUrl(null);   // no photo uploaded yet — that's fine
    }
  };

  const uploadPhoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setPhotoBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await apiUpload('/api/student/photo', form);
      await loadPhoto();
    } catch (err) {
      alert(err.message);
    }
    setPhotoBusy(false);
  };

  const generatePDF = async () => {
    setLoading(true);
    try {
      const blob = await apiBlob('/api/generate-cv', {
        method: 'POST',
        body: JSON.stringify(buildPayload()),
      });
      setPdfUrl(URL.createObjectURL(blob));
    } catch (err) {
      alert(err.message);
    }
    setLoading(false);
  };

  // --- Reusable Styles ---
  const cardStyle = {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '20px',
    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)',
    border: '1px solid #E5E7EB',
    textAlign: 'left',
    color: '#1F2937'
  };

  const pageHeaderStyle = {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: '24px',
    textAlign: 'left'
  };

  const navItemStyle = (isActive) => ({
    padding: '16px 24px',
    cursor: 'pointer',
    backgroundColor: isActive ? '#334155' : 'transparent',
    color: isActive ? '#60A5FA' : '#CBD5E1',
    borderLeft: isActive ? '4px solid #60A5FA' : '4px solid transparent',
    fontWeight: isActive ? '600' : '400',
    fontSize: '15px',
    transition: 'all 0.2s ease-in-out',
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  });

  // --- UI Components ---
  const renderNoticeBoard = () => (
    <div style={{ padding: '40px', maxWidth: '900px', margin: '0 auto' }}>
      <h2 style={pageHeaderStyle}>Institute Notice Board</h2>
      {notices.length === 0 ? <p style={{color: '#6B7280'}}>Loading notices...</p> : notices.map((notice) => (
        <div key={notice.id} style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <span style={{ 
              padding: '4px 12px', 
              borderRadius: '20px', 
              fontSize: '12px', 
              fontWeight: 'bold',
              backgroundColor: notice.category === 'urgent' ? '#FEE2E2' : '#DBEAFE',
              color: notice.category === 'urgent' ? '#DC2626' : '#2563EB'
            }}>
              {notice.category.toUpperCase()}
            </span>
            <h4 style={{ margin: 0, fontSize: '18px', color: '#111827' }}>{notice.title}</h4>
          </div>
          <p style={{ margin: 0, color: '#4B5563', lineHeight: '1.6' }}>{notice.content}</p>
        </div>
      ))}
    </div>
  );

  const renderCompanies = () => (
    <div style={{ padding: '40px', maxWidth: '1000px', margin: '0 auto' }}>
      <h2 style={pageHeaderStyle}>Active Recruitment Drives</h2>
      {jobs.length === 0 ? <p style={{color: '#6B7280'}}>Loading jobs...</p> : jobs.map((job) => (
        <div key={job.id} style={{...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '20px', color: '#111827' }}>{job.company_name}</h3>
            <div style={{ display: 'flex', gap: '15px', color: '#6B7280', fontSize: '14px' }}>
              <span>💼 <strong>Role:</strong> {job.role}</span>
              <span>💰 <strong>CTC:</strong> {job.ctc}</span>
              <span style={{color: '#D97706'}}>⏳ <strong>Deadline:</strong> {job.deadline}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <select
              value={cvChoice[job.id] || 'Base_CV.pdf'}
              onChange={(e) => setCvChoice({ ...cvChoice, [job.id]: e.target.value })}
              style={{ padding: '10px', borderRadius: '6px', border: '1px solid #D1D5DB', backgroundColor: '#F9FAFB', color: '#374151', outline: 'none' }}>
              <option>Base_CV.pdf</option>
              <option>Core_Embedded_CV.pdf</option>
              <option>Software_CV.pdf</option>
            </select>

            {applications.some((a) => a.job_id === job.id) ? (
              <button disabled style={{ padding: '10px 24px', backgroundColor: '#E5E7EB', color: '#6B7280', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'not-allowed' }}>
                ✓ Applied
              </button>
            ) : (
              <button onClick={() => applyToJob(job.id)} style={{ padding: '10px 24px', backgroundColor: '#10B981', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)' }}>
                Apply
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  const renderKanban = () => (
    <div style={{ padding: '40px' }}>
      <h2 style={pageHeaderStyle}>My Applications</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', alignItems: 'start' }}>
        {STAGES.map((stage) => {
          const items = applications.filter((a) => a.status === stage.key);

          return (
            <div
              key={stage.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => moveCard(stage.key)}
              style={{ backgroundColor: '#F3F4F6', borderRadius: '12px', padding: '16px', minHeight: '320px', border: '1px solid #E5E7EB' }}>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: stage.color }} />
                <span style={{ fontWeight: '700', color: '#111827' }}>{stage.label}</span>
                <span style={{ marginLeft: 'auto', backgroundColor: '#E5E7EB', color: '#4B5563', borderRadius: '10px', padding: '2px 9px', fontSize: '12px', fontWeight: '600' }}>
                  {items.length}
                </span>
              </div>

              {items.length === 0 && (
                <p style={{ fontSize: '13px', color: '#9CA3AF', textAlign: 'center', marginTop: '30px' }}>
                  Drag cards here
                </p>
              )}

              {items.map((a) => (
                <div
                  key={a.id}
                  draggable
                  onDragStart={() => setDragId(a.id)}
                  style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '14px', marginBottom: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', borderLeft: `4px solid ${stage.color}`, cursor: 'grab', textAlign: 'left' }}>

                  <h4 style={{ margin: '0 0 6px 0', fontSize: '16px', color: '#111827' }}>{a.company_name}</h4>
                  <div style={{ fontSize: '13px', color: '#4B5563' }}>{a.role}</div>
                  <div style={{ fontSize: '13px', color: '#059669', fontWeight: '600', marginTop: '4px' }}>{a.ctc}</div>
                  <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '8px' }}>📄 {a.cv_name}</div>

                  <button
                    onClick={() => withdraw(a.id)}
                    style={{ marginTop: '10px', padding: '4px 10px', fontSize: '12px', backgroundColor: '#FEE2E2', color: '#DC2626', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                    Withdraw
                  </button>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
  
  const renderCVBuilder = () => {
    // Helper style for disabled inputs
    const inputStyle = {
      padding: '10px', 
      border: '1px solid #D1D5DB', 
      borderRadius: '6px', 
      outline: 'none',
      backgroundColor: isLocked ? '#E5E7EB' : '#ffffff',
      color: isLocked ? '#6B7280' : '#111827',
      cursor: isLocked ? 'not-allowed' : 'text'
    };

    return (
      <div style={{ display: 'flex', height: '100%' }}>
        {/* Left Form Pane */}
        <div style={{ width: '45%', padding: '40px', backgroundColor: '#ffffff', borderRight: '1px solid #E5E7EB', overflowY: 'auto' }}>
          <h2 style={pageHeaderStyle}>LaTeX CV Builder</h2>
          
          {/* Deadline Banner */}
          {isLocked ? (
            <div style={{ backgroundColor: '#FEE2E2', color: '#DC2626', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontWeight: 'bold', border: '1px solid #F87171' }}>
              🔒 CV Editing is Locked. The deadline ({CV_DEADLINE.toDateString()}) has passed. You can only generate previews.
            </div>
          ) : (
            <div style={{ backgroundColor: '#FEF3C7', color: '#D97706', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontWeight: 'bold', border: '1px solid #FCD34D' }}>
              ⏳ Deadline to finalize CV: {CV_DEADLINE.toDateString()}. The form will freeze after this date.
            </div>
          )}

          {!isLocked && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', fontSize: '13px',
                          color: saveState === 'error' ? '#DC2626' : '#6B7280' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, backgroundColor:
                saveState === 'saved'  ? '#10B981' :
                saveState === 'saving' ? '#F59E0B' :
                saveState === 'dirty'  ? '#F59E0B' :
                saveState === 'error'  ? '#DC2626' : '#D1D5DB' }} />
              {saveState === 'idle'   && 'Changes save automatically'}
              {saveState === 'dirty'  && 'Unsaved changes...'}
              {saveState === 'saving' && 'Saving...'}
              {saveState === 'saved'  && 'All changes saved'}
              {saveState === 'error'  && `Could not save: ${saveError}`}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', textAlign: 'left', paddingBottom: '40px' }}>
            
            {/* Basic Info */}
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', padding: '15px', backgroundColor: '#F9FAFB', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
              <div style={{ width: '84px', height: '100px', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {photoUrl
                  ? <img src={photoUrl} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: '28px' }}>👤</span>}
              </div>
              <div>
                <label style={{ fontSize: '14px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '6px' }}>Passport Photo</label>
                <input type="file" accept="image/jpeg,image/png" onChange={uploadPhoto} disabled={isLocked || photoBusy} style={{ fontSize: '13px' }} />
                <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '6px' }}>
                  {photoBusy ? 'Uploading...' : 'JPG or PNG, under 2 MB. Saves immediately.'}
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>Full Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={isLocked} style={inputStyle} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>Roll Number</label>
                <input type="text" value={rollNumber} onChange={(e) => setRollNumber(e.target.value)} disabled={isLocked} style={inputStyle} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isLocked} style={inputStyle} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>Phone</label>
                <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={isLocked} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>Department / Program</label>
              <input type="text" placeholder="Instrumentation Engineering (B.Tech)" value={program} onChange={(e) => setProgram(e.target.value)} disabled={isLocked} style={inputStyle} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>Degree</label>
                <input type="text" placeholder="B.Tech" value={degree} onChange={(e) => setDegree(e.target.value)} disabled={isLocked} style={inputStyle} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>Institute</label>
                <input type="text" placeholder="IIT Kharagpur" value={institute} onChange={(e) => setInstitute(e.target.value)} disabled={isLocked} style={inputStyle} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>Passing Year</label>
                <input type="text" placeholder="2027" value={passingYear} onChange={(e) => setPassingYear(e.target.value)} disabled={isLocked} style={inputStyle} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>CGPA</label>
                <input type="text" placeholder="8.50/10" value={cgpa} onChange={(e) => setCgpa(e.target.value)} disabled={isLocked} style={inputStyle} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>LinkedIn Username</label>
                <input type="text" placeholder="sayaksardar" value={linkedinName} onChange={(e) => setLinkedinName(e.target.value)} disabled={isLocked} style={inputStyle} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>LinkedIn URL</label>
                <input type="text" placeholder="https://linkedin.com/in/sayaksardar" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} disabled={isLocked} style={inputStyle} />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>Core Expertise</label>
              <input type="text" placeholder="Algorithms, Hardware Interfacing" value={expertise} onChange={(e) => setExpertise(e.target.value)} disabled={isLocked} style={inputStyle} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>Technical Skills</label>
              <input type="text" value={skills} onChange={(e) => setSkills(e.target.value)} disabled={isLocked} style={inputStyle} />
            </div>

            {/* Dynamic Projects Section */}
            <div style={{ marginTop: '10px', borderTop: '1px solid #E5E7EB', paddingTop: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3 style={{ margin: 0, color: '#111827', fontSize: '18px' }}>Projects</h3>
                {!isLocked && (
                  <button onClick={addProject} style={{ padding: '6px 12px', backgroundColor: '#E0E7FF', color: '#4F46E5', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>+ Add Project</button>
                )}
              </div>

              {projects.map((proj, index) => (
                <div key={index} style={{ backgroundColor: '#F9FAFB', padding: '15px', borderRadius: '8px', border: '1px solid #E5E7EB', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '4px' }}>Heading</label>
                      <input type="text" placeholder="OPIGS: AI-Assisted Placement Portal | Self Project" value={proj.title} onChange={(e) => updateProject(index, 'title', e.target.value)} disabled={isLocked} style={{...inputStyle, width: '100%', boxSizing: 'border-box'}} />
                    </div>

                    <div style={{ width: '160px' }}>
                      <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '4px' }}>Date</label>
                      <input type="text" placeholder="Apr '26 - Aug '26" value={proj.date} onChange={(e) => updateProject(index, 'date', e.target.value)} disabled={isLocked} style={{...inputStyle, width: '100%', boxSizing: 'border-box'}} />
                    </div>

                    {!isLocked && (
                      <button onClick={() => removeProject(index)} title="Delete this project" style={{ height: '40px', padding: '0 12px', backgroundColor: '#FEE2E2', color: '#DC2626', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                    )}
                  </div>

                  <div>
                    <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>
                      Overview <span style={{ fontWeight: '400', color: '#9CA3AF' }}>(optional — leave blank to skip on the CV)</span>
                    </label>
                    <textarea
                      placeholder="One line summarising the project."
                      value={proj.overview}
                      onChange={(e) => updateProject(index, 'overview', e.target.value)}
                      disabled={isLocked}
                      style={{...inputStyle, width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: '55px', marginTop: '4px'}} />
                  </div>

                  <div>
                    <label style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '4px' }}>Description</label>
                    <RichEditor
                      value={proj.description || ''}
                      onChange={(html) => updateProject(index, 'description', html)}
                      disabled={isLocked} />
                  </div>
                </div>
              ))}
            </div>
            
            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
              <button 
                onClick={saveProfile} 
                disabled={isLocked}
                style={{ 
                  flex: 1, padding: '14px', 
                  backgroundColor: isLocked ? '#D1D5DB' : '#10B981', 
                  color: isLocked ? '#9CA3AF' : 'white', 
                  border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '15px', 
                  cursor: isLocked ? 'not-allowed' : 'pointer'
                }}>
                {isLocked ? '🔒 Saving Disabled' : '💾 Save now'}
              </button>
              
              <button 
                onClick={generatePDF} 
                disabled={loading} 
                style={{ flex: 1, padding: '14px', backgroundColor: loading ? '#9CA3AF' : '#2563EB', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '15px', cursor: loading ? 'not-allowed' : 'pointer' }}>
                {loading ? 'Compiling LaTeX...' : '📄 Generate CV Preview'}
              </button>
            </div>
          </div>
        </div>
        
        {/* Right PDF Pane */}
        <div style={{ width: '55%', backgroundColor: '#4B5563', padding: '20px' }}>
          {pdfUrl ? (
            <iframe src={pdfUrl} width="100%" height="100%" style={{ border: 'none', borderRadius: '8px', backgroundColor: 'white' }} />
          ) : (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', border: '2px dashed #6B7280', borderRadius: '8px' }}>
              <span style={{ fontSize: '40px', marginBottom: '10px' }}>📄</span>
              <p>Your PDF preview will appear here.</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: '"Inter", "Segoe UI", Roboto, sans-serif', backgroundColor: '#F3F4F6', margin: 0, padding: 0 }}>
      {/* SIDEBAR */}
      <div style={{ width: '260px', backgroundColor: '#1E293B', color: 'white', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '24px', fontSize: '22px', fontWeight: 'bold', borderBottom: '1px solid #334155', display: 'flex', alignItems: 'center', gap: '10px' }}>
          🎓 OPIGS Portal
        </div>
        <div style={{ paddingTop: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div onClick={() => setActiveTab('notice_board')} style={navItemStyle(activeTab === 'notice_board')}>📌 Notice Board</div>
          <div onClick={() => setActiveTab('cv_builder')} style={navItemStyle(activeTab === 'cv_builder')}>📝 CV Builder</div>
          <div onClick={() => setActiveTab('companies')} style={navItemStyle(activeTab === 'companies')}>🏢 Companies</div>
          <div onClick={() => setActiveTab('kanban')} style={navItemStyle(activeTab === 'kanban')}>📋 My Applications</div>
        </div>

        {/* USER + LOGOUT */}
        <div style={{ marginTop: 'auto', padding: '20px 24px', borderTop: '1px solid #334155' }}>
          <div style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '10px' }}>
            Signed in as <strong style={{ color: '#E2E8F0' }}>{getName()}</strong>
          </div>
          <button
            onClick={logout}
            style={{ width: '100%', padding: '10px', backgroundColor: '#334155', color: '#F1F5F9', border: '1px solid #475569', borderRadius: '6px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
            Log out
          </button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, position: 'relative', overflowY: 'auto' }}>
        {activeTab === 'notice_board' && renderNoticeBoard()}
        {activeTab === 'cv_builder' && renderCVBuilder()}
        {activeTab === 'companies' && renderCompanies()}
        {activeTab === 'kanban' && renderKanban()}

        {/* AI ASSISTANT */}
        <div style={{ position: 'fixed', bottom: '30px', right: '30px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', zIndex: 1000 }}>
          {chatOpen && (
            <div style={{ width: '380px', height: '540px', backgroundColor: 'white', borderRadius: '12px', marginBottom: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #E5E7EB' }}>

              <div style={{ backgroundColor: '#2563EB', color: 'white', padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '15px' }}>🤖 Placement AI</span>
                  {chatMessages.length > 0 && (
                    <button onClick={() => setChatMessages([])} title="Clear chat"
                      style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', borderRadius: '4px', padding: '3px 9px', fontSize: '12px', cursor: 'pointer' }}>
                      Clear
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '4px', background: 'rgba(0,0,0,0.18)', padding: '3px', borderRadius: '6px' }}>
                  {[
                    { key: 'assistant', label: '💬 Assistant' },
                    { key: 'policy', label: '📖 Policy' },
                  ].map((m) => (
                    <button key={m.key}
                      onClick={() => { setChatMode(m.key); setChatMessages([]); }}
                      style={{ flex: 1, padding: '5px', fontSize: '12px', fontWeight: '600', border: 'none', borderRadius: '4px', cursor: 'pointer',
                        backgroundColor: chatMode === m.key ? '#ffffff' : 'transparent',
                        color: chatMode === m.key ? '#2563EB' : 'rgba(255,255,255,0.75)' }}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ flex: 1, padding: '14px', overflowY: 'auto', fontSize: '14px', backgroundColor: '#F9FAFB' }}>

                {chatMessages.length === 0 && (
                  <div>
                    <div style={{ backgroundColor: '#E0E7FF', padding: '12px', borderRadius: '10px', color: '#1E40AF', marginBottom: '14px', textAlign: 'left' }}>
                      {chatMode === 'policy'
                        ? `Hi ${getName()}. Ask me anything about the placement policy. I answer only from the official documents and show you the page.`
                        : `Hi ${getName()}. Paste a project description and I'll turn it into CV bullet points, or ask me anything about placements.`}
                    </div>

                    <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '8px', textAlign: 'left' }}>Try:</div>
                    {(chatMode === 'policy' ? [
                      'Can I sit for more companies after I get an offer?',
                      'What is the minimum CGPA to participate?',
                      'What happens if I skip an interview?',
                      'Can I decline a PPO?',
                    ] : [
                      'Rate my CV out of 100 and tell me what to fix',
                      'Which companies are recruiting right now?',
                      'Which CV should I use for ',
                      'Turn this into 3 CV bullets: ',
                    ]).map((q) => (
                      <div key={q}
                        onClick={() => (q.endsWith(' ') ? setChatInput(q) : sendChat(q))}
                        style={{ padding: '9px 11px', marginBottom: '7px', backgroundColor: 'white', border: '1px solid #E5E7EB', borderRadius: '8px', cursor: 'pointer', color: '#374151', fontSize: '13px', textAlign: 'left' }}>
                        {q.trim()}
                      </div>
                    ))}
                  </div>
                )}

                {chatMessages.map((m, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: '10px' }}>
                    <div style={{ maxWidth: '85%', padding: '10px 12px', borderRadius: '10px', whiteSpace: 'pre-wrap', textAlign: 'left', lineHeight: '1.5',
                      backgroundColor: m.role === 'user' ? '#2563EB' : '#ffffff',
                      color: m.role === 'user' ? '#ffffff' : '#374151',
                      border: m.role === 'user' ? 'none' : '1px solid #E5E7EB' }}>
                      {m.content}
                      {m.role === 'assistant' && (
                        <button
                          onClick={() => navigator.clipboard.writeText(m.content)}
                          style={{ display: 'block', marginTop: '8px', padding: '3px 9px', fontSize: '11px', backgroundColor: '#F3F4F6', color: '#6B7280', border: '1px solid #D1D5DB', borderRadius: '4px', cursor: 'pointer' }}>
                          📋 Copy
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {chatBusy && (
                  <div style={{ color: '#9CA3AF', fontSize: '13px', textAlign: 'left' }}>Thinking...</div>
                )}

                <div ref={chatEndRef} />
              </div>

              <div style={{ padding: '10px', borderTop: '1px solid #E5E7EB', backgroundColor: 'white', display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendChat();
                    }
                  }}
                  placeholder={chatMode === 'policy' ? 'Ask about the placement policy...' : 'Paste a project description, or ask...'}
                  rows={2}
                  style={{ flex: 1, padding: '9px', border: '1px solid #D1D5DB', borderRadius: '6px', outline: 'none', resize: 'none', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' }} />

                <button
                  onClick={() => sendChat()}
                  disabled={chatBusy || !chatInput.trim()}
                  style={{ padding: '10px 14px', backgroundColor: chatBusy || !chatInput.trim() ? '#E5E7EB' : '#2563EB', color: chatBusy || !chatInput.trim() ? '#9CA3AF' : 'white', border: 'none', borderRadius: '6px', cursor: chatBusy || !chatInput.trim() ? 'not-allowed' : 'pointer', fontWeight: '600' }}>
                  ➤
                </button>
              </div>
            </div>
          )}

          <button onClick={() => setChatOpen(!chatOpen)} style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#2563EB', color: 'white', border: 'none', fontSize: '28px', cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(37, 99, 235, 0.4)', transition: 'transform 0.2s' }} onMouseOver={(e) => e.target.style.transform = 'scale(1.05)'} onMouseOut={(e) => e.target.style.transform = 'scale(1)'}>
            💬
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;

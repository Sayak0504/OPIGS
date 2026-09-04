import { useState, useEffect } from 'react';

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

  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/notices')
      .then(res => res.json())
      .then(data => setNotices(data))
      .catch(err => console.error("Error fetching notices:", err));

    fetch('http://127.0.0.1:8000/api/jobs')
      .then(res => res.json())
      .then(data => setJobs(data))
      .catch(err => console.error("Error fetching jobs:", err));
  }, []);

  // --- CV Builder State ---
  const [name, setName] = useState('Sayak Sardar');
  const [rollNumber, setRollNumber] = useState('23IE10036');
  const [email, setEmail] = useState('sayak@example.com');
  const [phone, setPhone] = useState('+91 9876543210');
  const [skills, setSkills] = useState('C++, Python, Embedded Systems');
  
  // Dynamic Projects Array
  const [projects, setProjects] = useState([]);
  
  const [pdfUrl, setPdfUrl] = useState(null);
  const [loading, setLoading] = useState(false);

  // Helper to add a new empty project to the form
  const addProject = () => {
    setProjects([...projects, { title: '', location: 'IIT Kharagpur', date: '', overview: '', points: [''] }]);
  };

  // Helper to update a specific project's text
  const updateProject = (index, field, value) => {
    const updatedProjects = [...projects];
    updatedProjects[index][field] = value;
    setProjects(updatedProjects);
  };

  const saveProfile = async () => {
    try {
      const response = await fetch('http://127.0.0.1:8000/api/student/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name, 
          roll_number: rollNumber,
          program: "INSTRUMENTATION ENGINEERING (B.Tech)",
          phone: phone,
          email: email,
          linkedin_url: "https://linkedin.com/in/sayaksardar",
          linkedin_name: "Sayak Sardar",
          photo_filename: "photo.jpg",
          education: [{ year: "2027", degree: "B.Tech", institute: "IIT Kharagpur", score: "8.50/10" }],
          projects: projects.map(p => ({
            ...p,
            points: [p.overview] 
          })), 
          internships: [],
          tech_skills: skills,
          core_expertise: "Algorithms, Hardware Interfacing"
        })
      });

      if (response.ok) {
        alert("Profile saved to database successfully!");
      } else {
        alert("Error saving profile. Is the backend running?");
      }
    } catch (error) {
      console.error("Error saving profile:", error);
      alert("Failed to connect to backend server.");
    }
  };

  const generatePDF = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://127.0.0.1:8000/api/generate-cv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name, 
          roll_number: rollNumber,
          program: "INSTRUMENTATION ENGINEERING (B.Tech)",
          phone: phone,
          email: email,
          linkedin_url: "https://linkedin.com/in/sayaksardar",
          linkedin_name: "Sayak Sardar",
          photo_filename: "photo.jpg",
          education: [{ year: "2027", degree: "B.Tech", institute: "IIT Kharagpur", score: "8.50/10" }],
          projects: projects.map(p => ({
            ...p,
            points: [p.overview] 
          })), 
          internships: [],
          tech_skills: skills,
          core_expertise: "Algorithms, Hardware Interfacing"
        })
      });

      if (response.ok) {
        const blob = await response.blob();
        setPdfUrl(URL.createObjectURL(blob));
      }
    } catch (error) {
      console.error(error);
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
            <select style={{ padding: '10px', borderRadius: '6px', border: '1px solid #D1D5DB', backgroundColor: '#F9FAFB', color: '#374151', outline: 'none' }}>
              <option>Base_CV.pdf</option>
              <option>Core_Embedded_CV.pdf</option>
              <option>Software_CV.pdf</option>
            </select>
            <button style={{ padding: '10px 24px', backgroundColor: '#10B981', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)' }}>
              Apply
            </button>
          </div>
        </div>
      ))}
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', textAlign: 'left', paddingBottom: '40px' }}>
            
            {/* Basic Info */}
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
                <div key={index} style={{ backgroundColor: '#F9FAFB', padding: '15px', borderRadius: '8px', border: '1px solid #E5E7EB', marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <input type="text" placeholder="Project Title" value={proj.title} onChange={(e) => updateProject(index, 'title', e.target.value)} disabled={isLocked} style={inputStyle} />
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input type="text" placeholder="Location" value={proj.location} onChange={(e) => updateProject(index, 'location', e.target.value)} disabled={isLocked} style={{...inputStyle, flex: 1}} />
                    <input type="text" placeholder="Date" value={proj.date} onChange={(e) => updateProject(index, 'date', e.target.value)} disabled={isLocked} style={{...inputStyle, width: '100px'}} />
                  </div>
                  <textarea placeholder="One line overview..." value={proj.overview} onChange={(e) => updateProject(index, 'overview', e.target.value)} disabled={isLocked} style={{...inputStyle, resize: 'vertical', minHeight: '60px'}} />
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
                {isLocked ? '🔒 Saving Disabled' : '💾 Save Profile Data'}
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
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, position: 'relative', overflowY: 'auto' }}>
        {activeTab === 'notice_board' && renderNoticeBoard()}
        {activeTab === 'cv_builder' && renderCVBuilder()}
        {activeTab === 'companies' && renderCompanies()}

        {/* AI ASSISTANT */}
        <div style={{ position: 'fixed', bottom: '30px', right: '30px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', zIndex: 1000 }}>
          {chatOpen && (
            <div style={{ width: '320px', height: '420px', backgroundColor: 'white', borderRadius: '12px', marginBottom: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #E5E7EB' }}>
              <div style={{ backgroundColor: '#2563EB', color: 'white', padding: '16px', fontWeight: 'bold', fontSize: '15px' }}>
                🤖 Placement AI Assistant
              </div>
              <div style={{ flex: 1, padding: '16px', overflowY: 'auto', fontSize: '14px', color: '#374151', backgroundColor: '#F9FAFB' }}>
                <div style={{ backgroundColor: '#E0E7FF', padding: '12px', borderRadius: '8px', color: '#1E40AF', marginBottom: '10px' }}>
                  <strong>AI:</strong> Hi Sayak! I see you are applying to Samsung R&D. Do you want me to review your Embedded Systems CV before you apply?
                </div>
              </div>
              <div style={{ padding: '12px', borderTop: '1px solid #E5E7EB', backgroundColor: 'white' }}>
                <input type="text" placeholder="Ask about policies, JDs..." style={{ width: '100%', padding: '10px', border: '1px solid #D1D5DB', borderRadius: '6px', outline: 'none', boxSizing: 'border-box' }} />
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

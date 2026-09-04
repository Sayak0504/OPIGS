from fastapi import Depends
from sqlalchemy.orm import Session
import models
from database import engine, get_db
models.Base.metadata.create_all(bind=engine)
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
import subprocess
import os
import jinja2

app = FastAPI(title="OPIGS CV Generator API")

# Allow React (which runs on port 5173) to communicate with this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Define the Data Structure we expect from React ---
class Education(BaseModel):
    year: str
    degree: str
    institute: str
    score: str

class Experience(BaseModel):
    title: Optional[str] = None
    role: Optional[str] = None
    company: Optional[str] = None
    location: Optional[str] = None
    date: str
    overview: str
    points: List[str]

class CVData(BaseModel):
    name: str
    roll_number: str
    program: str
    phone: str
    email: str
    linkedin_url: str
    linkedin_name: str
    photo_filename: str = "photo.jpg" # Defaulting to the photo we added
    education: List[Education]
    projects: List[Experience]
    internships: List[Experience]
    tech_skills: str
    core_expertise: str

# --- The API Endpoint ---
@app.post("/api/generate-cv")
async def generate_cv(data: CVData):
    # 1. Configure Jinja2 for LaTeX
    latex_jinja_env = jinja2.Environment(
        block_start_string='<%',
        block_end_string='%>',
        variable_start_string='<<',
        variable_end_string='>>',
        comment_start_string='<#',
        comment_end_string='#>',
        trim_blocks=True,
        autoescape=False,
        loader=jinja2.FileSystemLoader(os.path.abspath('.'))
    )

    try:
        template = latex_jinja_env.get_template('template.tex')
    except jinja2.exceptions.TemplateNotFound:
        raise HTTPException(status_code=500, detail="LaTeX template not found.")

    # 2. Inject React data into the template
    rendered_tex = template.render(data.dict())

    # 3. Save to a temporary file
    temp_filename = "output.tex"
    pdf_filename = "output.pdf"
    
    with open(temp_filename, "w", encoding="utf-8") as file:
        file.write(rendered_tex)

    # 4. Compile the PDF
    try:
        subprocess.run(
            ["pdflatex", "-interaction=nonstopmode", temp_filename],
            check=True,
            stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE
        )
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"LaTeX Error: {e.stderr.decode('utf-8')}")

    # 5. Send the generated PDF back to the web browser
    if not os.path.exists(pdf_filename):
        raise HTTPException(status_code=500, detail="PDF failed to generate.")
        
    return FileResponse(
        path=pdf_filename, 
        media_type='application/pdf', 
        filename=f"{data.name.replace(' ', '_')}_CV.pdf"
    )
# --- Database API Routes ---

@app.get("/api/notices")
def get_notices(db: Session = Depends(get_db)):
    notices = db.query(models.Notice).all()
    return notices

@app.get("/api/jobs")
def get_jobs(db: Session = Depends(get_db)):
    jobs = db.query(models.Job).all()
    return jobs

@app.post("/api/student/save")
def save_student_profile(data: CVData, db: Session = Depends(get_db)):
    # Check if student exists by roll number
    profile = db.query(models.StudentProfile).filter(models.StudentProfile.roll_number == data.roll_number).first()
    
    if profile:
        # Update existing
        profile.full_name = data.name
        profile.email = data.email
        profile.phone = data.phone
        profile.tech_skills = data.tech_skills
        profile.projects = [p.dict() for p in data.projects]
    else:
        # Create new
        profile = models.StudentProfile(
            full_name=data.name,
            roll_number=data.roll_number,
            email=data.email,
            phone=data.phone,
            tech_skills=data.tech_skills,
            projects=[p.dict() for p in data.projects]
        )
        db.add(profile)
    
    db.commit()
    return {"status": "success", "message": "Profile saved."}

@app.get("/api/student/{roll_number}")
def get_student_profile(roll_number: str, db: Session = Depends(get_db)):
    profile = db.query(models.StudentProfile).filter(models.StudentProfile.roll_number == roll_number).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile

from routes_auth import router as auth_router
from fastapi import Depends
from sqlalchemy.orm import Session
import models
from database import engine, get_db
from auth import get_current_user
models.Base.metadata.create_all(bind=engine)
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
import subprocess
import os
import jinja2
import shutil
from fastapi import UploadFile, File

app = FastAPI(title="OPIGS CV Generator API")
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
ALLOWED_IMAGES = {"image/jpeg": ".jpg", "image/png": ".png"}
app.include_router(auth_router)

# Allow React (which runs on port 5173) to communicate with this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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
async def generate_cv(
    data: CVData,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    temp_filename = f"output_{user.id}.tex"
    pdf_filename  = f"output_{user.id}.pdf"
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
    payload = data.dict()

    profile = db.query(models.StudentProfile).filter(
        models.StudentProfile.user_id == user.id
    ).first()

    if profile and profile.photo_filename and os.path.exists(profile.photo_filename):
        payload["photo_filename"] = profile.photo_filename
    else:
        payload["photo_filename"] = "photo.jpg"   # fallback placeholder

    rendered_tex = template.render(payload)

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
def save_student_profile(
    data: CVData,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if user.role != "student":
        raise HTTPException(403, "Only students can save a CV profile")

    # Someone else already claimed this roll number?
    clash = db.query(models.StudentProfile).filter(
        models.StudentProfile.roll_number == data.roll_number,
        models.StudentProfile.user_id != user.id,
    ).first()
    if clash:
        raise HTTPException(400, "That roll number belongs to another account")

    # Find MY profile — by user_id, never by roll number
    profile = db.query(models.StudentProfile).filter(
        models.StudentProfile.user_id == user.id
    ).first()

    if not profile:
        profile = models.StudentProfile(user_id=user.id)
        db.add(profile)

    profile.full_name      = data.name
    profile.roll_number    = data.roll_number
    profile.email          = data.email
    profile.phone          = data.phone
    profile.program        = data.program
    profile.linkedin_url   = data.linkedin_url
    profile.linkedin_name  = data.linkedin_name
    profile.tech_skills    = data.tech_skills
    profile.core_expertise = data.core_expertise
    profile.projects       = [p.dict() for p in data.projects]

    if data.education:
        edu = data.education[0]
        profile.degree       = edu.degree
        profile.institute    = edu.institute
        profile.passing_year = edu.year
        profile.cgpa         = edu.score

    db.commit()
    return {"status": "success", "message": "Profile saved."}


@app.get("/api/student/me")
def get_my_profile(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    profile = db.query(models.StudentProfile).filter(
        models.StudentProfile.user_id == user.id
    ).first()

    if profile:
        return profile

    # Nothing saved yet — prefill the form from the account
    return {
        "full_name": user.full_name,
        "roll_number": "",
        "email": user.email,
        "phone": "",
        "program": "",
        "degree": "",
        "institute": "",
        "passing_year": "",
        "cgpa": "",
        "linkedin_url": "",
        "linkedin_name": "",
        "tech_skills": "",
        "core_expertise": "",
        "projects": [],
    }

@app.post("/api/student/photo")
async def upload_photo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if user.role != "student":
        raise HTTPException(403, "Only students can upload a photo")

    ext = ALLOWED_IMAGES.get(file.content_type)
    if not ext:
        raise HTTPException(400, "Please upload a JPG or PNG image")

    contents = await file.read()
    if len(contents) > 2 * 1024 * 1024:
        raise HTTPException(400, "Image must be under 2 MB")

    # clear any earlier photo saved with a different extension
    for old_ext in ALLOWED_IMAGES.values():
        old_path = os.path.join(UPLOAD_DIR, f"photo_{user.id}{old_ext}")
        if os.path.exists(old_path):
            os.remove(old_path)

    saved_path = f"{UPLOAD_DIR}/photo_{user.id}{ext}"
    with open(saved_path, "wb") as out:
        out.write(contents)

    profile = db.query(models.StudentProfile).filter(
        models.StudentProfile.user_id == user.id
    ).first()
    if not profile:
        profile = models.StudentProfile(
            user_id=user.id, full_name=user.full_name, email=user.email
        )
        db.add(profile)

    profile.photo_filename = saved_path
    db.commit()
    return {"status": "success", "photo_filename": saved_path}


@app.get("/api/student/photo")
def get_my_photo(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    profile = db.query(models.StudentProfile).filter(
        models.StudentProfile.user_id == user.id
    ).first()

    if not profile or not profile.photo_filename or not os.path.exists(profile.photo_filename):
        raise HTTPException(404, "No photo uploaded yet")

    return FileResponse(profile.photo_filename)

STAGES = ("applied", "shortlisted", "interviewing")


class ApplyIn(BaseModel):
    job_id: int
    cv_name: Optional[str] = None


class StatusIn(BaseModel):
    status: str


@app.post("/api/applications")
def apply_to_job(
    data: ApplyIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if user.role != "student":
        raise HTTPException(403, "Only students can apply")

    job = db.query(models.Job).filter(models.Job.id == data.job_id).first()
    if not job:
        raise HTTPException(404, "That job posting no longer exists")

    already = db.query(models.Application).filter(
        models.Application.user_id == user.id,
        models.Application.job_id == data.job_id,
    ).first()
    if already:
        raise HTTPException(400, f"You have already applied to {job.company_name}")

    row = models.Application(
        user_id=user.id,
        job_id=data.job_id,
        cv_name=data.cv_name or "Base_CV.pdf",
    )
    db.add(row)
    db.commit()
    return {"status": "success", "message": f"Applied to {job.company_name}"}


@app.get("/api/applications")
def my_applications(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    rows = (
        db.query(models.Application, models.Job)
        .join(models.Job, models.Application.job_id == models.Job.id)
        .filter(models.Application.user_id == user.id)
        .all()
    )

    return [
        {
            "id": a.id,
            "status": a.status,
            "cv_name": a.cv_name,
            "job_id": j.id,
            "company_name": j.company_name,
            "role": j.role,
            "ctc": j.ctc,
        }
        for a, j in rows
    ]


@app.patch("/api/applications/{application_id}")
def move_application(
    application_id: int,
    data: StatusIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if data.status not in STAGES:
        raise HTTPException(400, "Unknown stage")

    row = db.query(models.Application).filter(
        models.Application.id == application_id,
        models.Application.user_id == user.id,
    ).first()
    if not row:
        raise HTTPException(404, "Application not found")

    row.status = data.status
    db.commit()
    return {"status": "success"}


@app.delete("/api/applications/{application_id}")
def withdraw_application(
    application_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    row = db.query(models.Application).filter(
        models.Application.id == application_id,
        models.Application.user_id == user.id,
    ).first()
    if not row:
        raise HTTPException(404, "Application not found")

    db.delete(row)
    db.commit()
    return {"status": "success"}


@app.get("/api/student/{roll_number}")
def get_student_profile(
    roll_number: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if user.role not in ("admin", "recruiter"):
        raise HTTPException(403, "Not allowed")

    profile = db.query(models.StudentProfile).filter(
        models.StudentProfile.roll_number == roll_number
    ).first()
    if not profile:
        raise HTTPException(404, "Profile not found")
    return profile
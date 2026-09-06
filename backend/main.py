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
from ai import ask_gemini, ask_gemini_json



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

LATEX_SPECIAL = {
    "\\": r"\textbackslash{}",
    "&": r"\&",
    "%": r"\%",
    "$": r"\$",
    "#": r"\#",
    "_": r"\_",
    "{": r"\{",
    "}": r"\}",
    "~": r"\textasciitilde{}",
    "^": r"\textasciicircum{}",
}


UNICODE_MAP = {
    "≤": r"$\leq$", "≥": r"$\geq$", "×": r"$\times$", "±": r"$\pm$",
    "→": r"$\rightarrow$", "°": r"$^\circ$", "µ": r"$\mu$", "Ω": r"$\Omega$",
    "α": r"$\alpha$", "β": r"$\beta$", "λ": r"$\lambda$", "∞": r"$\infty$",
    "≈": r"$\approx$", "≠": r"$\neq$", "∑": r"$\sum$",
    "—": "---", "–": "--", "•": r"$\bullet$",
    "\u2018": "`", "\u2019": "'", "\u201c": "``", "\u201d": "''",
    "\xa0": " ",
}


def latex_escape(text):
    if text is None:
        return ""
    out = []
    for ch in str(text):
        if ch in LATEX_SPECIAL:
            out.append(LATEX_SPECIAL[ch])
        elif ch in UNICODE_MAP:
            out.append(UNICODE_MAP[ch])
        else:
            out.append(ch)
    return "".join(out)


def escape_payload(value):
    if isinstance(value, str):
        return latex_escape(value)
    if isinstance(value, list):
        return [escape_payload(v) for v in value]
    if isinstance(value, dict):
        return {k: escape_payload(v) for k, v in value.items()}
    return value
from html.parser import HTMLParser


class HTMLToLatex(HTMLParser):
    """Turns the editor's HTML into LaTeX the template can compile."""

    WRAPPERS = {
        "strong": r"\textbf{", "b": r"\textbf{",
        "em": r"\textit{", "i": r"\textit{",
        "u": r"\underline{",
        "sup": r"\textsuperscript{", "sub": r"\textsubscript{",
    }

    def __init__(self):
        super().__init__()
        self.out = []
        self.depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in self.WRAPPERS:
            self.out.append(self.WRAPPERS[tag])
        elif tag == "ul":
            self.depth += 1
            self.out.append("\n\\begin{itemize}[leftmargin=1.5em, label={$\\bullet$}, itemsep=0pt, parsep=0pt, topsep=1pt]\n")
        elif tag == "ol":
            self.depth += 1
            self.out.append("\n\\begin{enumerate}[leftmargin=1.6em, itemsep=0pt, parsep=0pt, topsep=1pt]\n")
        elif tag == "li":
            self.out.append("  \\item ")
        elif tag == "br":
            self.out.append(" \\\\\n")

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        if tag in self.WRAPPERS:
            self.out.append("}")
        elif tag == "ul":
            self.depth -= 1
            self.out.append("\\end{itemize}\n")
        elif tag == "ol":
            self.depth -= 1
            self.out.append("\\end{enumerate}\n")
        elif tag == "li":
            self.out.append("\n")
        elif tag == "p":
            self.out.append(" " if self.depth else "\n\n")

    def handle_data(self, data):
        self.out.append(latex_escape(data))

    def result(self):
        return "".join(self.out).strip()


def html_to_latex(html):
    if not html or not html.strip():
        return ""
    parser = HTMLToLatex()
    parser.feed(html)
    return parser.result()

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
    date: str = ""
    overview: str = ""
    description: Optional[str] = ""
    points: Optional[List[str]] = None   # legacy, kept so old saved profiles still load

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
    raw_payload = data.dict()
    payload = escape_payload(raw_payload)

    # URLs and file paths must stay unescaped — an escaped "_" would break them
    payload["linkedin_url"] = raw_payload.get("linkedin_url", "")
    for i, proj in enumerate(payload.get("projects", [])):
        raw_desc = raw_payload["projects"][i].get("description") or ""
        proj["description_tex"] = html_to_latex(raw_desc)

    profile = db.query(models.StudentProfile).filter(
        models.StudentProfile.user_id == user.id
    ).first()

    if profile and profile.photo_filename and os.path.exists(profile.photo_filename):
        payload["photo_filename"] = profile.photo_filename
    else:
        payload["photo_filename"] = "photo.jpg"

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


class MagicWriteIn(BaseModel):
    title: str
    notes: str
    count: int = 3


@app.post("/api/ai/magic-write")
def magic_write(
    data: MagicWriteIn,
    user: models.User = Depends(get_current_user),
):
    if not data.notes.strip():
        raise HTTPException(400, "Describe the project first")

    count = max(1, min(data.count, 5))

    prompt = f"""Turn a student's project description into CV bullet points.

Rules:
- Return exactly {count} bullets, one per line, each starting with "- "
- Start each bullet with a strong past-tense action verb (Built, Designed, Implemented, Reduced, Automated)
- Keep each bullet under 25 words
- Each bullet must cover a DIFFERENT aspect: what was built, how it was built, what it achieved
- Keep any numbers the student gave, but NEVER invent numbers, tools, or results
- Plain text only. No markdown, no preamble

Project title: {data.title}
Description: {data.notes}"""

    raw = ask_gemini(prompt)
    bullets = [
        line.lstrip("-•* ").strip()
        for line in raw.split("\n")
        if line.strip()
    ]
    return {"bullets": bullets[:count]}

# ============ AI WRITING TOOLS ============

POLISH_ACTIONS = {
    "rephrase": "Rewrite it more clearly and professionally.",
    "shorten":  "Make it noticeably shorter while keeping every fact.",
    "impact":   "Rewrite it to open with a strong past-tense action verb and end with the result.",
    "formal":   "Rewrite it in a formal technical register suitable for a CV.",
}


class PolishIn(BaseModel):
    text: str
    action: str


@app.post("/api/ai/polish")
def polish_text(
    data: PolishIn,
    user: models.User = Depends(get_current_user),
):
    instruction = POLISH_ACTIONS.get(data.action)
    if not instruction:
        raise HTTPException(400, "Unknown action")
    if not data.text.strip():
        raise HTTPException(400, "Select some text first")

    prompt = f"""You edit sentences in an engineering student's CV.

Task: {instruction}

Rules:
- Return ONLY the edited text. No quotes, no preamble, no explanation
- Keep every technical term, tool name and number exactly as written
- NEVER invent numbers, tools, or achievements
- Keep it to roughly the same length unless asked to shorten

Text:
{data.text}"""

    return {"text": ask_gemini(prompt).strip().strip('"')}


class GrammarIn(BaseModel):
    text: str


@app.post("/api/ai/grammar")
def check_grammar(
    data: GrammarIn,
    user: models.User = Depends(get_current_user),
):
    if len(data.text.strip()) < 10:
        return {"issues": []}

    prompt = f"""You are a proofreader for engineering CVs.

Find spelling, grammar and style problems in the text below.

Return ONLY a JSON object shaped exactly like this:
{{"issues": [{{"original": "...", "suggestion": "...", "type": "spelling", "reason": "..."}}]}}

Rules:
- "original" MUST be copied character for character from the text so it can be found and replaced
- Keep "original" short — just the words that need changing, not the whole sentence
- "type" is one of: spelling, grammar, style
- "reason" is at most 8 words
- NEVER flag technical terms, tool names, libraries or acronyms as spelling errors.
  FastAPI, SQLAlchemy, Jinja2, PyTorch, Kanban, JWT, LaTeX, npm are all correct.
- Do not suggest changes that add facts or numbers
- At most 8 issues. If the text is clean, return {{"issues": []}}

Text:
{data.text}"""

    result = ask_gemini_json(prompt)
    issues = result.get("issues", []) if isinstance(result, dict) else []
    return {"issues": issues[:8]}


class AutocompleteIn(BaseModel):
    text: str


@app.post("/api/ai/autocomplete")
def autocomplete(
    data: AutocompleteIn,
    user: models.User = Depends(get_current_user),
):
    tail = data.text[-600:]
    if len(tail.strip()) < 15:
        return {"completion": ""}

    prompt = f"""Continue the sentence a student is typing in a CV project description.

Rules:
- Return ONLY the continuation, between 3 and 10 words
- Do not repeat words already written
- Do not start a new sentence
- NEVER invent numbers, tools, or results
- Plain text only, no quotes

Text so far:
{tail}"""

    return {"completion": ask_gemini(prompt).strip().strip('"')}
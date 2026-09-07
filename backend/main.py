import re
from routes_auth import router as auth_router
from fastapi import Depends
from sqlalchemy.orm import Session
import models
import rag
from ai import embed_texts
from database import engine, get_db
from auth import get_current_user
models.Base.metadata.create_all(bind=engine)
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr
from typing import List, Optional
import subprocess
import os
import jinja2
import shutil
from fastapi import UploadFile, File
from ai import ask_gemini, ask_gemini_json
from auth import get_current_user, hash_password, verify_password


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
def get_notices(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    return (
        db.query(models.Notice)
        .order_by(models.Notice.id.desc())
        .all()
    )


@app.get("/api/jobs")
def get_jobs(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    q = db.query(models.Job)

    if user.role == "admin":
        pass                                        # admin sees everything
    elif user.role == "recruiter":
        q = q.filter(models.Job.company_name == user.company_name)
    else:
        q = q.filter(models.Job.status == "approved")   # students and alumni

    return q.order_by(models.Job.id.desc()).all()

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


# ============ PLACEMENT CHATBOT ============


def strip_html(html):
    """Editor HTML to readable plain text, for feeding the model."""
    if not html:
        return ""

    class _Stripper(HTMLParser):
        def __init__(self):
            super().__init__()
            self.parts = []

        def handle_starttag(self, tag, attrs):
            if tag == "li":
                self.parts.append("\n- ")
            elif tag in ("p", "br", "ul", "ol"):
                self.parts.append("\n")

        def handle_data(self, data):
            self.parts.append(data)

    s = _Stripper()
    s.feed(html)
    lines = [ln.strip() for ln in "".join(s.parts).split("\n")]
    return "\n".join(ln for ln in lines if ln)


def build_portal_context(db, user):
    """Everything the assistant is allowed to see about this student."""
    L = [f"STUDENT: {user.full_name} ({user.email})"]

    profile = db.query(models.StudentProfile).filter(
        models.StudentProfile.user_id == user.id
    ).first()

    if profile:
        L.append("\n--- THEIR CV ---")
        L.append(f"Roll number: {profile.roll_number or 'not filled'}")
        L.append(f"Program: {profile.program or 'not filled'} | Degree: {profile.degree or 'not filled'} "
                 f"| Institute: {profile.institute or 'not filled'} | Graduating: {profile.passing_year or 'not filled'} "
                 f"| CGPA: {profile.cgpa or 'not filled'}")
        L.append(f"Phone: {profile.phone or 'not filled'} | LinkedIn: {profile.linkedin_url or 'not filled'}")
        L.append(f"Photo uploaded: {'yes' if profile.photo_filename else 'NO'}")
        L.append(f"Technical skills: {profile.tech_skills or 'NONE LISTED'}")
        L.append(f"Core expertise: {profile.core_expertise or 'NONE LISTED'}")

        projects = profile.projects or []
        if projects:
            L.append(f"Projects ({len(projects)}):")
            for p in projects:
                L.append(f"  * {p.get('title') or 'Untitled'}  [{p.get('date') or 'no date'}]")
                if p.get("overview"):
                    L.append(f"    Overview: {p['overview']}")
                body = strip_html(p.get("description", ""))
                for ln in body.split("\n"):
                    if ln:
                        L.append(f"    {ln}")
        else:
            L.append("Projects: NONE ADDED YET")
    else:
        L.append("\n--- THEIR CV ---\nThe student has not filled in their CV at all yet.")

    jobs = db.query(models.Job).filter(models.Job.status == "approved").all()
    if jobs:
        L.append("\n--- COMPANIES CURRENTLY RECRUITING ---")
        for j in jobs:
            L.append(f"  * {j.company_name} — role: {j.role}, CTC: {j.ctc}, deadline: {j.deadline}")
    else:
        L.append("\n--- COMPANIES ---\nNo companies are listed on the portal right now.")

    rows = (
        db.query(models.Application, models.Job)
        .join(models.Job, models.Application.job_id == models.Job.id)
        .filter(models.Application.user_id == user.id)
        .all()
    )
    if rows:
        L.append("\n--- THEIR APPLICATIONS ---")
        for a, j in rows:
            L.append(f"  * {j.company_name} ({j.role}) — stage: {a.status}, CV submitted: {a.cv_name}")
    else:
        L.append("\n--- THEIR APPLICATIONS ---\nThey have not applied anywhere yet.")

    notices = db.query(models.Notice).all()
    if notices:
        L.append("\n--- NOTICE BOARD ---")
        for n in notices:
            L.append(f"  * [{n.category}] {n.title}: {n.content}")

    return "\n".join(L)


CHAT_SYSTEM = """You are the OPIGS placement assistant, helping an engineering student with their CV and campus placements.

You can see this student's live portal data below: their CV, the companies currently recruiting, their applications, and the notice board. Answer questions about any of it directly and specifically. NEVER tell the student to go and check the portal themselves — you are looking at the same data they are.

How to reply:
- Be concise. Two or three sentences unless more is genuinely needed.
- Answer only from the portal data given. If something is not in it, say plainly that it is not on the portal rather than guessing.
- NEVER invent companies, deadlines, numbers, tools or results.
- Plain text only. No markdown bold, no headings.

When asked to turn a project description into bullet points:
- Reply with ONLY those lines, each starting with "- ". No intro, no closing sentence.
- Each bullet opens with a past-tense action verb, stays under 25 words, and covers a different aspect.
- If a bullet would be stronger with a metric, ask the student for the number instead of inventing one.

When asked which CV to use for a company:
- Compare that company's role against the student's actual listed skills and projects.
- Recommend one of Base_CV.pdf, Core_Embedded_CV.pdf or Software_CV.pdf, say which project to lead with, and name any skill gap worth addressing.

When asked to rate, score or review the CV:
- Score five areas out of 20 each: Completeness (all fields filled, photo, contacts), Impact (action verbs and outcomes), Quantification (real numbers present), Technical specificity (named tools, not vague claims), Writing quality (concise, no typos, consistent tense).
- Give the total out of 100, then the five sub-scores on separate lines, then the three most important fixes.
- Be honest. A CV with empty fields and no numbers should score badly. Do not be encouraging at the cost of being useful.

If asked something unrelated to CVs, placements, interviews or projects, say briefly that you focus on placement help."""


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatIn(BaseModel):
    messages: List[ChatMessage]


@app.post("/api/ai/chat")
def ai_chat(
    data: ChatIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if not data.messages:
        raise HTTPException(400, "No message sent")

    context = build_portal_context(db, user)

    recent = data.messages[-12:]
    transcript = "\n\n".join(
        f"{'Student' if m.role == 'user' else 'Assistant'}: {m.content}"
        for m in recent
    )

    prompt = (
        f"{CHAT_SYSTEM}\n\n"
        f"===== LIVE PORTAL DATA =====\n{context}\n"
        f"===== END PORTAL DATA =====\n\n"
        f"{transcript}\n\nAssistant:"
    )

    return {"reply": ask_gemini(prompt)}

# ============ RAG POLICY BOT ============

POLICY_DIR = "policies"
os.makedirs(POLICY_DIR, exist_ok=True)


@app.post("/api/policy/upload")
async def upload_policy(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if user.role != "admin":
        raise HTTPException(403, "Only the placement cell can upload policy documents")
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Please upload a PDF")

    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(400, "PDF must be under 10 MB")

    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", file.filename)
    path = os.path.join(POLICY_DIR, safe_name)
    with open(path, "wb") as out:
        out.write(contents)

    # replace any previous version of this document
    db.query(models.PolicyChunk).filter(
        models.PolicyChunk.doc_name == safe_name
    ).delete()
    db.commit()

    chunks = rag.build_chunks(path, safe_name)
    if not chunks:
        raise HTTPException(400, "No readable text found — is this a scanned PDF?")

    chunks = rag.embed_chunks(chunks)
    for c in chunks:
        db.add(models.PolicyChunk(**c))
    db.commit()

    return {"status": "success", "doc_name": safe_name, "chunks": len(chunks)}


@app.get("/api/policy/documents")
def list_policies(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    rows = db.query(models.PolicyChunk.doc_name).distinct().all()
    return {"documents": [r[0] for r in rows]}


@app.delete("/api/policy/{doc_name}")
def delete_policy(
    doc_name: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if user.role != "admin":
        raise HTTPException(403, "Only the placement cell can remove policy documents")

    deleted = db.query(models.PolicyChunk).filter(
        models.PolicyChunk.doc_name == doc_name
    ).delete()
    db.commit()
    return {"status": "success", "removed_chunks": deleted}


class PolicyAskIn(BaseModel):
    question: str


@app.post("/api/policy/ask")
def ask_policy(
    data: PolicyAskIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if not data.question.strip():
        raise HTTPException(400, "Ask a question")

    rows = db.query(models.PolicyChunk).all()
    if not rows:
        return {
            "answer": "No placement policy documents have been uploaded yet, so I can't answer policy questions.",
            "sources": [],
        }

    hits = rag.search(data.question, rows, top_k=5)
    hits = [(r, s) for r, s in hits if s > 0.35]

    if not hits:
        return {
            "answer": "I could not find anything about that in the placement policy documents.",
            "sources": [],
        }

    passages = "\n\n".join(
        f"[{i + 1}] ({r.doc_name}, page {r.page})\n{r.content}"
        for i, (r, _) in enumerate(hits)
    )

    prompt = f"""Answer a student's question using ONLY the placement policy extracts below.

Rules:
- Answer from the extracts and nothing else. Do not use general knowledge about placements.
- If the extracts do not contain the answer, say so plainly. Do not guess.
- Cite the passage number in square brackets after each claim, like [2].
- Be concise: three or four sentences.
- Plain text only.

EXTRACTS:
{passages}

QUESTION: {data.question}

ANSWER:"""

    return {
        "answer": ask_gemini(prompt),
        "sources": [
            {"doc": r.doc_name, "page": r.page, "score": round(s, 3),
             "preview": r.content[:180] + ("..." if len(r.content) > 180 else "")}
            for r, s in hits
        ],
    }

# ============ RECRUITER VIEW ============

@app.get("/api/recruiter/applicants")
def recruiter_applicants(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if user.role != "recruiter":
        raise HTTPException(403, "Recruiters only")
    if not user.is_verified:
        raise HTTPException(403, "Your account is awaiting institute approval")

    jobs = db.query(models.Job).filter(
        models.Job.company_name == user.company_name
    ).all()
    job_ids = [j.id for j in jobs]

    if not job_ids:
        return {"company": user.company_name, "jobs": [], "applicants": []}

    rows = (
        db.query(models.Application, models.StudentProfile, models.Job)
        .join(models.StudentProfile, models.Application.user_id == models.StudentProfile.user_id)
        .join(models.Job, models.Application.job_id == models.Job.id)
        .filter(models.Application.job_id.in_(job_ids))
        .all()
    )

    return {
        "company": user.company_name,
        "jobs": [{"id": j.id, "role": j.role, "ctc": j.ctc} for j in jobs],
        "applicants": [
            {
                "application_id": a.id,
                "status": a.status,
                "cv_name": a.cv_name,
                "job_role": j.role,
                "name": p.full_name,
                "roll_number": p.roll_number,
                "program": p.program,
                "cgpa": p.cgpa,
                "passing_year": p.passing_year,
                "tech_skills": p.tech_skills,
                "core_expertise": p.core_expertise,
                "projects": [
                    {"title": pr.get("title"), "overview": pr.get("overview"),
                     "description": strip_html(pr.get("description", ""))}
                    for pr in (p.projects or [])
                ],
            }
            for a, p, j in rows
        ],
    }


@app.patch("/api/recruiter/applicants/{application_id}")
def recruiter_set_status(
    application_id: int,
    data: StatusIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if user.role != "recruiter" or not user.is_verified:
        raise HTTPException(403, "Recruiters only")
    if data.status not in STAGES:
        raise HTTPException(400, "Unknown stage")

    row = (
        db.query(models.Application)
        .join(models.Job, models.Application.job_id == models.Job.id)
        .filter(
            models.Application.id == application_id,
            models.Job.company_name == user.company_name,
        )
        .first()
    )
    if not row:
        raise HTTPException(404, "Application not found for your company")

    row.status = data.status
    db.commit()
    return {"status": "success"}


# ============ ALUMNI INTERVIEW BANK ============

class ExperienceIn(BaseModel):
    company_name: str
    role: str
    year: Optional[str] = ""
    rounds: Optional[str] = ""
    questions: str
    advice: Optional[str] = ""
    outcome: Optional[str] = ""


@app.post("/api/experiences")
def add_experience(
    data: ExperienceIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if user.role != "alumni":
        raise HTTPException(403, "Only alumni can post interview experiences")
    if not data.company_name.strip() or not data.questions.strip():
        raise HTTPException(400, "Company and questions are required")

    row = models.InterviewExperience(
        user_id=user.id,
        author_name=user.full_name,
        **data.dict(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"status": "success", "id": row.id}


@app.get("/api/experiences")
def list_experiences(
    company: Optional[str] = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    q = db.query(models.InterviewExperience)
    if company:
        q = q.filter(models.InterviewExperience.company_name.ilike(f"%{company}%"))

    if user.role != "admin":
        # you always see your own; everyone else's must be approved
        q = q.filter(
            (models.InterviewExperience.status == "approved")
            | (models.InterviewExperience.user_id == user.id)
        )

    rows = q.order_by(models.InterviewExperience.created_at.desc()).all()

    return [
        {
            "id": r.id,
            "author_name": r.author_name,
            "company_name": r.company_name,
            "role": r.role,
            "year": r.year,
            "rounds": r.rounds,
            "questions": r.questions,
            "advice": r.advice,
            "outcome": r.outcome,
            "status": r.status,
            "reject_reason": r.reject_reason,
            "mine": r.user_id == user.id,
        }
        for r in rows
    ]


@app.delete("/api/experiences/{exp_id}")
def delete_experience(
    exp_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    row = db.query(models.InterviewExperience).filter(
        models.InterviewExperience.id == exp_id,
        models.InterviewExperience.user_id == user.id,
    ).first()
    if not row:
        raise HTTPException(404, "Not found")

    db.delete(row)
    db.commit()
    return {"status": "success"}


# ============ NOTICES (admin only) ============

class NoticeIn(BaseModel):
    title: str
    content: str
    category: str = "update"


@app.post("/api/notices")
def create_notice(
    data: NoticeIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if user.role != "admin":
        raise HTTPException(403, "Only the placement cell can post notices")
    if not data.title.strip() or not data.content.strip():
        raise HTTPException(400, "Title and content are required")

    row = models.Notice(
        title=data.title.strip(),
        content=data.content.strip(),
        category=data.category,
        created_by=user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"status": "success", "id": row.id}


@app.delete("/api/notices/{notice_id}")
def delete_notice(
    notice_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if user.role != "admin":
        raise HTTPException(403, "Only the placement cell can remove notices")

    row = db.query(models.Notice).filter(models.Notice.id == notice_id).first()
    if not row:
        raise HTTPException(404, "Notice not found")

    db.delete(row)
    db.commit()
    return {"status": "success"}


# ============ JOB POSTINGS ============

class JobIn(BaseModel):
    role: str
    ctc: str
    deadline: str
    location: Optional[str] = ""
    description: Optional[str] = ""
    eligibility: Optional[str] = ""


@app.post("/api/jobs")
def create_job(
    data: JobIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if user.role != "recruiter":
        raise HTTPException(403, "Only recruiters can post jobs")
    if not user.is_verified:
        raise HTTPException(403, "Your recruiter account is awaiting institute approval")
    if not data.role.strip() or not data.ctc.strip():
        raise HTTPException(400, "Role and CTC are required")

    row = models.Job(
        company_name=user.company_name,
        posted_by=user.id,
        status="pending",
        **{k: (v or "").strip() for k, v in data.dict().items()},
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "status": "success",
        "id": row.id,
        "message": "Submitted. Students will see it once the placement cell approves it.",
    }


@app.delete("/api/jobs/{job_id}")
def delete_job(
    job_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    q = db.query(models.Job).filter(models.Job.id == job_id)
    if user.role == "recruiter":
        q = q.filter(models.Job.company_name == user.company_name)
    elif user.role != "admin":
        raise HTTPException(403, "Not allowed")

    row = q.first()
    if not row:
        raise HTTPException(404, "Job not found")

    db.delete(row)
    db.commit()
    return {"status": "success"}


class ModerateIn(BaseModel):
    decision: str                       # approved | rejected
    reason: Optional[str] = ""


@app.get("/api/admin/jobs")
def admin_list_jobs(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if user.role != "admin":
        raise HTTPException(403, "Admins only")

    q = db.query(models.Job)
    if status:
        q = q.filter(models.Job.status == status)
    return q.order_by(models.Job.id.desc()).all()


@app.patch("/api/admin/jobs/{job_id}")
def admin_moderate_job(
    job_id: int,
    data: ModerateIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if user.role != "admin":
        raise HTTPException(403, "Admins only")
    if data.decision not in ("approved", "rejected"):
        raise HTTPException(400, "Decision must be approved or rejected")

    row = db.query(models.Job).filter(models.Job.id == job_id).first()
    if not row:
        raise HTTPException(404, "Job not found")

    row.status = data.decision
    row.reject_reason = data.reason if data.decision == "rejected" else None
    db.commit()
    return {"status": "success"}


# ============ MODERATED EXPERIENCES ============

@app.get("/api/admin/experiences")
def admin_list_experiences(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if user.role != "admin":
        raise HTTPException(403, "Admins only")

    q = db.query(models.InterviewExperience)
    if status:
        q = q.filter(models.InterviewExperience.status == status)
    return q.order_by(models.InterviewExperience.id.desc()).all()


@app.patch("/api/admin/experiences/{exp_id}")
def admin_moderate_experience(
    exp_id: int,
    data: ModerateIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if user.role != "admin":
        raise HTTPException(403, "Admins only")
    if data.decision not in ("approved", "rejected"):
        raise HTTPException(400, "Decision must be approved or rejected")

    row = db.query(models.InterviewExperience).filter(
        models.InterviewExperience.id == exp_id
    ).first()
    if not row:
        raise HTTPException(404, "Experience not found")

    row.status = data.decision
    row.reject_reason = data.reason if data.decision == "rejected" else None
    db.commit()
    return {"status": "success"}


# ============ RECRUITER VERIFICATION ============

@app.get("/api/admin/recruiters")
def admin_list_recruiters(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if user.role != "admin":
        raise HTTPException(403, "Admins only")

    rows = db.query(models.User).filter(models.User.role == "recruiter").all()
    return [
        {"id": r.id, "full_name": r.full_name, "email": r.email,
         "company_name": r.company_name, "is_verified": r.is_verified}
        for r in rows
    ]


@app.patch("/api/admin/recruiters/{user_id}")
def admin_verify_recruiter(
    user_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if user.role != "admin":
        raise HTTPException(403, "Admins only")

    row = db.query(models.User).filter(
        models.User.id == user_id,
        models.User.role == "recruiter",
    ).first()
    if not row:
        raise HTTPException(404, "Recruiter not found")

    row.is_verified = not row.is_verified
    db.commit()
    return {"status": "success", "is_verified": row.is_verified}


# ============ MESSAGES TO THE PLACEMENT CELL ============

class MessageIn(BaseModel):
    subject: str
    body: str


@app.post("/api/messages")
def send_message(
    data: MessageIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if user.role == "admin":
        raise HTTPException(400, "The placement cell is the recipient, not the sender")
    if not data.subject.strip() or not data.body.strip():
        raise HTTPException(400, "Subject and message are required")

    row = models.AdminMessage(
        from_user_id=user.id,
        from_name=user.full_name,
        from_role=user.role,
        company_name=user.company_name,
        subject=data.subject.strip(),
        body=data.body.strip(),
    )
    db.add(row)
    db.commit()
    return {"status": "success", "message": "Sent to the placement cell."}


@app.get("/api/messages")
def my_messages(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    rows = (
        db.query(models.AdminMessage)
        .filter(models.AdminMessage.from_user_id == user.id)
        .order_by(models.AdminMessage.id.desc())
        .all()
    )
    return [
        {"id": r.id, "subject": r.subject, "body": r.body,
         "admin_reply": r.admin_reply, "is_read": r.is_read,
         "created_at": str(r.created_at)}
        for r in rows
    ]


@app.get("/api/admin/messages")
def admin_inbox(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if user.role != "admin":
        raise HTTPException(403, "Admins only")

    rows = db.query(models.AdminMessage).order_by(models.AdminMessage.id.desc()).all()
    return [
        {"id": r.id, "from_name": r.from_name, "from_role": r.from_role,
         "company_name": r.company_name, "subject": r.subject, "body": r.body,
         "admin_reply": r.admin_reply, "is_read": r.is_read,
         "created_at": str(r.created_at)}
        for r in rows
    ]


class ReplyIn(BaseModel):
    reply: str


@app.patch("/api/admin/messages/{msg_id}")
def admin_reply_message(
    msg_id: int,
    data: ReplyIn,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if user.role != "admin":
        raise HTTPException(403, "Admins only")

    row = db.query(models.AdminMessage).filter(models.AdminMessage.id == msg_id).first()
    if not row:
        raise HTTPException(404, "Message not found")

    row.admin_reply = data.reply.strip()
    row.is_read = True
    db.commit()
    return {"status": "success"}

# ============ PASSWORD RESET ============

import secrets
from datetime import timedelta

RESET_TTL_MINUTES = 30


class ResetRequestIn(BaseModel):
    email: EmailStr


class ResetConfirmIn(BaseModel):
    token: str
    new_password: str


@app.post("/api/auth/request-reset")
def request_reset(
    data: ResetRequestIn,
    db: Session = Depends(get_db),
):
    user = db.query(models.User).filter(models.User.email == data.email).first()

    # Always the same reply, whether or not the account exists.
    generic = {"message": "If that account exists, the placement cell can now issue a reset code for it."}

    if not user:
        return generic

    db.query(models.PasswordReset).filter(
        models.PasswordReset.user_id == user.id,
        models.PasswordReset.used_at.is_(None),
    ).delete()

    token = secrets.token_urlsafe(24)
    db.add(models.PasswordReset(
        user_id=user.id,
        token_hash=hash_password(token),
        expires_at=datetime.utcnow() + timedelta(minutes=RESET_TTL_MINUTES),
    ))
    db.commit()

    print(f"[reset] token for {user.email}: {token}")
    return generic


@app.post("/api/auth/confirm-reset")
def confirm_reset(
    data: ResetConfirmIn,
    db: Session = Depends(get_db),
):
    if len(data.new_password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")

    rows = db.query(models.PasswordReset).filter(
        models.PasswordReset.used_at.is_(None),
        models.PasswordReset.expires_at > datetime.utcnow(),
    ).all()

    match = next((r for r in rows if verify_password(data.token, r.token_hash)), None)
    if not match:
        raise HTTPException(400, "That reset code is invalid or has expired")

    user = db.query(models.User).filter(models.User.id == match.user_id).first()
    if not user:
        raise HTTPException(400, "That reset code is invalid or has expired")

    user.hashed_password = hash_password(data.new_password)
    match.used_at = datetime.utcnow()
    db.commit()

    return {"status": "success", "message": "Password updated. You can log in now."}


@app.post("/api/admin/issue-reset/{user_id}")
def admin_issue_reset(
    user_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if user.role != "admin":
        raise HTTPException(403, "Admins only")

    target = db.query(models.User).filter(models.User.id == user_id).first()
    if not target:
        raise HTTPException(404, "User not found")

    db.query(models.PasswordReset).filter(
        models.PasswordReset.user_id == target.id,
        models.PasswordReset.used_at.is_(None),
    ).delete()

    token = secrets.token_urlsafe(24)
    db.add(models.PasswordReset(
        user_id=target.id,
        token_hash=hash_password(token),
        expires_at=datetime.utcnow() + timedelta(minutes=RESET_TTL_MINUTES),
    ))
    db.commit()

    return {"token": token, "email": target.email, "expires_in_minutes": RESET_TTL_MINUTES}
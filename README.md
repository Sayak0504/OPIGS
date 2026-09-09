# OPIGS — Online Placement Information Gathering System

An end-to-end campus placement portal that replaces scattered spreadsheets and email
threads with one moderated workflow across four roles: **students, recruiters, the
placement cell, and alumni**.

Built with FastAPI, React and SQLAlchemy. Includes a live LaTeX CV compiler and a
retrieval-augmented policy assistant grounded in the institute's own documents.

> Note: `Sample_Placement_Policy_2026-27.pdf` in this repo is synthetic test data for
> the RAG pipeline. It is not any institution's real policy.

---

## Demo

TODO: 60-second screen recording, or 4–5 screenshots (login → CV builder → recruiter
pipeline → admin approvals → policy bot with citations).

---

## What it does

### Students
- **Live LaTeX CV builder** — form on the left, compiled PDF on the right. Rich text
  editor (bold, italics, bullets, super/subscript, maths symbols) converted to LaTeX
  server-side.
- **AI writing tools** — rephrase, shorten and strengthen a selected sentence;
  Grammarly-style checking with per-issue accept/ignore; opt-in Tab autocomplete.
- **Application tracker** — read-only Kanban showing where each application stands.
- **Offers** — accept or decline directly; the one-offer rule is enforced by the system.
- **Placement assistant** — a chatbot that can see the student's own CV, the live job
  list and the notice board, and can score the CV out of 100 against a fixed rubric.
- **Policy bot** — answers questions from the placement policy PDF and cites the page.

### Recruiters
- Register with a corporate email; free-mail domains are rejected and the placement
  cell must verify the account.
- Submit job postings for approval; students never see an unapproved posting.
- Move applicants through the pipeline, view CVs, extend offers, message the cell.

### Placement cell (admin)
- Post notices; approve or reject jobs, offers, alumni experiences and recruiter accounts.
- Full student directory with every CV and a per-company stage history.
- Publish a stage's roll numbers straight to the notice board.
- Upload policy PDFs, which are chunked and indexed for the policy bot.

### Alumni
- Contribute interview experiences, published only after moderation.

---

## Architecture

```
React (Vite)  ──JWT──▶  FastAPI  ──▶  SQLAlchemy / SQLite
                           │
                           ├─▶ Jinja2 → pdflatex   (CV compilation)
                           └─▶ Gemini 3.5 Flash Lite
                                 ├─ text generation  (writing tools, chat)
                                 └─ embeddings       (policy retrieval)
```

**Authentication.** Bcrypt-hashed passwords, JWTs carrying user id and role. Every
protected endpoint resolves the caller through a single `get_current_user` dependency.

**Authorisation by query, not by check.** Ownership is expressed inside the SQL rather
than as a separate `if` statement — a recruiter's applicant query joins on their own
company, so another company's data is never in the result set to begin with. There is
no permission check to forget.

**CV compilation.** Profile JSON is escaped for LaTeX special characters (`%`, `&`, `_`
and friends), editor HTML is converted to LaTeX markup, and Jinja2 renders a strict
template that `pdflatex` compiles to per-user scratch files.

**Retrieval-augmented generation.** Policy PDFs are split into 220-word windows with a
40-word overlap so no rule is cut in half. Each chunk is embedded; a question is
embedded separately with a query task type, and cosine similarity over a NumPy matrix
returns the closest passages. Answers below a similarity floor are refused rather than
guessed, and every answer carries its source page.

---

## Running locally

**Prerequisites:** Python 3.11+, Node 18+, a TeX distribution providing `pdflatex`
(MiKTeX on Windows, TeX Live elsewhere), and a Gemini API key from
[Google AI Studio](https://aistudio.google.com).

```bash
git clone https://github.com/Sayak0504/OPIGS.git
cd OPIGS
```

**Backend**

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # macOS/Linux: source venv/bin/activate
pip install -r requirements.txt

echo GEMINI_API_KEY=your_key_here > .env

python migrate_workflow.py
python -m uvicorn main:app --reload
```

API on `http://127.0.0.1:8000`, interactive docs at `/docs`.

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

App on `http://localhost:5173`.

**First run:** sign up an admin account, then a student, then a recruiter (corporate
email; the admin must approve it). Upload a policy PDF from the admin dashboard to
switch on the policy bot.

---

## Project layout

```
backend/
  main.py             API endpoints
  models.py           SQLAlchemy tables
  auth.py             hashing, JWT, role dependencies
  ai.py               Gemini client, retries, embeddings
  rag.py              chunking, embedding, cosine retrieval
  template.tex        LaTeX CV template (Jinja2 delimiters)
  migrate_workflow.py additive schema migrations
frontend/src/
  App.jsx             student portal
  RichEditor.jsx      TipTap editor + AI writing tools
  api.js              fetch wrapper, token handling
  pages/              login, admin, recruiter, alumni
```

---

## Design decisions

**Why the one-offer rule debars on decline as well as accept.** It mirrors real campus
policy: an offer withheld from another candidate has a cost, so declining after
acceptance-stage carries the same consequence. Enforced in the API, not the UI.

**Why context stuffing for the chatbot but RAG for policy.** The portal holds a handful
of jobs and notices, so passing them whole is faster and more accurate than retrieval.
A 40-page policy document is the opposite case. Using the right approach for each is
the point.

**Why Flash Lite over the frontier Flash model.** Short-form rewriting and answering
from three retrieved paragraphs is not multi-step reasoning. Lite gave 25× the daily
free quota at the same token ceiling with no measurable quality loss on these tasks.

**Why no vector database.** A few hundred chunks fit in a NumPy matrix; one matrix
multiply scores them all in under a millisecond. Adding Pinecone or Chroma would be
resume padding, not engineering.

**Known limits.** SQLite suits a single-institute deployment; Postgres would be needed
for concurrent writes at scale. Schema changes use hand-written additive migrations
rather than Alembic. HTML5 drag-and-drop means the Kanban board is desktop-only.

---

## Author

Sayak Sardar — 
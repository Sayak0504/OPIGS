from sqlalchemy import Column, Integer, String, Text, JSON, Boolean, DateTime, ForeignKey
from database import Base
from datetime import datetime


class User(Base):
    __tablename__ = "users"

    id              = Column(Integer, primary_key=True, index=True)
    full_name       = Column(String, nullable=False)
    email           = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role            = Column(String, nullable=False)   # student | admin | recruiter | alumni
    company_name    = Column(String, nullable=True)    # recruiters only
    is_verified     = Column(Boolean, default=False)
    placement_status = Column(String, default="active")   # active | closed
    closed_reason    = Column(String, nullable=True)
    closed_at        = Column(DateTime, nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)

class Notice(Base):
    __tablename__ = "notices"

    id         = Column(Integer, primary_key=True, index=True)
    title      = Column(String, index=True)
    content    = Column(Text)
    category   = Column(String)          # urgent | update | event
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class Job(Base):
    __tablename__ = "jobs"

    id            = Column(Integer, primary_key=True, index=True)
    company_name  = Column(String, index=True)
    role          = Column(String)
    ctc           = Column(String)
    deadline      = Column(String)
    location      = Column(String)
    description   = Column(Text)
    eligibility   = Column(Text)
    posted_by     = Column(Integer, ForeignKey("users.id"), nullable=True)
    status        = Column(String, default="pending", index=True)   # pending | approved | rejected
    reject_reason = Column(Text)
    created_at    = Column(DateTime, default=datetime.utcnow)


class StudentProfile(Base):
    __tablename__ = "student_profiles"

    id             = Column(Integer, primary_key=True, index=True)
    user_id        = Column(Integer, ForeignKey("users.id"), index=True)
    full_name      = Column(String)
    roll_number    = Column(String, unique=True, index=True)
    email          = Column(String)
    phone          = Column(String)
    program        = Column(String)   # Instrumentation Engineering (B.Tech)
    degree         = Column(String)   # B.Tech
    institute      = Column(String)   # IIT Kharagpur
    passing_year   = Column(String)   # 2027
    cgpa           = Column(String)   # 8.50/10
    linkedin_url   = Column(String)
    linkedin_name  = Column(String)
    tech_skills    = Column(Text)
    core_expertise = Column(Text)
    projects       = Column(JSON)
    photo_filename = Column(String)

class Application(Base):
    __tablename__ = "applications"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    job_id     = Column(Integer, ForeignKey("jobs.id"), index=True, nullable=False)
    status     = Column(String, default="applied")   # applied | shortlisted | interviewing
    cv_name    = Column(String)
    applied_at = Column(DateTime, default=datetime.utcnow)


class PolicyChunk(Base):
    __tablename__ = "policy_chunks"

    id         = Column(Integer, primary_key=True, index=True)
    doc_name   = Column(String, index=True)
    page       = Column(Integer)
    chunk_index = Column(Integer)
    content    = Column(Text)
    embedding  = Column(Text)      # the vector, stored as JSON
    created_at = Column(DateTime, default=datetime.utcnow)

class InterviewExperience(Base):
    __tablename__ = "interview_experiences"

    id           = Column(Integer, primary_key=True, index=True)
    user_id      = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    author_name  = Column(String)
    company_name = Column(String, index=True, nullable=False)
    role         = Column(String, nullable=False)
    year         = Column(String)
    rounds       = Column(String)      # "2 technical, 1 HR"
    questions    = Column(Text, nullable=False)
    advice       = Column(Text)
    outcome      = Column(String)      # selected | rejected | waitlisted
    status        = Column(String, default="pending", index=True)
    reject_reason = Column(Text)
    created_at   = Column(DateTime, default=datetime.utcnow)

class AdminMessage(Base):
    __tablename__ = "admin_messages"

    id           = Column(Integer, primary_key=True, index=True)
    from_user_id = Column(Integer, ForeignKey("users.id"), index=True)
    from_name    = Column(String)
    from_role    = Column(String)
    company_name = Column(String, nullable=True)
    subject      = Column(String)
    body         = Column(Text)
    is_read      = Column(Boolean, default=False)
    admin_reply  = Column(Text)
    created_at   = Column(DateTime, default=datetime.utcnow)

class PasswordReset(Base):
    __tablename__ = "password_resets"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    token_hash = Column(String, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    used_at    = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class Offer(Base):
    __tablename__ = "offers"

    id                = Column(Integer, primary_key=True, index=True)
    student_user_id   = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    recruiter_user_id = Column(Integer, ForeignKey("users.id"), index=True)
    job_id            = Column(Integer, ForeignKey("jobs.id"), nullable=True)

    company_name      = Column(String, index=True)
    role              = Column(String)
    ctc               = Column(String)
    location          = Column(String)
    joining_date      = Column(String)
    details           = Column(Text)

    # pending_admin | approved | rejected_by_admin | accepted | declined
    status            = Column(String, default="pending_admin", index=True)
    admin_reason      = Column(Text)
    student_note      = Column(Text)

    created_at        = Column(DateTime, default=datetime.utcnow)
    decided_at        = Column(DateTime, nullable=True)

class ApplicationEvent(Base):
    __tablename__ = "application_events"

    id             = Column(Integer, primary_key=True, index=True)
    application_id = Column(Integer, ForeignKey("applications.id"), index=True, nullable=False)
    from_status    = Column(String)
    to_status      = Column(String)
    actor_role     = Column(String)
    created_at     = Column(DateTime, default=datetime.utcnow)

class Setting(Base):
    __tablename__ = "settings"

    key        = Column(String, primary_key=True, index=True)
    value      = Column(String)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
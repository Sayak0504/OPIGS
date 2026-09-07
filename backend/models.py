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
    created_at      = Column(DateTime, default=datetime.utcnow)

class Notice(Base):
    __tablename__ = "notices"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    content = Column(Text)
    category = Column(String) # e.g., "urgent", "update"

class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    company_name = Column(String, index=True)
    role = Column(String)
    ctc = Column(String)
    deadline = Column(String)


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
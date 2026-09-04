from sqlalchemy import Column, Integer, String, Text, JSON
from database import Base


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

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String)
    roll_number = Column(String, unique=True, index=True)
    email = Column(String)
    phone = Column(String)
    tech_skills = Column(Text)
    projects = Column(JSON) # Stores the array of project dictionaries

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from database import get_db
from models import User
from auth import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])

FREE_DOMAINS = {"gmail.com", "yahoo.com", "outlook.com", "hotmail.com",
                "rediffmail.com", "icloud.com", "protonmail.com"}
ROLES = {"student", "admin", "recruiter", "alumni"}


class SignupIn(BaseModel):
    full_name: str
    email: EmailStr
    password: str
    role: str
    company_name: str | None = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    full_name: str
    email: EmailStr
    role: str
    is_verified: bool

    class Config:
        from_attributes = True


@router.post("/signup")
def signup(data: SignupIn, db: Session = Depends(get_db)):
    if data.role not in ROLES:
        raise HTTPException(400, "Invalid role")
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(400, "Email already registered")

    domain = data.email.split("@")[-1].lower()
    is_verified = True

    if data.role == "recruiter":
        if domain in FREE_DOMAINS:
            raise HTTPException(400, "Recruiters must use an official company email")
        if not data.company_name:
            raise HTTPException(400, "Company name is required")
        is_verified = False        # institute admin approves later

    user = User(
        full_name=data.full_name,
        email=data.email,
        hashed_password=hash_password(data.password),
        role=data.role,
        company_name=data.company_name,
        is_verified=is_verified,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"message": "Account created", "user": UserOut.model_validate(user)}


@router.post("/login")
def login(data: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(401, "Wrong email or password")
    if user.role == "recruiter" and not user.is_verified:
        raise HTTPException(403, "Recruiter account awaiting institute approval")

    return {
        "access_token": create_access_token(user),
        "token_type": "bearer",
        "role": user.role,
        "full_name": user.full_name,
    }


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user
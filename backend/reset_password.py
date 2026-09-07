import sys
from database import SessionLocal
from auth import hash_password
import models

if len(sys.argv) < 3:
    print("usage: python reset_password.py <email> <new_password>")
    sys.exit(1)

email, new_password = sys.argv[1], sys.argv[2]

db = SessionLocal()
u = db.query(models.User).filter(models.User.email == email).first()

if not u:
    print(f"No user with email {email}")
    print("Existing users:")
    for x in db.query(models.User).all():
        print(f"  {x.email}  ({x.role})")
else:
    u.hashed_password = hash_password(new_password)
    db.commit()
    print(f"Password reset for {u.email} ({u.role})")
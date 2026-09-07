import sys
from database import SessionLocal
import models

db = SessionLocal()
u = db.query(models.User).filter(models.User.email == sys.argv[1]).first()
if not u:
    print("no such user")
else:
    u.is_verified = True
    db.commit()
    print(f"approved {u.email} ({u.company_name})")
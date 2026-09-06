from sqlalchemy import text, inspect
from database import engine
import models

insp = inspect(engine)
print("BEFORE:", [c["name"] for c in insp.get_columns("student_profiles")])

with engine.begin() as conn:
    conn.execute(text("DROP TABLE IF EXISTS student_profiles"))

models.Base.metadata.create_all(bind=engine)

insp = inspect(engine)
print("AFTER: ", [c["name"] for c in insp.get_columns("student_profiles")])
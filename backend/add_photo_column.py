from sqlalchemy import text, inspect
from database import engine

try:
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE student_profiles ADD COLUMN photo_filename TEXT"))
    print("added photo_filename")
except Exception as e:
    print("skipped:", str(e).split("\n")[0][:60])

print([c["name"] for c in inspect(engine).get_columns("student_profiles")])
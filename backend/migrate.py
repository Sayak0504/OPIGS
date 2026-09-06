from sqlalchemy import text
from database import engine

COLUMNS = {
    "user_id":        "INTEGER",
    "program":        "TEXT",
    "degree":         "TEXT",
    "institute":      "TEXT",
    "passing_year":   "TEXT",
    "cgpa":           "TEXT",
    "linkedin_url":   "TEXT",
    "linkedin_name":  "TEXT",
    "core_expertise": "TEXT",
}

for col, coltype in COLUMNS.items():
    try:
        with engine.begin() as conn:
            conn.execute(text(f"ALTER TABLE student_profiles ADD COLUMN {col} {coltype}"))
        print("added   ", col)
    except Exception as e:
        print("skipped ", col, "-", str(e).split("\n")[0][:60])
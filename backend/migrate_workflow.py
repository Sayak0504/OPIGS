from sqlalchemy import text, inspect
from database import engine
import models

NEW_COLUMNS = {
    "notices": {
        "created_by": "INTEGER",
        "created_at": "TIMESTAMP",
    },
    "jobs": {
        "location": "TEXT",
        "description": "TEXT",
        "eligibility": "TEXT",
        "posted_by": "INTEGER",
        "status": "TEXT",
        "reject_reason": "TEXT",
        "created_at": "TIMESTAMP",
    },
    "users": {
        "placement_status": "TEXT",
        "closed_reason": "TEXT",
        "closed_at": "TIMESTAMP",
    },
    "student_profiles": {
        "sections": "JSON",
    },
    "interview_experiences": {
        "status": "TEXT",
        "reject_reason": "TEXT",
    },
}

insp = inspect(engine)
existing_tables = insp.get_table_names()

for table, cols in NEW_COLUMNS.items():
    if table not in existing_tables:
        print(f"skip {table} (does not exist yet — create_all will build it)")
        continue

    have = {c["name"] for c in insp.get_columns(table)}
    for col, coltype in cols.items():
        if col in have:
            continue
        try:
            with engine.begin() as conn:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {coltype}"))
            print(f"added  {table}.{col}")
        except Exception as e:
            print(f"failed {table}.{col}: {str(e).splitlines()[0][:70]}")

# anything already in the database predates moderation, so treat it as approved
with engine.begin() as conn:
    if "jobs" in existing_tables:
        n = conn.execute(text("UPDATE jobs SET status='approved' WHERE status IS NULL")).rowcount
        print(f"marked {n} existing jobs approved")
    if "interview_experiences" in existing_tables:
        n = conn.execute(text("UPDATE interview_experiences SET status='approved' WHERE status IS NULL")).rowcount
        print(f"marked {n} existing experiences approved")
    if "users" in existing_tables:
        n = conn.execute(text("UPDATE users SET placement_status='active' WHERE placement_status IS NULL")).rowcount
        print(f"marked {n} users active")

models.Base.metadata.create_all(bind=engine)
print("done")
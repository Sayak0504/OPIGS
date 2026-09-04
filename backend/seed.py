from database import SessionLocal, engine
import models

# Ensure tables are created
models.Base.metadata.create_all(bind=engine)

db = SessionLocal()

def seed_data():
    # Only add data if the tables are empty
    if db.query(models.Notice).count() == 0:
        print("Seeding Notices...")
        n1 = models.Notice(
            title="URGENT: Resume Freeze Deadline", 
            content="All students must finalize their Base CV by September 15, 2026. After this date, the LaTeX builder will be locked.", 
            category="urgent"
        )
        n2 = models.Notice(
            title="Update: Samsung R&D Pre-Placement Talk", 
            content="The PPT for Samsung R&D Bangalore will be held in the main auditorium on Friday at 6:00 PM.", 
            category="update"
        )
        db.add_all([n1, n2])
        
    if db.query(models.Job).count() == 0:
        print("Seeding Jobs...")
        j1 = models.Job(
            company_name="Samsung R&D Institute", 
            role="Hardware/Embedded Engineer", 
            ctc="20 LPA", 
            deadline="Sept 10, 2026"
        )
        j2 = models.Job(
            company_name="Google", 
            role="Software Development Engineer", 
            ctc="35 LPA", 
            deadline="Sept 12, 2026"
        )
        db.add_all([j1, j2])

    db.commit()
    print("Database seeded successfully!")

if __name__ == "__main__":
    seed_data()
    db.close()

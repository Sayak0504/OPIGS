from database import SessionLocal, engine
import models

models.Base.metadata.create_all(bind=engine)
db = SessionLocal()

added = 0
for a in db.query(models.Application).all():
    has = db.query(models.ApplicationEvent).filter(
        models.ApplicationEvent.application_id == a.id
    ).first()
    if has:
        continue
    db.add(models.ApplicationEvent(application_id=a.id, from_status=None,
                                   to_status=a.status, actor_role="system"))
    added += 1

db.commit()
print(f"seeded {added} events")
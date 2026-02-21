import os
from faker import Faker
from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker
from models import User, Base

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/userdb",
)

engine = create_engine(DATABASE_URL)
Base.metadata.create_all(bind=engine)
Session = sessionmaker(bind=engine)

TOTAL = 10_000
BATCH = 500


def seed():
    fake = Faker()
    with Session() as db:
        count = db.query(func.count(User.id)).scalar()
        if count >= TOTAL:
            print(f"Already have {count} users — skipping seed.")
            return

        print(f"Seeding {TOTAL:,} users …")
        users: list[User] = []
        seen_emails: set[str] = set()

        while len(users) < TOTAL:
            email = fake.unique.email()
            if email in seen_emails:
                continue
            seen_emails.add(email)
            users.append(
                User(
                    name=fake.name(),
                    email=email,
                    phone=fake.phone_number()[:50],
                    address=fake.street_address(),
                    city=fake.city(),
                    country=fake.country_code(),
                )
            )

        for i in range(0, TOTAL, BATCH):
            db.bulk_save_objects(users[i : i + BATCH])
            db.commit()
            print(f"  {min(i + BATCH, TOTAL):>6,} / {TOTAL:,}")

    print("User seed complete.")


if __name__ == "__main__":
    seed()

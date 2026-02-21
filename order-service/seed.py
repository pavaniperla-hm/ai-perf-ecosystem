import os
import random
from sqlalchemy import create_engine, func, insert
from sqlalchemy.orm import sessionmaker
from models import Order, Base

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/orderdb",
)

engine = create_engine(DATABASE_URL)
Base.metadata.create_all(bind=engine)

TOTAL    = 50_000
BATCH    = 1_000
STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled"]


def seed():
    Session = sessionmaker(bind=engine)
    with Session() as db:
        count = db.query(func.count(Order.id)).scalar()
        if count >= TOTAL:
            print(f"Already have {count} orders — skipping seed.")
            return

    print(f"Seeding {TOTAL:,} orders …")

    for start in range(0, TOTAL, BATCH):
        end  = min(start + BATCH, TOTAL)
        rows = []
        for _ in range(end - start):
            unit_price = round(random.uniform(0.99, 999.99), 2)
            qty        = random.randint(1, 10)
            rows.append(
                {
                    "user_id":     random.randint(1, 10_000),
                    "product_id":  random.randint(1, 5_000),
                    "quantity":    qty,
                    "unit_price":  unit_price,
                    "total_price": round(unit_price * qty, 2),
                    "status":      random.choice(STATUSES),
                }
            )
        with engine.begin() as conn:
            conn.execute(insert(Order.__table__), rows)
        print(f"  {end:>6,} / {TOTAL:,}")

    print("Order seed complete.")


if __name__ == "__main__":
    seed()

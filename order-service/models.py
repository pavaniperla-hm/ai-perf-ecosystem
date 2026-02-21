from sqlalchemy import Column, DateTime, Integer, Numeric, String, func
from database import Base


class Order(Base):
    __tablename__ = "orders"

    id          = Column(Integer, primary_key=True, index=True)
    user_id     = Column(Integer, nullable=False, index=True)
    product_id  = Column(Integer, nullable=False, index=True)
    quantity    = Column(Integer, nullable=False, default=1)
    unit_price  = Column(Numeric(10, 2), nullable=False)
    total_price = Column(Numeric(10, 2), nullable=False)
    status      = Column(String(50), nullable=False, default="pending", index=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

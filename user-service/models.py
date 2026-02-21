from sqlalchemy import Column, DateTime, Integer, String, func
from database import Base


class User(Base):
    __tablename__ = "users"

    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String(255), nullable=False)
    email      = Column(String(255), unique=True, nullable=False, index=True)
    phone      = Column(String(50))
    address    = Column(String(500))
    city       = Column(String(100))
    country    = Column(String(100))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

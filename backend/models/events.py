# models.py
from sqlalchemy import Column, Integer, Text, DateTime
from sqlalchemy.sql import func
from geoalchemy2 import Geometry
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class Event(Base):
    __tablename__ = "events"
    
    event_id = Column(Integer, primary_key=True, autoincrement=False)
    event_name = Column(Text, nullable=False)
    description = Column(Text)
    event_type = Column(Text, nullable=False)
    address = Column(Text)
    contact_phone = Column(Text)
    location = Column(Geometry('POINT', srid=4326), nullable=False)
    opening_hours = Column(Text)
    capacity = Column(Integer)
    services = Column(Text)
    event_date = Column(DateTime(timezone=True), nullable=False)
    end_date = Column(DateTime(timezone=True))
    created_by = Column(Integer)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
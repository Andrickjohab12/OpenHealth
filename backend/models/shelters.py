from sqlalchemy import Column, Integer, Text, DateTime
from sqlalchemy.sql import func
from geoalchemy2 import Geometry
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class Shelter(Base):
    __tablename__ = "shelters"
    
    shelter_id = Column(Integer, primary_key=True, autoincrement=False)
    shelter_name = Column(Text, nullable=False)
    description = Column(Text)
    address = Column(Text)
    contact_phone = Column(Text)
    location = Column(Geometry('POINT', srid=4326), nullable=False)
    opening_hours = Column(Text)
    capacity = Column(Integer)
    available_beds = Column(Integer)
    services = Column(Text)
    details = Column(Text)
    created_by = Column(Integer)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
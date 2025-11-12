from sqlalchemy import Column, String, Integer, Date, Text, ForeignKey, JSON, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from geoalchemy2 import Geometry
import uuid
from datetime import datetime

from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()


class HomelessProfile(Base):
    __tablename__ = "homeless_profiles"

    homeless_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    given_name = Column(String)
    family_name = Column(String)
    preferred_name = Column(String)
    dob = Column(Date)
    gender = Column(String)
    notes = Column(Text)
    registered_at = Column(TIMESTAMP(timezone=True), default=datetime.utcnow)
    registered_via = Column(String)
    registered_by = Column(UUID(as_uuid=True))
    last_seen_at = Column(TIMESTAMP(timezone=True))
    photo_url = Column(Text)

    # Relaciones
    medical_records = relationship("MedicalRecord", back_populates="profile")


class MedicalRecord(Base):
    __tablename__ = "medical_records"

    record_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    profile_id = Column(UUID(as_uuid=True), ForeignKey("homeless_profiles.homeless_id"))
    record_date = Column(TIMESTAMP(timezone=True), default=datetime.utcnow)
    summary = Column(Text)
    chronic_conditions = Column(Text)
    medical_history = Column(Text)
    current_medications = Column(Text)
    allergies = Column(Text)
    vaccinations = Column(Text)
    healthcare_contacts = Column(Text)
    relevant_test_results = Column(Text)
    advance_directives = Column(JSON)
    notes = Column(Text)
    details = Column(Text)

    # Relaciones
    profile = relationship("HomelessProfile", back_populates="medical_records")


class Shelter(Base):
    __tablename__ = "shelters"

    shelter_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shelter_name = Column(String)
    description = Column(Text)
    address = Column(Text)
    contact_phone = Column(String)
    location = Column(Geometry("POINT", 4326))
    opening_hours = Column(Text)
    capacity = Column(Integer)
    available_beds = Column(Integer)
    services = Column(Text)
    details = Column(Text)
    created_by = Column(UUID(as_uuid=True))
    created_at = Column(TIMESTAMP(timezone=True), default=datetime.utcnow)


class Event(Base):
    __tablename__ = "events"

    event_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_name = Column(String)
    description = Column(Text)
    event_type = Column(String)
    address = Column(Text)
    contact_phone = Column(String)
    location = Column(Geometry("POINT", 4326))
    opening_hours = Column(Text)
    capacity = Column(Integer)
    services = Column(Text)
    event_date = Column(TIMESTAMP(timezone=True))
    end_date = Column(TIMESTAMP(timezone=True))
    created_by = Column(UUID(as_uuid=True))
    created_at = Column(TIMESTAMP(timezone=True), default=datetime.utcnow)

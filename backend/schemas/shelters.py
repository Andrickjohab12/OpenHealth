# schemas.py
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class LocationPoint(BaseModel):
    longitude: float = Field(..., ge=-180, le=180, description="Longitud")
    latitude: float = Field(..., ge=-90, le=90, description="Latitud")

class ShelterBase(BaseModel):
    shelter_name: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    address: Optional[str] = None
    contact_phone: Optional[str] = None
    location: LocationPoint
    opening_hours: Optional[str] = None
    capacity: Optional[int] = Field(None, ge=0)
    available_beds: Optional[int] = Field(None, ge=0)
    services: Optional[str] = None
    details: Optional[str] = None
    created_by: Optional[int] = None

class ShelterCreate(ShelterBase):
    shelter_id: int = Field(..., description="ID único del shelter")

class ShelterUpdate(BaseModel):
    shelter_name: Optional[str] = Field(None, min_length=1, max_length=500)
    description: Optional[str] = None
    address: Optional[str] = None
    contact_phone: Optional[str] = None
    location: Optional[LocationPoint] = None
    opening_hours: Optional[str] = None
    capacity: Optional[int] = Field(None, ge=0)
    available_beds: Optional[int] = Field(None, ge=0)
    services: Optional[str] = None
    details: Optional[str] = None

class ShelterResponse(BaseModel):
    shelter_id: int
    shelter_name: str
    description: Optional[str]
    address: Optional[str]
    contact_phone: Optional[str]
    location: LocationPoint
    opening_hours: Optional[str]
    capacity: Optional[int]
    available_beds: Optional[int]
    services: Optional[str]
    details: Optional[str]
    created_by: Optional[int]
    created_at: datetime
    
    class Config:
        from_attributes = True

class ShelterListResponse(BaseModel):
    shelters: List[ShelterResponse]
    total: int
    page: int
    page_size: int
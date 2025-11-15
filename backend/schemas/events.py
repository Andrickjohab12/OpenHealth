# schemas.py
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Literal
from datetime import datetime
from enum import Enum

class EventType(str, Enum):
    """Tipos de eventos permitidos"""
    MEDICAL = "medical"
    FOOD = "food"
    HYGIENE = "hygiene"
    COMMUNITY_SUPPORT = "community_support"
    OTHER = "other"

class LocationPoint(BaseModel):
    longitude: float = Field(..., ge=-180, le=180, description="Longitud")
    latitude: float = Field(..., ge=-90, le=90, description="Latitud")

class EventBase(BaseModel):
    event_name: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    event_type: EventType
    address: Optional[str] = None
    contact_phone: Optional[str] = None
    location: LocationPoint
    opening_hours: Optional[str] = None
    capacity: Optional[int] = Field(None, ge=0)
    services: Optional[str] = None
    event_date: datetime = Field(..., description="Fecha de inicio del evento")
    end_date: Optional[datetime] = Field(None, description="Fecha de finalización (opcional)")
    created_by: Optional[int] = None
    
    @field_validator('end_date')
    @classmethod
    def validate_end_date(cls, v, info):
        """Validar que end_date sea posterior a event_date"""
        if v and 'event_date' in info.data:
            if v < info.data['event_date']:
                raise ValueError('end_date debe ser posterior a event_date')
        return v

class EventCreate(EventBase):
    event_id: int = Field(..., description="ID único del evento")

class EventUpdate(BaseModel):
    event_name: Optional[str] = Field(None, min_length=1, max_length=500)
    description: Optional[str] = None
    event_type: Optional[EventType] = None
    address: Optional[str] = None
    contact_phone: Optional[str] = None
    location: Optional[LocationPoint] = None
    opening_hours: Optional[str] = None
    capacity: Optional[int] = Field(None, ge=0)
    services: Optional[str] = None
    event_date: Optional[datetime] = None
    end_date: Optional[datetime] = None

class EventResponse(BaseModel):
    event_id: int
    event_name: str
    description: Optional[str]
    event_type: str
    address: Optional[str]
    contact_phone: Optional[str]
    location: LocationPoint
    opening_hours: Optional[str]
    capacity: Optional[int]
    services: Optional[str]
    event_date: datetime
    end_date: Optional[datetime]
    created_by: Optional[int]
    created_at: datetime
    
    class Config:
        from_attributes = True

class EventListResponse(BaseModel):
    events: List[EventResponse]
    total: int
    page: int
    page_size: int
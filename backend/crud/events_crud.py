# crud.py
from sqlalchemy.orm import Session
from sqlalchemy import func, text, and_, or_
from models.events import Event
from schemas.events import EventCreate, EventUpdate, LocationPoint
from typing import List, Optional, Tuple
from datetime import datetime
from fastapi import HTTPException

def location_to_wkt(location) -> str:
    if isinstance(location, dict):
        lon = location["longitude"]
        lat = location["latitude"]
    else:
        lon = location.longitude
        lat = location.latitude

    return f"SRID=4326;POINT({lon} {lat})"

def parse_location_from_db(db: Session, event: Event) -> LocationPoint | None:
    if not event.location:
        return None

    result = db.execute(
        text("""
            SELECT 
                ST_X(location) AS lon,
                ST_Y(location) AS lat
            FROM events
            WHERE event_id = :sid
        """),
        {"sid": event.event_id}
    ).first()

    if not result:
        return None

    return LocationPoint(
        longitude=result.lon,
        latitude=result.lat
    )

def create_event(db: Session, event: EventCreate) -> Event:
    """Crear un nuevo evento"""
    # Verificar si el ID ya existe
    existing = db.query(Event).filter(Event.event_id == event.event_id).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"El event_id {event.event_id} ya existe")
    
    wkt_location = location_to_wkt(event.location)
    
    db_event = Event(
        event_id=event.event_id,
        event_name=event.event_name,
        description=event.description,
        event_type=event.event_type.value,
        address=event.address,
        contact_phone=event.contact_phone,
        location=wkt_location,
        opening_hours=event.opening_hours,
        capacity=event.capacity,
        services=event.services,
        event_date=event.event_date,
        end_date=event.end_date,
        created_by=event.created_by
    )
    
    db.add(db_event)
    db.commit()
    db.refresh(db_event)
    return db_event

def get_event(db: Session, event_id: int) -> Optional[Event]:
    """Obtener un evento por ID"""
    return db.query(Event).filter(Event.event_id == event_id).first()

def get_events(
    db: Session, 
    skip: int = 0, 
    limit: int = 100,
    name_filter: Optional[str] = None,
    event_type_filter: Optional[str] = None,
    city_filter: Optional[str] = None
) -> Tuple[List[Event], int]:
    """Obtener lista de eventos con paginación y filtros"""
    query = db.query(Event)
    
    # Filtro por nombre
    if name_filter:
        query = query.filter(Event.event_name.ilike(f"%{name_filter}%"))
    
    # Filtro por tipo de evento
    if event_type_filter:
        query = query.filter(Event.event_type == event_type_filter)
    
    # Filtro por ciudad (en el address)
    if city_filter:
        query = query.filter(Event.address.ilike(f"%{city_filter}%"))
    
    total = query.count()
    events = query.order_by(Event.event_date.desc()).offset(skip).limit(limit).all()
    
    return events, total

def update_event(
    db: Session, 
    event_id: int, 
    event_update: EventUpdate
) -> Optional[Event]:
    """Actualizar un evento existente"""
    db_event = get_event(db, event_id)
    
    if not db_event:
        return None
    
    update_data = event_update.model_dump(exclude_unset=True)
    
    # Manejo especial para location
    if "location" in update_data and update_data["location"]:
        wkt_location = location_to_wkt(update_data["location"])
        update_data["location"] = wkt_location
    
    # Convertir EventType enum a string si existe
    if "event_type" in update_data and update_data["event_type"]:
        update_data["event_type"] = update_data["event_type"].value
    
    for field, value in update_data.items():
        setattr(db_event, field, value)
    
    db.commit()
    db.refresh(db_event)
    return db_event

def delete_event(db: Session, event_id: int) -> bool:
    """Eliminar un evento"""
    db_event = get_event(db, event_id)
    
    if not db_event:
        return False
    
    db.delete(db_event)
    db.commit()
    return True

def get_events_nearby(
    db: Session,
    longitude: float,
    latitude: float,
    radius_meters: float = 5000,
    limit: int = 10
) -> List[Event]:
    """Obtener eventos cercanos a una ubicación usando PostGIS"""
    point_wkt = f"SRID=4326;POINT({longitude} {latitude})"
    
    shelters = db.query(Event).filter(
        func.ST_DWithin(
            Event.location,
            func.ST_GeomFromText(point_wkt),
            radius_meters
        )
    ).order_by(
        func.ST_Distance(Event.location, func.ST_GeomFromText(point_wkt))
    ).limit(limit).all()
    
    return shelters

def get_upcoming_events(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    days_ahead: int = 30
) -> Tuple[List[Event], int]:
    """Obtener eventos próximos (que aún no han finalizado)"""
    now = datetime.utcnow()
    
    query = db.query(Event).filter(
        or_(
            Event.end_date >= now,
            and_(Event.end_date.is_(None), Event.event_date >= now)
        )
    )
    
    total = query.count()
    events = query.order_by(Event.event_date.asc()).offset(skip).limit(limit).all()
    
    return events, total

def get_active_events(
    db: Session,
    skip: int = 0,
    limit: int = 100
) -> Tuple[List[Event], int]:
    """Obtener eventos activos (en curso actualmente)"""
    now = datetime.utcnow()
    
    query = db.query(Event).filter(
        Event.event_date <= now,
        or_(
            Event.end_date >= now,
            Event.end_date.is_(None)
        )
    )
    
    total = query.count()
    events = query.order_by(Event.event_date.desc()).offset(skip).limit(limit).all()
    
    return events, total

def get_events_by_type(
    db: Session,
    event_type: str,
    skip: int = 0,
    limit: int = 100
) -> Tuple[List[Event], int]:
    """Obtener eventos por tipo"""
    query = db.query(Event).filter(Event.event_type == event_type)
    
    total = query.count()
    events = query.order_by(Event.event_date.desc()).offset(skip).limit(limit).all()
    
    return events, total

def get_events_by_date_range(
    db: Session,
    start_date: datetime,
    end_date: datetime,
    skip: int = 0,
    limit: int = 100
) -> Tuple[List[Event], int]:
    """Obtener eventos en un rango de fechas"""
    query = db.query(Event).filter(
        Event.event_date >= start_date,
        Event.event_date <= end_date
    )
    
    total = query.count()
    events = query.order_by(Event.event_date.asc()).offset(skip).limit(limit).all()
    
    return events, total
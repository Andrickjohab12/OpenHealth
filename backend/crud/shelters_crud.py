
# crud.py
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from models.shelters import Shelter
from schemas.shelters import ShelterCreate, ShelterUpdate, LocationPoint
from typing import List, Optional, Tuple
from fastapi import HTTPException

def location_to_wkt(location) -> str:
    if isinstance(location, dict):
        longitude = location.get("longitude")
        latitude = location.get("latitude")
    else:
        longitude = location.longitude
        latitude = location.latitude

    return f"SRID=4326;POINT({longitude} {latitude})"


def parse_location_from_db(db: Session, shelter: Shelter) -> LocationPoint | None:
    """Extrae las coordenadas de la columna geometry (POINT) en PostGIS"""

    if not shelter.location:
        return None

    result = db.execute(
        text("""
            SELECT 
                ST_X(location) AS lon,
                ST_Y(location) AS lat
            FROM shelters
            WHERE shelter_id = :sid
        """),
        {"sid": shelter.shelter_id}
    ).first()

    if not result:
        return None

    return LocationPoint(
        longitude=result.lon,
        latitude=result.lat
    )

def create_shelter(db: Session, shelter: ShelterCreate) -> Shelter:
    """Crear un nuevo shelter"""
    # Verificar si el ID ya existe
    existing = db.query(Shelter).filter(Shelter.shelter_id == shelter.shelter_id).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"El shelter_id {shelter.shelter_id} ya existe")
    
    wkt_location = location_to_wkt(shelter.location)
    
    db_shelter = Shelter(
        shelter_id=shelter.shelter_id,
        shelter_name=shelter.shelter_name,
        description=shelter.description,
        address=shelter.address,
        contact_phone=shelter.contact_phone,
        location=wkt_location,
        opening_hours=shelter.opening_hours,
        capacity=shelter.capacity,
        available_beds=shelter.available_beds,
        services=shelter.services,
        details=shelter.details,
        created_by=shelter.created_by
    )
    
    db.add(db_shelter)
    db.commit()
    db.refresh(db_shelter)
    return db_shelter

def get_shelter(db: Session, shelter_id: int) -> Optional[Shelter]:
    """Obtener un shelter por ID"""
    return db.query(Shelter).filter(Shelter.shelter_id == shelter_id).first()

def get_shelters(
    db: Session, 
    skip: int = 0, 
    limit: int = 100,
    name_filter: Optional[str] = None,
    city_filter: Optional[str] = None
) -> Tuple[List[Shelter], int]:
    """Obtener lista de shelters con paginación y filtros"""
    query = db.query(Shelter)
    
    # Filtro por nombre
    if name_filter:
        query = query.filter(Shelter.shelter_name.ilike(f"%{name_filter}%"))
    
    # Filtro por ciudad (en el address)
    if city_filter:
        query = query.filter(Shelter.address.ilike(f"%{city_filter}%"))
    
    total = query.count()
    shelters = query.order_by(Shelter.shelter_id.desc()).offset(skip).limit(limit).all()
    
    return shelters, total

def update_shelter(
    db: Session, 
    shelter_id: int, 
    shelter_update: ShelterUpdate
) -> Optional[Shelter]:
    """Actualizar un shelter existente"""
    db_shelter = get_shelter(db, shelter_id)
    
    if not db_shelter:
        return None
    
    update_data = shelter_update.model_dump(exclude_unset=True)
    
    # Manejo especial para location
    if "location" in update_data and update_data["location"]:
        wkt_location = location_to_wkt(update_data["location"])
        update_data["location"] = wkt_location
    
    for field, value in update_data.items():
        setattr(db_shelter, field, value)
    
    db.commit()
    db.refresh(db_shelter)
    return db_shelter

def delete_shelter(db: Session, shelter_id: int) -> bool:
    """Eliminar un shelter"""
    db_shelter = get_shelter(db, shelter_id)
    
    if not db_shelter:
        return False
    
    db.delete(db_shelter)
    db.commit()
    return True

def get_shelters_nearby(
    db: Session,
    longitude: float,
    latitude: float,
    radius_meters: float = 5000,
    limit: int = 10
) -> List[Shelter]:
    """Obtener shelters cercanos a una ubicación usando PostGIS"""
    point_wkt = f"SRID=4326;POINT({longitude} {latitude})"
    
    # Usar ST_DWithin para búsqueda eficiente
    shelters = db.query(Shelter).filter(
        func.ST_DWithin(
            Shelter.location,
            func.ST_GeomFromText(point_wkt),
            radius_meters
        )
    ).order_by(
        func.ST_Distance(Shelter.location, func.ST_GeomFromText(point_wkt))
    ).limit(limit).all()
    
    return shelters

def get_shelters_with_availability(
    db: Session,
    min_beds: int = 1,
    skip: int = 0,
    limit: int = 100
) -> Tuple[List[Shelter], int]:
    """Obtener shelters con camas disponibles"""
    query = db.query(Shelter).filter(
        Shelter.available_beds >= min_beds
    )
    
    total = query.count()
    shelters = query.order_by(Shelter.available_beds.desc()).offset(skip).limit(limit).all()
    
    return shelters, total
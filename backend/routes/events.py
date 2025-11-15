# routes.py
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timedelta
import crud.events_crud as crud
import schemas.events as schemas
from db import get_db

router = APIRouter(
    prefix="/api/v1/events",
    tags=["Events"]
)

@router.post(
    "/", 
    response_model=schemas.EventResponse, 
    status_code=status.HTTP_201_CREATED,
    summary="Crear nuevo evento"
)
def create_event(
    event: schemas.EventCreate,
    db: Session = Depends(get_db)
):
    """
    Crear un nuevo evento/campaña con toda su información:
    
    - **event_id**: ID único (requerido)
    - **event_name**: Nombre del evento (requerido)
    - **event_type**: Tipo de evento (requerido)
      - medical: Atención médica
      - food: Distribución de alimentos
      - hygiene: Artículos de higiene
      - community_support: Apoyo comunitario
      - other: Otro tipo
    - **location**: Coordenadas geográficas (requerido)
    - **event_date**: Fecha de inicio (requerido)
    - **end_date**: Fecha de finalización (opcional)
    """
    try:
        db_event = crud.create_event(db, event)
        db_event.location = crud.parse_location_from_db(db, db_event)
        return db_event
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error al crear evento: {str(e)}"
        )

@router.get(
    "/", 
    response_model=schemas.EventListResponse,
    summary="Listar todos los eventos"
)
def list_events(
    page: int = Query(1, ge=1, description="Número de página"),
    page_size: int = Query(10, ge=1, le=100, description="Resultados por página"),
    name: Optional[str] = Query(None, description="Filtrar por nombre"),
    event_type: Optional[str] = Query(None, description="Filtrar por tipo de evento"),
    city: Optional[str] = Query(None, description="Filtrar por ciudad"),
    db: Session = Depends(get_db)
):
    """
    Obtener lista paginada de eventos con filtros opcionales.
    
    Filtros disponibles:
    - **name**: Buscar por nombre (case-insensitive)
    - **event_type**: Filtrar por tipo (medical, food, hygiene, community_support, other)
    - **city**: Buscar por ciudad en el address
    """
    skip = (page - 1) * page_size
    
    events, total = crud.get_events(
        db, 
        skip=skip, 
        limit=page_size,
        name_filter=name,
        event_type_filter=event_type,
        city_filter=city
    )
    
    # Parsear las ubicaciones
    for event in events:
        event.location = crud.parse_location_from_db(db, event)
    
    return {
        "events": events,
        "total": total,
        "page": page,
        "page_size": page_size
    }

@router.get(
    "/nearby",
    response_model=list[schemas.EventResponse],
    summary="Buscar eventos cercanos"
)
def find_nearby_events(
    longitude: float = Query(..., ge=-180, le=180, description="Longitud"),
    latitude: float = Query(..., ge=-90, le=90, description="Latitud"),
    radius: float = Query(5000, ge=100, le=50000, description="Radio en metros (100-50000)"),
    limit: int = Query(10, ge=1, le=50, description="Máximo de resultados"),
    db: Session = Depends(get_db)
):
    """
    Buscar eventos cercanos a una ubicación específica usando PostGIS.
    
    Los resultados están ordenados por distancia (más cercano primero).
    """
    events = crud.get_events_nearby(
        db,
        longitude=longitude,
        latitude=latitude,
        radius_meters=radius,
        limit=limit
    )
    
    # Parsear las ubicaciones
    for event in events:
        event.location = crud.parse_location_from_db(db, event)
    
    return events

@router.get(
    "/upcoming",
    response_model=schemas.EventListResponse,
    summary="Eventos próximos"
)
def list_upcoming_events(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    days_ahead: int = Query(30, ge=1, le=365, description="Días hacia adelante"),
    db: Session = Depends(get_db)
):
    """
    Obtener eventos que aún no han finalizado.
    
    - Incluye eventos cuya fecha de inicio o finalización sea futura
    - Ordenados por fecha de inicio (más próximo primero)
    """
    skip = (page - 1) * page_size
    
    events, total = crud.get_upcoming_events(
        db,
        skip=skip,
        limit=page_size,
        days_ahead=days_ahead
    )
    
    # Parsear las ubicaciones
    for event in events:
        event.location = crud.parse_location_from_db(db, event)
    
    return {
        "events": events,
        "total": total,
        "page": page,
        "page_size": page_size
    }

@router.get(
    "/active",
    response_model=schemas.EventListResponse,
    summary="Eventos activos"
)
def list_active_events(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """
    Obtener eventos que están activos actualmente (en curso).
    
    - Eventos cuya fecha de inicio ya pasó
    - Y cuya fecha de fin no ha llegado (o no tiene fecha de fin)
    """
    skip = (page - 1) * page_size
    
    events, total = crud.get_active_events(
        db,
        skip=skip,
        limit=page_size
    )
    
    # Parsear las ubicaciones
    for event in events:
        event.location = crud.parse_location_from_db(db, event)
    
    return {
        "events": events,
        "total": total,
        "page": page,
        "page_size": page_size
    }

@router.get(
    "/by-type/{event_type}",
    response_model=schemas.EventListResponse,
    summary="Eventos por tipo"
)
def list_events_by_type(
    event_type: schemas.EventType,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """
    Obtener eventos filtrados por tipo específico.
    
    Tipos disponibles:
    - **medical**: Atención médica
    - **food**: Distribución de alimentos
    - **hygiene**: Artículos de higiene
    - **community_support**: Apoyo comunitario
    - **other**: Otro tipo
    """
    skip = (page - 1) * page_size
    
    events, total = crud.get_events_by_type(
        db,
        event_type=event_type.value,
        skip=skip,
        limit=page_size
    )
    
    # Parsear las ubicaciones
    for event in events:
        event.location = crud.parse_location_from_db(db, event)
    
    return {
        "events": events,
        "total": total,
        "page": page,
        "page_size": page_size
    }

@router.get(
    "/date-range",
    response_model=schemas.EventListResponse,
    summary="Eventos por rango de fechas"
)
def list_events_by_date_range(
    start_date: datetime = Query(..., description="Fecha de inicio del rango"),
    end_date: datetime = Query(..., description="Fecha de fin del rango"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """
    Obtener eventos dentro de un rango de fechas específico.
    
    - Busca eventos cuya fecha de inicio esté dentro del rango
    - Ordenados por fecha de inicio ascendente
    """
    if end_date < start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="end_date debe ser posterior a start_date"
        )
    
    skip = (page - 1) * page_size
    
    events, total = crud.get_events_by_date_range(
        db,
        start_date=start_date,
        end_date=end_date,
        skip=skip,
        limit=page_size
    )
    
    # Parsear las ubicaciones
    for event in events:
        event.location = crud.parse_location_from_db(db, event)
    
    return {
        "events": events,
        "total": total,
        "page": page,
        "page_size": page_size
    }

@router.get(
    "/{event_id}",
    response_model=schemas.EventResponse,
    summary="Obtener evento por ID"
)
def get_event(
    event_id: int,
    db: Session = Depends(get_db)
):
    """
    Obtener la información completa de un evento específico por su ID.
    """
    db_event = crud.get_event(db, event_id)
    
    if not db_event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Evento con ID {event_id} no encontrado"
        )
    
    db_event.location = crud.parse_location_from_db(db, db_event)
    return db_event

@router.put(
    "/{event_id}",
    response_model=schemas.EventResponse,
    summary="Actualizar evento"
)
def update_event(
    event_id: int,
    event: schemas.EventUpdate,
    db: Session = Depends(get_db)
):
    """
    Actualizar la información de un evento existente.
    
    Solo se actualizan los campos proporcionados (actualización parcial).
    """
    db_event = crud.update_event(db, event_id, event)
    
    if not db_event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Evento con ID {event_id} no encontrado"
        )
    
    db_event.location = crud.parse_location_from_db(db, db_event)
    return db_event

@router.delete(
    "/{event_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar evento"
)
def delete_event(
    event_id: int,
    db: Session = Depends(get_db)
):
    """
    Eliminar un evento de forma permanente.
    """
    success = crud.delete_event(db, event_id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Evento con ID {event_id} no encontrado"
        )
    
    return None
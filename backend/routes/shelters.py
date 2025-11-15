# routes.py
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import Optional
import crud.shelters_crud as shelters_crud
import schemas.shelters as schemas
from db import get_db

router = APIRouter(
    prefix="/api/v1/shelters",
    tags=["Shelters"]
)

@router.post(
    "/", 
    response_model=schemas.ShelterResponse, 
    status_code=status.HTTP_201_CREATED,
    summary="Crear nuevo shelter"
)
def create_shelter(
    shelter: schemas.ShelterCreate,
    db: Session = Depends(get_db)
):
    """
    Crear un nuevo shelter con toda su información:
    
    - **shelter_id**: ID único (requerido)
    - **shelter_name**: Nombre del refugio (requerido)
    - **location**: Coordenadas geográficas (requerido)
    - Todos los demás campos son opcionales
    """
    try:
        db_shelter = shelters_crud.create_shelter(db, shelter)
        db_shelter.location = shelters_crud.parse_location_from_db(db, db_shelter)
        return db_shelter
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error al crear shelter: {str(e)}"
        )

@router.get(
    "/", 
    response_model=schemas.ShelterListResponse,
    summary="Listar todos los shelters"
)
def list_shelters(
    page: int = Query(1, ge=1, description="Número de página"),
    page_size: int = Query(10, ge=1, le=100, description="Resultados por página"),
    name: Optional[str] = Query(None, description="Filtrar por nombre"),
    city: Optional[str] = Query(None, description="Filtrar por ciudad"),
    db: Session = Depends(get_db)
):
    """
    Obtener lista paginada de shelters con filtros opcionales.
    
    Parámetros de paginación:
    - **page**: Número de página (default: 1)
    - **page_size**: Tamaño de página (default: 10, max: 100)
    
    Filtros opcionales:
    - **name**: Buscar por nombre (case-insensitive)
    - **city**: Buscar por ciudad en el address
    """
    skip = (page - 1) * page_size
    
    shelters, total = shelters_crud.get_shelters(
        db, 
        skip=skip, 
        limit=page_size,
        name_filter=name,
        city_filter=city
    )
    
    # Parsear las ubicaciones
    for shelter in shelters:
        shelter.location = shelters_crud.parse_location_from_db(db, shelter)
    
    return {
        "shelters": shelters,
        "total": total,
        "page": page,
        "page_size": page_size
    }

@router.get(
    "/nearby",
    response_model=list[schemas.ShelterResponse],
    summary="Buscar shelters cercanos"
)
def find_nearby_shelters(
    longitude: float = Query(..., ge=-180, le=180, description="Longitud"),
    latitude: float = Query(..., ge=-90, le=90, description="Latitud"),
    radius: float = Query(5000, ge=100, le=50000, description="Radio en metros (100-50000)"),
    limit: int = Query(10, ge=1, le=50, description="Máximo de resultados"),
    db: Session = Depends(get_db)
):
    """
    Buscar shelters cercanos a una ubicación específica usando PostGIS.
    
    - **longitude**: Coordenada de longitud
    - **latitude**: Coordenada de latitud  
    - **radius**: Radio de búsqueda en metros (default: 5000m = 5km)
    - **limit**: Cantidad máxima de resultados
    
    Los resultados están ordenados por distancia (más cercano primero).
    """
    shelters = shelters_crud.get_shelters_nearby(
        db,
        longitude=longitude,
        latitude=latitude,
        radius_meters=radius,
        limit=limit
    )
    
    # Parsear las ubicaciones
    for shelter in shelters:
        shelter.location = shelters_crud.parse_location_from_db(db, shelter)
    
    return shelters

@router.get(
    "/available",
    response_model=schemas.ShelterListResponse,
    summary="Shelters con disponibilidad"
)
def list_available_shelters(
    min_beds: int = Query(1, ge=1, description="Mínimo de camas disponibles"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """
    Obtener shelters que tienen camas disponibles.
    
    - **min_beds**: Mínimo de camas disponibles requeridas
    - Ordenados por cantidad de camas disponibles (descendente)
    """
    skip = (page - 1) * page_size
    
    shelters, total = shelters_crud.get_shelters_with_availability(
        db,
        min_beds=min_beds,
        skip=skip,
        limit=page_size
    )
    
    # Parsear las ubicaciones
    for shelter in shelters:
        shelter.location = shelters_crud.parse_location_from_db(db, shelter)
    
    return {
        "shelters": shelters,
        "total": total,
        "page": page,
        "page_size": page_size
    }

@router.get(
    "/{shelter_id}",
    response_model=schemas.ShelterResponse,
    summary="Obtener shelter por ID"
)
def get_shelter(
    shelter_id: int,
    db: Session = Depends(get_db)
):
    """
    Obtener la información completa de un shelter específico por su ID.
    """
    db_shelter = shelters_crud.get_shelter(db, shelter_id)
    
    if not db_shelter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Shelter con ID {shelter_id} no encontrado"
        )
    
    db_shelter.location = shelters_crud.parse_location_from_db(db, db_shelter)
    return db_shelter

@router.put(
    "/{shelter_id}",
    response_model=schemas.ShelterResponse,
    summary="Actualizar shelter"
)
def update_shelter(
    shelter_id: int,
    shelter: schemas.ShelterUpdate,
    db: Session = Depends(get_db)
):
    """
    Actualizar la información de un shelter existente.
    
    Solo se actualizan los campos proporcionados (actualización parcial).
    """
    db_shelter = shelters_crud.update_shelter(db, shelter_id, shelter)
    
    if not db_shelter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Shelter con ID {shelter_id} no encontrado"
        )
    
    db_shelter.location = shelters_crud.parse_location_from_db(db, db_shelter)
    return db_shelter

@router.delete(
    "/{shelter_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar shelter"
)
def delete_shelter(
    shelter_id: int,
    db: Session = Depends(get_db)
):
    """
    Eliminar un shelter de forma permanente.
    """
    success = shelters_crud.delete_shelter(db, shelter_id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Shelter con ID {shelter_id} no encontrado"
        )
    
    return None
from fastapi import FastAPI, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import sessionmaker, declarative_base, relationship, Session
from datetime import datetime
import random
import psycopg2

# Configuración de la base de datos PostgreSQL
DATABASE_URL = "postgresql://usuario:contraseña@localhost/openhealth"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Modelos
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    # Puedes agregar más campos aquí
    locations = relationship("Location", back_populates="user")

class Location(Base):
    __tablename__ = "locations"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    user = relationship("User", back_populates="locations")

# Crear tablas (solo la primera vez)
Base.metadata.create_all(bind=engine)

# FastAPI app
app = FastAPI(root_path="/api/v1")

# Esquemas Pydantic
class UserCreate(BaseModel):
    nombre: str
    email: str

class LocationCreate(BaseModel):
    user_id: int
    latitude: float
    longitude: float
    timestamp: datetime = None

# Dependencia para obtener sesión de BD
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Endpoint para crear usuario
@app.post("/api/users")
def create_user(user: UserCreate, db: Session = Depends(get_db)):
    db_user = User(nombre=user.nombre, email=user.email)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

# Endpoint para guardar ubicación
@app.post("/api/location")
def save_location(location: LocationCreate, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.id == location.user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    db_location = Location(
        user_id=location.user_id,
        latitude=location.latitude,
        longitude=location.longitude,
        timestamp=location.timestamp or datetime.utcnow()
    )
    db.add(db_location)
    db.commit()
    db.refresh(db_location)
    return db_location

@app.get("/")
async def root():
    return {"message": "Hello world!"}

data : Any = [
    {
        "campaign_id": 1,
        "name": "Summer Launch",
        "due_date": datetime.now(),
        "created_at": datetime.now()
    },
    {
        "campaign_id": 2,
        "name": "Black Friday",
        "due_date": datetime.now(),
        "created_at": datetime.now()
    }
]

"""
Campaigns
- campaign_id
- name
- due_date
- created_at
"""

@app.get("/campaigns")
async def read_campaigns():
    return {"campaigns": data}

@app.get("/campaigns/{id}")
async def read_campaign(id: int):
    for campaign in data:
        if campaign.get("campaign_id") == id:
            return {"campaign": campaign}
    raise HTTPException(status_code=404)

@app.post("/campaigns", status_code=201)
async def create_campaign(body: dict[str, Any]):

    new : Any = {
        "campaign_id": random.randint(100, 1000),
        "name": body.get("name"),
        "due_date": body.get("due_date"),
        "created_at": datetime.now()
    }
    
    data.append(new)
    return {"campaign": new}

@app.put("/campaigns/{id}",)
async def delete_campaign(id: int, body: dict[str, Any]):

    for index, campaign in enumerate(data):
        if campaign.get("campaign_id") == id:

            updated : Any = {
                "campaign_id": id,
                "name": body.get("name"),
                "due_date": body.get("due_date"),
                "created_at": campaign.get("created_at")
            }
            data[index] = updated
            return {"campaign": updated}
    raise HTTPException(status_code=404)
    

@app.delete("/campaigns/{id}",)
async def update_campaign(id: int):

    for index, campaign in enumerate(data):
        if campaign.get("campaign_id") == id:
            data.pop(index)
            return Response(status_code=204)
    raise HTTPException(status_code=404)
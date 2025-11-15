# main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.shelters import router as shelters_router
from routes.events import router as events_router

# Crear aplicación FastAPI
app = FastAPI(
    title="Shelters API",
    description="API REST para gestión de refugios con ubicaciones geográficas (PostGIS)",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configurar CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En producción: especificar dominios permitidos
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Incluir router de shelters
app.include_router(shelters_router)
app.include_router(events_router)

@app.get("/", tags=["Root"])
def root():
    """Endpoint raíz con información de la API"""
    return {
        "message": "Shelters API - Sistema de gestión de refugios",
        "version": "1.0.0",
        "docs": "/docs",
        "redoc": "/redoc",
        "endpoints": {
            "shelters": "/api/v1/shelters"
        }
    }

@app.get("/health", tags=["Health"])
def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "shelters-api"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True  # Solo en desarrollo
    )
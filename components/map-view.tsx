"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MapPin, Phone, Clock, Bed, Menu, X } from "lucide-react"
import type { Shelter } from "@/lib/types"
import { mockShelters } from "@/lib/mock-data"

export function MapView() {
  const [selectedShelter, setSelectedShelter] = useState<Shelter | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [mapState, setMapState] = useState({
    centerLat: 32.7157,
    centerLng: -117.1611,
    zoom: 13,
  })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const tilesCache = useRef<Map<string, HTMLImageElement>>(new Map())

  // Convert lat/lng to tile coordinates
  const latLngToTile = (lat: number, lng: number, zoom: number) => {
    const x = Math.floor(((lng + 180) / 360) * Math.pow(2, zoom))
    const y = Math.floor(
      ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
        Math.pow(2, zoom),
    )
    return { x, y }
  }

  // Convert lat/lng to pixel coordinates
  const latLngToPixel = (
    lat: number,
    lng: number,
    zoom: number,
    centerLat: number,
    centerLng: number,
    width: number,
    height: number,
  ) => {
    const scale = 256 * Math.pow(2, zoom)
    const worldX = ((lng + 180) / 360) * scale
    const worldY =
      ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * scale

    const centerWorldX = ((centerLng + 180) / 360) * scale
    const centerWorldY =
      ((1 - Math.log(Math.tan((centerLat * Math.PI) / 180) + 1 / Math.cos((centerLat * Math.PI) / 180)) / Math.PI) /
        2) *
      scale

    return {
      x: width / 2 + (worldX - centerWorldX),
      y: height / 2 + (worldY - centerWorldY),
    }
  }

  // Load and cache tile images
  const loadTile = (x: number, y: number, zoom: number): Promise<HTMLImageElement> => {
    const key = `${zoom}-${x}-${y}`
    if (tilesCache.current.has(key)) {
      return Promise.resolve(tilesCache.current.get(key)!)
    }

    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        tilesCache.current.set(key, img)
        resolve(img)
      }
      img.onerror = reject
      const server = ["a", "b", "c"][Math.floor(Math.random() * 3)]
      img.src = `https://${server}.tile.openstreetmap.org/${zoom}/${x}/${y}.png`
    })
  }

  // Draw the map
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height

    // Create an offscreen canvas for double buffering
    const offscreenCanvas = document.createElement("canvas")
    offscreenCanvas.width = width
    offscreenCanvas.height = height
    const offscreenCtx = offscreenCanvas.getContext("2d")
    if (!offscreenCtx) return

    // Clear offscreen canvas
    offscreenCtx.fillStyle = "#e0f2fe"
    offscreenCtx.fillRect(0, 0, width, height)

    const { centerLat, centerLng, zoom } = mapState
    const centerTile = latLngToTile(centerLat, centerLng, zoom)

    // Calculate how many tiles we need to cover the canvas
    const tilesX = Math.ceil(width / 256) + 2
    const tilesY = Math.ceil(height / 256) + 2

    // Draw tiles
    const tilePromises: Promise<void>[] = []
    for (let dx = -Math.floor(tilesX / 2); dx <= Math.ceil(tilesX / 2); dx++) {
      for (let dy = -Math.floor(tilesY / 2); dy <= Math.ceil(tilesY / 2); dy++) {
        const tileX = centerTile.x + dx
        const tileY = centerTile.y + dy

        if (tileX < 0 || tileY < 0 || tileX >= Math.pow(2, zoom) || tileY >= Math.pow(2, zoom)) continue

        const promise = loadTile(tileX, tileY, zoom)
          .then((img) => {
            const centerPixel = latLngToPixel(centerLat, centerLng, zoom, centerLat, centerLng, width, height)
            const tileWorldX = tileX * 256
            const tileWorldY = tileY * 256
            const centerWorldX = ((centerLng + 180) / 360) * 256 * Math.pow(2, zoom)
            const centerWorldY =
              ((1 -
                Math.log(Math.tan((centerLat * Math.PI) / 180) + 1 / Math.cos((centerLat * Math.PI) / 180)) / Math.PI) /
                2) *
              256 *
              Math.pow(2, zoom)

            const x = width / 2 + (tileWorldX - centerWorldX)
            const y = height / 2 + (tileWorldY - centerWorldY)

            offscreenCtx.drawImage(img, x, y, 256, 256)
          })
          .catch(() => {
            // Silently fail for missing tiles
          })

        tilePromises.push(promise)
      }
    }

    // Draw markers after tiles load
    Promise.all(tilePromises).then(() => {
      mockShelters.forEach((shelter) => {
        const pos = latLngToPixel(shelter.lat, shelter.lng, zoom, centerLat, centerLng, width, height)

        // Draw marker shadow
        offscreenCtx.fillStyle = "rgba(0, 0, 0, 0.2)"
        offscreenCtx.beginPath()
        offscreenCtx.ellipse(pos.x, pos.y + 2, 12, 6, 0, 0, Math.PI * 2)
        offscreenCtx.fill()

        // Draw marker pin
        offscreenCtx.fillStyle = "#2563eb"
        offscreenCtx.strokeStyle = "white"
        offscreenCtx.lineWidth = 3
        offscreenCtx.beginPath()
        offscreenCtx.arc(pos.x, pos.y - 20, 15, 0, Math.PI * 2)
        offscreenCtx.fill()
        offscreenCtx.stroke()

        // Draw availability indicator
        const color = shelter.availableBeds > 10 ? "#22c55e" : shelter.availableBeds > 0 ? "#eab308" : "#ef4444"
        offscreenCtx.fillStyle = color
        offscreenCtx.strokeStyle = "white"
        offscreenCtx.lineWidth = 2
        offscreenCtx.beginPath()
        offscreenCtx.arc(pos.x + 10, pos.y - 30, 6, 0, Math.PI * 2)
        offscreenCtx.fill()
        offscreenCtx.stroke()

        // Draw pin point
        offscreenCtx.fillStyle = "#2563eb"
        offscreenCtx.beginPath()
        offscreenCtx.moveTo(pos.x, pos.y)
        offscreenCtx.lineTo(pos.x - 6, pos.y - 15)
        offscreenCtx.lineTo(pos.x + 6, pos.y - 15)
        offscreenCtx.closePath()
        offscreenCtx.fill()
      })

      // Clear the main canvas and draw the fully rendered offscreen canvas
      ctx.clearRect(0, 0, width, height)
      ctx.drawImage(offscreenCanvas, 0, 0)
    })
  }, [mapState])

  // Handle canvas click to select shelter
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top

    const { centerLat, centerLng, zoom } = mapState

    // Check if click is near any marker
    for (const shelter of mockShelters) {
      const pos = latLngToPixel(shelter.lat, shelter.lng, zoom, centerLat, centerLng, canvas.width, canvas.height)
      const distance = Math.sqrt(Math.pow(clickX - pos.x, 2) + Math.pow(clickY - pos.y, 2))

      if (distance < 20) {
        setSelectedShelter(shelter)
        setMapState({
          centerLat: shelter.lat,
          centerLng: shelter.lng,
          zoom: Math.max(zoom, 15),
        })
        return
      }
    }
  }

  // Handle mouse drag
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY })
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return

    const dx = e.clientX - dragStart.x
    const dy = e.clientY - dragStart.y

    const scale = 256 * Math.pow(2, mapState.zoom)
    const dlng = (dx / scale) * 360
    const dlat = (dy / scale) * 360

    setMapState((prev) => ({
      ...prev,
      centerLng: prev.centerLng - dlng,
      centerLat: prev.centerLat + dlat,
    }))

    setDragStart({ x: e.clientX, y: e.clientY })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  // Handle zoom
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -.8 : .8
    setMapState((prev) => ({
      ...prev,
      zoom: Math.max(10, Math.min(18, prev.zoom + delta)),
    }))
  }

  // Handle canvas resize
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resizeCanvas = () => {
      const container = canvas.parentElement
      if (container) {
        canvas.width = container.clientWidth
        canvas.height = container.clientHeight
        // Trigger a re-render to draw the map on the resized canvas
        setMapState((prev) => ({ ...prev }))
      }
    }

    resizeCanvas()
    window.addEventListener("resize", resizeCanvas)
    return () => window.removeEventListener("resize", resizeCanvas)
  }, [])

  return (
    <div className="relative h-[calc(100vh-180px)] md:h-[calc(100vh-160px)]">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 rounded-xl overflow-hidden shadow-lg z-0 cursor-move"
        onClick={handleCanvasClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />

      <Button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="absolute top-4 right-4 z-20 shadow-lg md:hidden"
        size="icon"
      >
        {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </Button>

      <Button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="hidden md:flex absolute top-4 right-4 z-20 shadow-lg"
        size="sm"
      >
        {isSidebarOpen ? (
          <>
            <X className="w-4 h-4 mr-2" />
            Cerrar
          </>
        ) : (
          <>
            <Menu className="w-4 h-4 mr-2" />
            Lista de Refugios
          </>
        )}
      </Button>

      {isSidebarOpen && (
        <aside className="absolute top-4 right-4 w-full md:w-96 bg-background/95 backdrop-blur-sm shadow-2xl z-10 rounded-xl overflow-y-auto max-h-[80vh]">
          <div className="p-4 space-y-4 pb-6">
            <div className="flex items-center justify-between top-0 bg-background/95 backdrop-blur-sm pb-3 border-b">
              <div>
                <h2 className="font-bold text-xl text-foreground">Refugios Disponibles</h2>
                <p className="text-sm text-muted-foreground">{mockShelters.length} ubicaciones</p>
              </div>
              <Button onClick={() => setIsSidebarOpen(false)} variant="ghost" size="icon" className="md:hidden">
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="space-y-3">
              {mockShelters.map((shelter) => (
                <Card
                  key={shelter.id}
                  className={`p-4 cursor-pointer transition-all hover:shadow-md hover:border-primary/50 ${
                    selectedShelter?.id === shelter.id ? "ring-2 ring-primary border-primary bg-primary/5" : ""
                  }`}
                  onClick={() => {
                    setSelectedShelter(shelter)
                    setMapState({
                      centerLat: shelter.lat,
                      centerLng: shelter.lng,
                      zoom: Math.max(mapState.zoom, 15),
                    })
                     if (window.innerWidth < 768) {
                      setIsSidebarOpen(false)
                    }
                  }}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-base text-foreground leading-tight">{shelter.name}</h3>
                      <Badge
                        variant={
                          shelter.availableBeds > 10 ? "default" : shelter.availableBeds > 0 ? "secondary" : "destructive"
                        }
                        className="shrink-0"
                      >
                        <Bed className="w-3 h-3 mr-1" />
                        {shelter.availableBeds}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground flex items-start gap-1">
                      <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                      <span className="line-clamp-2">{shelter.address}</span>
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {shelter.hours}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {shelter.services.slice(0, 3).map((service) => (
                        <Badge key={service} variant="outline" className="text-xs">
                          {service}
                        </Badge>
                      ))}
                      {shelter.services.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{shelter.services.length - 3}
                        </Badge>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </aside>
      )}

      {selectedShelter && (
        <div className="absolute bottom-4 left-4 right-4 md:left-4 md:right-auto md:max-w-md z-30">
          <Card className="p-5 shadow-2xl border-2 border-primary/30 bg-white/98 backdrop-blur-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-3">
                <div>
                  <h3 className="font-bold text-xl text-foreground">{selectedShelter.name}</h3>
                  <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                    <MapPin className="w-4 h-4" />
                    {selectedShelter.address}
                  </p>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <Badge
                    variant={selectedShelter.availableBeds > 10 ? "default" : "secondary"}
                    className="text-base px-3 py-1"
                  >
                    <Bed className="w-4 h-4 mr-1" />
                    {selectedShelter.availableBeds} camas
                  </Badge>
                  <Badge variant="outline" className="text-sm">
                    <Clock className="w-3 h-3 mr-1" />
                    {selectedShelter.hours}
                  </Badge>
                </div>

                <div className="flex flex-wrap gap-2">
                  {selectedShelter.services.map((service) => (
                    <Badge key={service} variant="secondary" className="text-xs">
                      {service}
                    </Badge>
                  ))}
                </div>

                <p className="text-sm text-muted-foreground">{selectedShelter.description}</p>

                <Button className="w-full" size="lg" asChild>
                  <a href={`tel:${selectedShelter.phone}`}>
                    <Phone className="w-4 h-4 mr-2" />
                    Llamar: {selectedShelter.phone}
                  </a>
                </Button>
              </div>
              <Button size="sm" onClick={() => setSelectedShelter(null)} variant="ghost" className="shrink-0">
                ✕
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

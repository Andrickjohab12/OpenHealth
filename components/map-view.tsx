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
  // Keep the initial center so we can reset to it later
  const initialCenter = useRef({ centerLat: 32.7157, centerLng: -117.1611, zoom: 13 })
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [isFollowing, setIsFollowing] = useState(false)
  const watchIdRef = useRef<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const tilesCache = useRef<Map<string, HTMLImageElement>>(new Map())
  const animRef = useRef<{ canceled?: boolean } | null>(null)
  const mapStateRef = useRef(mapState)
  const drawGenRef = useRef(0)
  const dragLastRef = useRef<{ x: number; y: number } | null>(null)
  const rafPanRef = useRef<number | null>(null)
  const [sizeTick, setSizeTick] = useState(0)
  // Tile loading limits and LRU cache
  const TILE_CONCURRENCY = 6
  const MAX_TILE_CACHE = 300
  const tileActiveCount = useRef(0)
  const tileQueue = useRef<Array<() => void>>([])
  const tileLRU = useRef<string[]>([])

  // Smoothly animate map center/zoom to a target using requestAnimationFrame
  const animateTo = (
    target: { centerLat: number; centerLng: number; zoom?: number },
    duration = 600,
  ) => {
    // cancel previous
    if (animRef.current) animRef.current.canceled = true
    const token = { canceled: false }
    animRef.current = token

    const start = performance.now()
    const from = { ...mapState }
    const to = { centerLat: target.centerLat, centerLng: target.centerLng, zoom: target.zoom ?? from.zoom }

    const ease = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t) // easeInOutQuad-like

    const step = (now: number) => {
      if (token.canceled) return
      const t = Math.min(1, (now - start) / duration)
      const e = ease(t)
      const lat = from.centerLat + (to.centerLat - from.centerLat) * e
      const lng = from.centerLng + (to.centerLng - from.centerLng) * e
      const zoom = from.zoom + (to.zoom - from.zoom) * e
      setMapState({ centerLat: lat, centerLng: lng, zoom })
      if (t < 1) requestAnimationFrame(step)
    }

    requestAnimationFrame(step)
    return () => {
      token.canceled = true
    }
  }

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
  const processTileQueue = () => {
    if (tileActiveCount.current >= TILE_CONCURRENCY) return
    const next = tileQueue.current.shift()
    if (!next) return
    tileActiveCount.current += 1
    try {
      next()
    } finally {
      tileActiveCount.current = Math.max(0, tileActiveCount.current - 1)
      // schedule next microtask to process queue
      setTimeout(processTileQueue, 0)
    }
  }

  const enqueueTileLoad = (fn: () => void) => {
    tileQueue.current.push(fn)
    // try to process immediately
    processTileQueue()
  }

  const markTileUsed = (key: string) => {
    const idx = tileLRU.current.indexOf(key)
    if (idx !== -1) tileLRU.current.splice(idx, 1)
    tileLRU.current.push(key)
    // evict if too many
    while (tileLRU.current.length > MAX_TILE_CACHE) {
      const old = tileLRU.current.shift()
      if (old) tilesCache.current.delete(old)
    }
  }

  const loadTile = (x: number, y: number, zoom: number): Promise<HTMLImageElement> => {
    // expect integer zoom (we pass tileZoom which is Math.floor(zoom))
    const z = Math.floor(zoom)
    const key = `${z}-${x}-${y}`
    if (tilesCache.current.has(key)) {
      // refresh LRU
      markTileUsed(key)
      return Promise.resolve(tilesCache.current.get(key)!)
    }

    return new Promise((resolve, reject) => {
      const doLoad = () => {
        const img = new Image()
        // DO NOT set crossOrigin here: many public tile servers (including tile.openstreetmap.org)
        // don't return Access-Control-Allow-Origin and will cause the request to fail when
        // crossOrigin is set. Not setting crossOrigin allows the image to load; note this
        // will taint the canvas if you later try to read its pixels (toDataURL).
        img.onload = () => {
          tilesCache.current.set(key, img)
          markTileUsed(key)
          resolve(img)
        }
        img.onerror = () => {
          reject(new Error("Tile load error"))
        }
        const server = ["a", "b", "c"][Math.floor(Math.random() * 3)]
        img.src = `https://${server}.tile.openstreetmap.org/${z}/${x}/${y}.png`
      }

      enqueueTileLoad(doLoad)
    })
  }

  // Draw the map
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

  const ctx = canvas.getContext("2d")
  if (!ctx) return

  // Handle devicePixelRatio for crisp rendering
  const dpr = window.devicePixelRatio || 1
  const cssWidth = canvas.parentElement ? canvas.parentElement.clientWidth : canvas.clientWidth
  const cssHeight = canvas.parentElement ? canvas.parentElement.clientHeight : canvas.clientHeight
  canvas.width = Math.max(1, Math.floor(cssWidth * dpr))
  canvas.height = Math.max(1, Math.floor(cssHeight * dpr))
  // scale the context so drawing coordinates use CSS pixels
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const width = cssWidth
  const height = cssHeight

    // Clear canvas
    ctx.fillStyle = "#e0f2fe"
    ctx.fillRect(0, 0, width, height)

  const { centerLat, centerLng, zoom } = mapState
  // use floor zoom for tile requests and scale tiles for fractional zoom
  const tileZoom = Math.floor(zoom)
  // bump generation so stale tile loads won't draw
  const generation = ++drawGenRef.current
  const centerTile = latLngToTile(centerLat, centerLng, tileZoom)
  const scaleFactor = Math.pow(2, zoom - tileZoom)

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

        const promise = loadTile(tileX, tileY, tileZoom)
          .then((img) => {
            // ignore if a newer draw started
            if (generation !== drawGenRef.current) return
            const centerPixel = latLngToPixel(centerLat, centerLng, zoom, centerLat, centerLng, width, height)
            // tile image is at zoom = tileZoom, scale it to match fractional zoom
            const tileWorldX = tileX * 256 * scaleFactor
            const tileWorldY = tileY * 256 * scaleFactor
            const centerWorldX = ((centerLng + 180) / 360) * 256 * Math.pow(2, zoom)
            const centerWorldY =
              ((1 -
                Math.log(Math.tan((centerLat * Math.PI) / 180) + 1 / Math.cos((centerLat * Math.PI) / 180)) / Math.PI) /
                2) *
              256 *
              Math.pow(2, zoom)

            const x = width / 2 + (tileWorldX - centerWorldX)
            const y = height / 2 + (tileWorldY - centerWorldY)

            // draw scaled tile
            const drawSize = 256 * scaleFactor
            ctx.drawImage(img, x, y, drawSize, drawSize)
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
        ctx.fillStyle = "rgba(0, 0, 0, 0.2)"
        ctx.beginPath()
        ctx.ellipse(pos.x, pos.y + 2, 12, 6, 0, 0, Math.PI * 2)
        ctx.fill()

        // Draw marker pin
        ctx.fillStyle = "#2563eb"
        ctx.strokeStyle = "white"
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(pos.x, pos.y - 20, 15, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()

        // Draw availability indicator
        const color = shelter.availableBeds > 10 ? "#22c55e" : shelter.availableBeds > 0 ? "#eab308" : "#ef4444"
        ctx.fillStyle = color
        ctx.strokeStyle = "white"
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(pos.x + 10, pos.y - 30, 6, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()

        // Draw pin point
        ctx.fillStyle = "#2563eb"
        ctx.beginPath()
        ctx.moveTo(pos.x, pos.y)
        ctx.lineTo(pos.x - 6, pos.y - 15)
        ctx.lineTo(pos.x + 6, pos.y - 15)
        ctx.closePath()
        ctx.fill()
      })

      // Draw user location marker if available
      if (userLocation) {
        const posU = latLngToPixel(userLocation.lat, userLocation.lng, zoom, centerLat, centerLng, width, height)

        // shadow
        ctx.fillStyle = "rgba(0,0,0,0.2)"
        ctx.beginPath()
        ctx.ellipse(posU.x, posU.y + 2, 8, 4, 0, 0, Math.PI * 2)
        ctx.fill()

        // user circle
        ctx.fillStyle = "#f59e0b"
        ctx.strokeStyle = "white"
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(posU.x, posU.y - 6, 8, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()

        // label
        ctx.fillStyle = "#111827"
        ctx.font = "12px sans-serif"
        ctx.textAlign = "center"
        ctx.fillText("Tú", posU.x, posU.y - 18)
      }
    })
  }, [mapState, userLocation, sizeTick])

  // Request user location on mount and optionally center map
  useEffect(() => {
    if (!("geolocation" in navigator)) return

    const onSuccess = (pos: GeolocationPosition) => {
      const lat = pos.coords.latitude
      const lng = pos.coords.longitude
      setUserLocation({ lat, lng })
      console.log("Geolocation success:", { lat, lng })
      // Optionally center the map when the user first grants permission
      animateTo({ centerLat: lat, centerLng: lng }, 700)
    }

    const onError = (err: GeolocationPositionError) => {
      // Keep default center if user denies or error occurs
      console.warn("Geolocation error:", err.message)
    }

    // Try to get current position once
    navigator.geolocation.getCurrentPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      timeout: 10000,
    })
  }, [])

  // keep mapStateRef up to date
  useEffect(() => {
    mapStateRef.current = mapState
  }, [mapState])

  // Center map on user's location (single action)
  const centerOnUser = () => {
    if (!userLocation) {
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = pos.coords.latitude
            const lng = pos.coords.longitude
            setUserLocation({ lat, lng })
            animateTo({ centerLat: lat, centerLng: lng, zoom: Math.max(mapState.zoom, 15) }, 700)
          },
          (err) => console.warn("Geolocation error:", err.message),
          { enableHighAccuracy: true, timeout: 10000 },
        )
      }
      return
    }

    animateTo({ centerLat: userLocation.lat, centerLng: userLocation.lng, zoom: Math.max(mapState.zoom, 15) }, 700)
  }

  // When isFollowing is enabled, start watchPosition to update userLocation continuously
  useEffect(() => {
    if (!("geolocation" in navigator)) return

    if (isFollowing) {
      // start watch
      const id = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = pos.coords.latitude
          const lng = pos.coords.longitude
          setUserLocation({ lat, lng })
          // keep centering while following — smooth, short animation
          animateTo({ centerLat: lat, centerLng: lng }, 300)
        },
        (err) => console.warn("Geolocation watch error:", err.message),
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 },
      )

      watchIdRef.current = id
    } else {
      // stop watch if it exists
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }

    // cleanup on unmount
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [isFollowing])

  // Reset map to the initial center
  const resetToInitial = () => {
    setMapState(initialCenter.current)
    // also stop following if active
    if (isFollowing) setIsFollowing(false)
  }

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
      const pos = latLngToPixel(shelter.lat, shelter.lng, zoom, centerLat, centerLng, rect.width, rect.height)
      const distance = Math.sqrt(Math.pow(clickX - pos.x, 2) + Math.pow(clickY - pos.y, 2))

      if (distance < 20) {
        setSelectedShelter(shelter)
        animateTo({ centerLat: shelter.lat, centerLng: shelter.lng, zoom: Math.max(zoom, 15) }, 600)
        return
      }
    }
  }

  // Handle mouse drag
  // Pointer-based drag (unified mouse + touch)
  const lastMoves = useRef<Array<{ x: number; y: number; t: number }>>([])

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    // capture pointer for consistent events
    try {
      ;(e.target as Element).setPointerCapture(e.pointerId)
    } catch {}
    setIsDragging(true)
    if (isFollowing) setIsFollowing(false)
    // store local (rect) coords as drag start
    const lx = e.clientX - rect.left
    const ly = e.clientY - rect.top
    setDragStart({ x: lx, y: ly })
    lastMoves.current = [{ x: lx, y: ly, t: performance.now() }]
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDragging) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const now = performance.now()
    // local coords
    const lx = e.clientX - rect.left
    const ly = e.clientY - rect.top
    // add to recent moves (keep last 8 samples)
    lastMoves.current.push({ x: lx, y: ly, t: now })
    if (lastMoves.current.length > 8) lastMoves.current.shift()

    // RAF-throttled panning (similar to previous)
  dragLastRef.current = { x: lx, y: ly }
    if (rafPanRef.current != null) return

    const panStep = () => {
      rafPanRef.current = null
      if (!isDragging || !dragLastRef.current) return
  const last = dragLastRef.current
  const dx = last.x - dragStart.x
  const dy = last.y - dragStart.y
  const scale = 256 * Math.pow(2, mapStateRef.current.zoom)
      const dlng = (dx / scale) * 360
      const dlat = (dy / scale) * 360
      setMapState((prev) => {
        const next = {
          ...prev,
          centerLng: prev.centerLng - dlng,
          centerLat: prev.centerLat + dlat,
        }
        mapStateRef.current = next
        return next
      })
  setDragStart({ x: last.x, y: last.y })
      dragLastRef.current = null
    }

    rafPanRef.current = requestAnimationFrame(panStep)
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // release pointer capture
    try {
      ;(e.target as Element).releasePointerCapture(e.pointerId)
    } catch {}
    setIsDragging(false)
    if (rafPanRef.current) {
      cancelAnimationFrame(rafPanRef.current)
      rafPanRef.current = null
    }

    // compute velocity from lastMoves and start inertia if fast enough
    const moves = lastMoves.current
    if (moves.length >= 2) {
      const last = moves[moves.length - 1]
      // find an earlier sample ~50-150ms ago
      let i = moves.length - 2
      while (i > 0 && last.t - moves[i].t < 40) i--
      const first = moves[i]
      const dt = Math.max(1, last.t - first.t)
      const vx = (last.x - first.x) / dt // px per ms
      const vy = (last.y - first.y) / dt
      const speed = Math.hypot(vx, vy)
      if (speed > 0.05) {
        // start inertia animation
        let vX = vx * 16.67 // approximate per-frame pixels (60fps)
        let vY = vy * 16.67
        const friction = 0.92
        const inertiaStep = () => {
          // convert pixel delta to lat/lng delta
          const scale = 256 * Math.pow(2, mapStateRef.current.zoom)
          const dlng = (vX / scale) * 360
          const dlat = (vY / scale) * 360
          setMapState((prev) => {
            const next = {
              ...prev,
              centerLng: prev.centerLng - dlng,
              centerLat: prev.centerLat + dlat,
            }
            mapStateRef.current = next
            return next
          })
          vX *= friction
          vY *= friction
          if (Math.hypot(vX, vY) > 0.5) {
            requestAnimationFrame(inertiaStep)
          }
        }
        requestAnimationFrame(inertiaStep)
      }
    }
    lastMoves.current = []
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
        const dpr = window.devicePixelRatio || 1
        const cssWidth = container.clientWidth
        const cssHeight = container.clientHeight
        canvas.width = Math.max(1, Math.floor(cssWidth * dpr))
        canvas.height = Math.max(1, Math.floor(cssHeight * dpr))
        const ctx = canvas.getContext("2d")
        if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        // trigger redraw
        setSizeTick((s) => s + 1)
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
        style={{ touchAction: "none" }}
        onClick={handleCanvasClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
      />

      <Button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="absolute top-4 right-4 z-20 shadow-lg md:hidden"
        size="icon"
      >
        {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </Button>

      {/* Center & Follow controls */}
      <div className="absolute top-4 left-4 md:left-auto md:right-16 z-20 flex items-center gap-2">
        <Button onClick={resetToInitial} size="sm" className="shadow-lg" aria-label="Volver al inicio">
          <span className="hidden md:inline">Inicio</span>
          <span className="md:hidden">🏠</span>
        </Button>

        <Button onClick={() => centerOnUser()} className="shadow-lg" size="icon" aria-label="Centrar en mi ubicación">
          <MapPin className="w-5 h-5" />
        </Button>

        <Button
          onClick={() => setIsFollowing((s) => !s)}
          className={`shadow-lg ${isFollowing ? "bg-primary text-white" : ""}`}
          size="icon"
          aria-pressed={isFollowing}
          aria-label={isFollowing ? "Dejar de seguir" : "Seguir ubicación"}
        >
          {isFollowing ? <X className="w-5 h-5" /> : <MapPin className="w-5 h-5" />}
        </Button>
      </div>

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
                    animateTo({ centerLat: shelter.lat, centerLng: shelter.lng, zoom: Math.max(mapState.zoom, 15) }, 600)
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

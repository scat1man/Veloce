import { useEffect, useRef, useState } from 'react'
import type { Map as MapLibreMap, Marker } from 'maplibre-gl'
import { locations, type Location } from '../../data/locations'
import { prefersReducedMotion } from '../../hooks/scrollTo'
import { mapStyle } from './mapStyle'

type Props = {
  selectedId: string | null
  onSelect: (id: string) => void
  /** Called if the map cannot start (no WebGL, library failed to load). */
  onFail?: () => void
  className?: string
}

/** Room around the five hubs: pin names sit to the right, and phones get a tighter frame. */
const framePadding = (el: HTMLElement) =>
  el.clientWidth < 640 ? { top: 56, bottom: 56, left: 28, right: 28 } : { top: 88, bottom: 88, left: 72, right: 180 }

const overview = (): [[number, number], [number, number]] => {
  const lng = locations.map((l) => l.pickup[0])
  const lat = locations.map((l) => l.pickup[1])
  return [
    [Math.min(...lng), Math.min(...lat)],
    [Math.max(...lng), Math.max(...lat)],
  ]
}

/**
 * The map itself: MapLibre GL over OpenFreeMap tiles, one pin per pickup hub.
 * The library (about 250 KB gzipped) is only fetched once the visitor scrolls
 * near the map. Scrolling the page over it keeps scrolling the page; Ctrl or ⌘
 * + scroll (or two fingers on a phone) moves the map instead.
 */
export function PickupMap({ selectedId, onSelect, onFail, className = '' }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibreMap | null>(null)
  const pins = useRef(new Map<string, { marker: Marker; el: HTMLButtonElement }>())
  const [near, setNear] = useState(false)
  const [ready, setReady] = useState(false)
  const select = useRef(onSelect)
  select.current = onSelect

  // Wait until the map is close to the viewport before loading anything.
  useEffect(() => {
    const el = box.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: '600px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!near || !box.current) return
    let cancelled = false
    const el = box.current
    const markers = pins.current

    // The page's smooth scroller should not also scroll while Ctrl/⌘ + wheel zooms the map.
    const keepZoomWheel = (e: WheelEvent) => (e.ctrlKey || e.metaKey) && e.stopPropagation()
    el.addEventListener('wheel', keepZoomWheel, { passive: true })

    Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl.css')])
      .then(([{ default: maplibregl }]) => {
        if (cancelled) return
        const m = new maplibregl.Map({
          container: el,
          style: mapStyle,
          bounds: overview(),
          fitBoundsOptions: { padding: framePadding(el) },
          minZoom: 1.5,
          maxZoom: 16,
          cooperativeGestures: true,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          attributionControl: { compact: true },
          locale: {
            'CooperativeGesturesHandler.WindowsHelpText': 'Hold Ctrl and scroll to zoom the map',
            'CooperativeGesturesHandler.MacHelpText': 'Hold ⌘ and scroll to zoom the map',
            'CooperativeGesturesHandler.MobileHelpText': 'Use two fingers to move the map',
          },
        })
        m.touchZoomRotate.disableRotation()
        m.keyboard.disableRotation()
        m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
        map.current = m

        for (const l of locations) {
          const pin = makePin(l)
          pin.addEventListener('click', () => select.current(l.id))
          const marker = new maplibregl.Marker({ element: pin, anchor: 'left', offset: [-7, 0] }).setLngLat(l.pickup).addTo(m)
          markers.set(l.id, { marker, el: pin })
        }
        m.once('load', () => !cancelled && setReady(true))
      })
      .catch(() => !cancelled && onFail?.())

    return () => {
      cancelled = true
      el.removeEventListener('wheel', keepZoomWheel)
      markers.clear()
      map.current?.remove()
      map.current = null
    }
    // onFail is only read when the map fails to start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near])

  // Follow the selection: fly to the chosen hub, or back out to all five.
  useEffect(() => {
    const m = map.current
    if (!m) return
    for (const [id, { el }] of pins.current) {
      const on = id === selectedId
      el.dataset.on = on ? 'true' : 'false'
      el.setAttribute('aria-pressed', String(on))
    }
    const target = locations.find((l) => l.id === selectedId)
    const reduce = prefersReducedMotion()
    if (target) {
      const view = { center: target.pickup, zoom: 13.2 }
      if (reduce) m.jumpTo(view)
      else m.flyTo({ ...view, speed: 1.4, curve: 1.5, essential: false })
    } else {
      m.fitBounds(overview(), { padding: framePadding(m.getContainer()), animate: !reduce, duration: 1200 })
    }
  }, [selectedId, ready])

  return <div ref={box} className={`pickup-map ${className}`} role="region" aria-label="Map of pickup locations" />
}

/** A pin: a small bone dot with the city name beside it. The dot sits on the hub. */
function makePin(l: Location) {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = 'pickup-pin'
  b.dataset.on = 'false'
  b.setAttribute('aria-label', `${l.hub}, ${l.city}: show the cars kept here`)
  b.setAttribute('aria-pressed', 'false')
  const dot = document.createElement('span')
  dot.className = 'pickup-pin-dot'
  dot.setAttribute('aria-hidden', 'true')
  const name = document.createElement('span')
  name.className = 'pickup-pin-name'
  name.textContent = l.city
  b.append(dot, name)
  return b
}

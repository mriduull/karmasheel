import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Test double for `react-leaflet`, used via
 * `vi.mock('react-leaflet', () => import('@/test/mocks/reactLeaflet'))`
 * in every test that renders `LocationPicker`. Real Leaflet needs actual
 * DOM layout (tile loading, pixel math) that jsdom cannot provide
 * reliably, so map/marker interaction is exposed here as plain buttons
 * with fixed, known coordinates instead — deterministic and fast, at the
 * cost of not exercising real Leaflet rendering (covered instead by the
 * manual acceptance test).
 */
export const MOCK_CLICK_LATLNG = { lat: 27.7005, lng: 85.301 }
const MOCK_PRECISE_CLICK_LATLNG = { lat: 27.700512345, lng: 85.301045678 }
export const MOCK_DRAG_LATLNG = { lat: 27.71, lng: 85.31 }

type ClickHandler = (event: { latlng: { lat: number; lng: number } }) => void

interface MapContainerProps {
  children?: ReactNode
  ref?: (map: MockMap | null) => void
  zoom?: number
  [key: string]: unknown
}

interface MockMap {
  on: (event: string, handler: ClickHandler) => void
  off: (event: string, handler?: ClickHandler) => void
  flyTo: (...args: unknown[]) => void
  setView: (...args: unknown[]) => void
  invalidateSize: () => void
  getZoom: () => number
  getCenter: () => { lat: number; lng: number }
  getContainer: () => HTMLElement | null
}

export function MapContainer({ children, ref: mapRef, zoom }: MapContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const clickHandlers = useRef(new Set<ClickHandler>())

  useEffect(() => {
    const map: MockMap = {
      on: (event, handler) => {
        if (event === 'click') clickHandlers.current.add(handler)
      },
      off: (event, handler) => {
        if (event === 'click' && handler) clickHandlers.current.delete(handler)
      },
      flyTo: () => {},
      setView: () => {},
      invalidateSize: () => {},
      getZoom: () => 13,
      getCenter: () => ({ lat: 27.7172, lng: 85.324 }),
      getContainer: () => containerRef.current,
    }
    mapRef?.(map)
    return () => mapRef?.(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div ref={containerRef} data-testid="location-map" data-zoom={zoom}>
      {children}
      <button
        type="button"
        onClick={() => clickHandlers.current.forEach((handler) => handler({ latlng: MOCK_CLICK_LATLNG }))}
      >
        Simulate map click
      </button>
      <button
        type="button"
        onClick={() => clickHandlers.current.forEach((handler) => handler({ latlng: MOCK_PRECISE_CLICK_LATLNG }))}
      >
        Simulate precise map click
      </button>
    </div>
  )
}

export function TileLayer(props: {
  url?: string
  attribution?: string
  eventHandlers?: { load?: () => void; tileerror?: () => void }
}) {
  return (
    <button
      type="button"
      data-testid="simulate-tile-error"
      data-url={props.url}
      data-attribution={props.attribution}
      onClick={() => props.eventHandlers?.tileerror?.()}
    >
      Simulate tile error
    </button>
  )
}

interface MarkerProps {
  position?: [number, number]
  draggable?: boolean
  eventHandlers?: { dragend?: (event: { target: { getLatLng: () => { lat: number; lng: number } } }) => void }
}

export function Marker({ position, draggable, eventHandlers }: MarkerProps) {
  return (
    <div data-testid="location-marker" data-lat={position?.[0]} data-lng={position?.[1]}>
      {draggable && (
        <button
          type="button"
          onClick={() => eventHandlers?.dragend?.({ target: { getLatLng: () => MOCK_DRAG_LATLNG } })}
        >
          Simulate marker drag
        </button>
      )}
    </div>
  )
}

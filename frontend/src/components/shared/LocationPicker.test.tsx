import '@/i18n'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import type { LocationValue } from '@/types/location'
import { LocationPicker } from './LocationPicker'

vi.mock('react-leaflet', () => import('@/test/mocks/reactLeaflet'))

vi.mock('@/lib/geoapify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/geoapify')>()
  return {
    ...actual,
    searchPlaces: vi.fn(),
    reverseGeocode: vi.fn(),
  }
})

const { searchPlaces, reverseGeocode } = await import('@/lib/geoapify')
const mockedSearchPlaces = vi.mocked(searchPlaces)
const mockedReverseGeocode = vi.mocked(reverseGeocode)

const SAVED_VALUE: LocationValue = {
  address: 'Koteshwor, Kathmandu',
  latitude: 27.6778,
  longitude: 85.3488,
  placeId: 'saved-place',
}

function Harness({ initialValue = null }: { initialValue?: LocationValue | null }) {
  const [value, setValue] = useState<LocationValue | null>(initialValue)
  return (
    <LocationPicker
      value={value}
      onChange={setValue}
      label="Your usual work location"
      description="Used to find nearby opportunities."
    />
  )
}

describe('LocationPicker', () => {
  beforeEach(() => {
    mockedSearchPlaces.mockReset()
    mockedReverseGeocode.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('renders with no initial value', () => {
    render(<Harness />)

    expect(screen.getByText(/no location selected yet/i)).toBeInTheDocument()
    expect(screen.queryByText('Location selected.')).not.toBeInTheDocument()
  })

  it('renders an existing saved location without triggering reverse geocoding', async () => {
    render(<Harness initialValue={SAVED_VALUE} />)

    expect(screen.getByText('Koteshwor, Kathmandu')).toBeInTheDocument()
    expect(screen.getByText('27.677800', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('85.348800', { exact: false })).toBeInTheDocument()

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(mockedReverseGeocode).not.toHaveBeenCalled()
  })

  it('debounces search and requires at least 3 characters', async () => {
    mockedSearchPlaces.mockResolvedValue([])
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(screen.getByLabelText('Search an area, landmark or address'), 'ba')
    await new Promise((resolve) => setTimeout(resolve, 450))
    expect(mockedSearchPlaces).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Search an area, landmark or address'), 'n')
    expect(mockedSearchPlaces).not.toHaveBeenCalled()

    await waitFor(() => expect(mockedSearchPlaces).toHaveBeenCalledTimes(1), { timeout: 1000 })
    expect(mockedSearchPlaces).toHaveBeenCalledWith('ban', expect.objectContaining({ signal: expect.anything() }))
  })

  it('shows results and lets the user pick one, updating address/lat/lon together', async () => {
    mockedSearchPlaces.mockResolvedValue([
      {
        placeId: 'p1',
        primaryLabel: 'Baneshwor',
        secondaryLabel: 'Kathmandu, Bagmati, Nepal',
        formatted: 'Baneshwor, Kathmandu, Nepal',
        latitude: 27.6938,
        longitude: 85.3355,
      },
    ])
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(screen.getByLabelText('Search an area, landmark or address'), 'baneshwor')
    const option = await screen.findByRole('button', { name: /baneshwor/i })
    await user.click(option)

    expect(await screen.findByText('Baneshwor, Kathmandu, Nepal')).toBeInTheDocument()
    expect(screen.getByText('27.693800', { exact: false })).toBeInTheDocument()
    expect(mockedReverseGeocode).not.toHaveBeenCalled()
  })

  it('cancels a stale search so an earlier, slower response cannot overwrite a later one', async () => {
    let resolveFirst!: (value: Awaited<ReturnType<typeof searchPlaces>>) => void
    const firstCall = new Promise<Awaited<ReturnType<typeof searchPlaces>>>((resolve) => {
      resolveFirst = resolve
    })

    mockedSearchPlaces
      .mockImplementationOnce(() => firstCall)
      .mockImplementationOnce(async () => [
        {
          placeId: 'p2',
          primaryLabel: 'Patan',
          secondaryLabel: 'Lalitpur, Bagmati, Nepal',
          formatted: 'Patan, Lalitpur, Nepal',
          latitude: 27.6726,
          longitude: 85.3247,
        },
      ])

    const user = userEvent.setup()
    render(<Harness />)

    const input = screen.getByLabelText('Search an area, landmark or address')
    await user.type(input, 'first')
    await waitFor(() => expect(mockedSearchPlaces).toHaveBeenCalledTimes(1), { timeout: 1000 })

    await user.clear(input)
    await user.type(input, 'second')
    await waitFor(() => expect(mockedSearchPlaces).toHaveBeenCalledTimes(2), { timeout: 1000 })

    expect(await screen.findByRole('button', { name: /patan/i })).toBeInTheDocument()

    // The slow first request resolving afterwards must not clobber the
    // already-displayed second result.
    resolveFirst([
      {
        placeId: 'p1',
        primaryLabel: 'Should Not Appear',
        secondaryLabel: '',
        formatted: 'Should Not Appear',
        latitude: 1,
        longitude: 1,
      },
    ])
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByRole('button', { name: /should not appear/i })).not.toBeInTheDocument()
  })

  it('places a marker and resolves an address on map click', async () => {
    // Held open with a manually-resolved promise (rather than a fixed
    // delay) so the transient "Finding address…" state is deterministic
    // to observe regardless of CPU contention when the whole suite runs
    // in parallel.
    let resolveReverseGeocode!: (formatted: string) => void
    mockedReverseGeocode.mockImplementation(
      () => new Promise((resolve) => { resolveReverseGeocode = resolve }),
    )
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Simulate map click' }))

    expect(await screen.findByText('Finding address…')).toBeInTheDocument()
    resolveReverseGeocode('Selected Street, Kathmandu')
    expect(await screen.findByText('Selected Street, Kathmandu')).toBeInTheDocument()
    expect(mockedReverseGeocode).toHaveBeenCalledWith(27.7005, 85.301, expect.objectContaining({ signal: expect.anything() }))
  })

  it('keeps coordinates and falls back to a plain label when reverse geocoding fails', async () => {
    mockedReverseGeocode.mockRejectedValue(new Error('boom'))
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Simulate map click' }))

    expect(await screen.findByText('Selected map location')).toBeInTheDocument()
    expect(screen.getByText('27.700500', { exact: false })).toBeInTheDocument()
    expect(screen.getByText(/couldn.t look up an address/i)).toBeInTheDocument()
  })

  it('updates coordinates only on marker dragend', async () => {
    mockedReverseGeocode.mockResolvedValue('Dragged To Street, Kathmandu')
    const user = userEvent.setup()
    render(<Harness initialValue={SAVED_VALUE} />)

    await user.click(screen.getByRole('button', { name: 'Simulate marker drag' }))

    expect(await screen.findByText('Dragged To Street, Kathmandu')).toBeInTheDocument()
    expect(screen.getByText('27.710000', { exact: false })).toBeInTheDocument()
  })

  it('uses current location successfully, resolving the address', async () => {
    mockedReverseGeocode.mockResolvedValue('My Current Street, Kathmandu')
    const getCurrentPosition = vi.fn((success) => {
      success({ coords: { latitude: 27.71, longitude: 85.32, accuracy: 25 } })
    })
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } })

    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Use my current location' }))

    expect(await screen.findByText('My Current Street, Kathmandu')).toBeInTheDocument()
    expect(screen.getByText(/within approximately 25 metres/i)).toBeInTheDocument()
  })

  it('shows a friendly message and stays usable when location permission is denied', async () => {
    const getCurrentPosition = vi.fn((_success, failure) => {
      failure({ code: 1, PERMISSION_DENIED: 1 })
    })
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } })

    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Use my current location' }))

    expect(await screen.findByText(/location permission was denied/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Search an area, landmark or address')).not.toBeDisabled()
  })

  it('clears a selected location', async () => {
    const user = userEvent.setup()
    render(<Harness initialValue={SAVED_VALUE} />)

    await user.click(screen.getByRole('button', { name: /clear location/i }))

    expect(screen.getByText(/no location selected yet/i)).toBeInTheDocument()
  })

  it('degrades gracefully with no Geoapify API key: search hidden, map/current-location still usable', async () => {
    vi.stubEnv('VITE_GEOAPIFY_API_KEY', '')

    render(<Harness />)

    expect(screen.queryByLabelText('Search an area, landmark or address')).not.toBeInTheDocument()
    expect(screen.getByText(/search is unavailable right now/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use my current location' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Simulate map click' })).toBeInTheDocument()
  })

  it('has no automatically-detectable accessibility violations', async () => {
    const { container } = render(<Harness initialValue={SAVED_VALUE} />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

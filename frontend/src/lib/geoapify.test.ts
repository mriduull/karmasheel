import { afterEach, describe, expect, it, vi } from 'vitest'
import { GeoapifyError, isGeoapifyConfigured, reverseGeocode, searchPlaces, toFriendlyGeoapifyMessage } from './geoapify'

describe('geoapify client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  describe('isGeoapifyConfigured', () => {
    it('is true when the test environment key is set', () => {
      expect(isGeoapifyConfigured()).toBe(true)
    })

    it('is false when the key is empty', () => {
      vi.stubEnv('VITE_GEOAPIFY_API_KEY', '')
      expect(isGeoapifyConfigured()).toBe(false)
    })
  })

  describe('searchPlaces', () => {
    it('returns [] without making a request for fewer than 3 characters', async () => {
      const fetchSpy = vi.fn()
      vi.stubGlobal('fetch', fetchSpy)

      const results = await searchPlaces('ba', { signal: new AbortController().signal })

      expect(results).toEqual([])
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('restricts to Nepal and limits to 5 results', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [] }),
      })
      vi.stubGlobal('fetch', fetchSpy)

      await searchPlaces('baneshwor kathmandu', { signal: new AbortController().signal })

      const requestedUrl = new URL(fetchSpy.mock.calls[0][0] as string)
      expect(requestedUrl.searchParams.get('filter')).toBe('countrycode:np')
      expect(requestedUrl.searchParams.get('limit')).toBe('5')
      expect(requestedUrl.searchParams.get('text')).toBe('baneshwor kathmandu')
    })

    it('maps a successful response to LocationSearchResult[]', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            {
              place_id: 'abc123',
              name: 'Baneshwor',
              city: 'Kathmandu',
              state: 'Bagmati Province',
              country: 'Nepal',
              formatted: 'Baneshwor, Kathmandu 44600, Nepal',
              lat: 27.6938,
              lon: 85.3355,
            },
          ],
        }),
      })
      vi.stubGlobal('fetch', fetchSpy)

      const results = await searchPlaces('baneshwor', { signal: new AbortController().signal })

      expect(results).toEqual([
        {
          placeId: 'abc123',
          primaryLabel: 'Baneshwor',
          secondaryLabel: 'Kathmandu, Bagmati Province, Nepal',
          formatted: 'Baneshwor, Kathmandu 44600, Nepal',
          latitude: 27.6938,
          longitude: 85.3355,
        },
      ])
    })

    // Each test below uses a query/coordinate pair not used elsewhere in
    // this file — `searchPlaces`/`reverseGeocode` cache successful
    // results in-memory for the session (see src/lib/geoapify.ts), so
    // reusing a query would silently serve a previous test's cached
    // result instead of exercising the new mocked `fetch`.

    it('throws a missing_key GeoapifyError when no API key is configured', async () => {
      vi.stubEnv('VITE_GEOAPIFY_API_KEY', '')
      const fetchSpy = vi.fn()
      vi.stubGlobal('fetch', fetchSpy)

      await expect(searchPlaces('missing key query', { signal: new AbortController().signal })).rejects.toMatchObject(
        { kind: 'missing_key' },
      )
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('classifies a 429 response as a quota error', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) }),
      )

      await expect(searchPlaces('quota error query', { signal: new AbortController().signal })).rejects.toMatchObject(
        { kind: 'quota' },
      )
    })

    it('classifies a network failure distinctly from an abort', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
      )

      await expect(
        searchPlaces('network failure query', { signal: new AbortController().signal }),
      ).rejects.toMatchObject({ kind: 'network' })
    })

    it('lets an aborted request reject with AbortError rather than a GeoapifyError', async () => {
      const controller = new AbortController()
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(() => {
          controller.abort()
          return Promise.reject(new DOMException('Aborted', 'AbortError'))
        }),
      )

      await expect(searchPlaces('aborted query', { signal: controller.signal })).rejects.toMatchObject({
        name: 'AbortError',
      })
    })
  })

  describe('reverseGeocode', () => {
    it('returns the formatted address for a successful lookup', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ results: [{ formatted: 'Baneshwor, Kathmandu, Nepal' }] }),
        }),
      )

      const formatted = await reverseGeocode(27.6938, 85.3355, { signal: new AbortController().signal })
      expect(formatted).toBe('Baneshwor, Kathmandu, Nepal')
    })

    it('throws when no result has a formatted address', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) }))

      await expect(
        reverseGeocode(28.1, 84.2, { signal: new AbortController().signal }),
      ).rejects.toBeInstanceOf(GeoapifyError)
    })
  })

  describe('toFriendlyGeoapifyMessage', () => {
    it('never leaks the raw error for any known kind', () => {
      const kinds: Array<ConstructorParameters<typeof GeoapifyError>[0]> = [
        'missing_key',
        'network',
        'quota',
        'auth',
        'invalid_response',
        'unknown',
      ]
      for (const kind of kinds) {
        const message = toFriendlyGeoapifyMessage(new GeoapifyError(kind, 'raw internal detail'))
        expect(message).not.toContain('raw internal detail')
      }
    })
  })
})

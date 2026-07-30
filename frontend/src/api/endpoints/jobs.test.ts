import { describe, expect, it } from 'vitest'
import { buildJobBrowseSearchParams } from './jobs'

describe('buildJobBrowseSearchParams', () => {
  it('builds an empty query string with no filters', () => {
    expect(buildJobBrowseSearchParams({}).toString()).toBe('')
  })

  it('maps category/subcategory/workType to the backend query param names', () => {
    const params = buildJobBrowseSearchParams({ category: 1, subcategory: 2, workType: 'CONTRACT' })

    expect(params.get('category')).toBe('1')
    expect(params.get('subcategory')).toBe('2')
    expect(params.get('work_type')).toBe('CONTRACT')
  })

  it('never sends latitude/longitude alone — the backend 400s otherwise', () => {
    const params = buildJobBrowseSearchParams({ latitude: 27.7, maxDistanceKm: 10 })

    expect(params.has('latitude')).toBe(false)
    expect(params.has('longitude')).toBe(false)
    expect(params.has('max_distance_km')).toBe(false)
  })

  it('sends latitude and longitude together', () => {
    const params = buildJobBrowseSearchParams({ latitude: 27.7, longitude: 85.3 })

    expect(params.get('latitude')).toBe('27.7')
    expect(params.get('longitude')).toBe('85.3')
    expect(params.has('max_distance_km')).toBe(false)
  })

  it('only sends max_distance_km alongside a coordinate pair', () => {
    const params = buildJobBrowseSearchParams({
      latitude: 27.7,
      longitude: 85.3,
      maxDistanceKm: 20,
    })

    expect(params.get('latitude')).toBe('27.7')
    expect(params.get('longitude')).toBe('85.3')
    expect(params.get('max_distance_km')).toBe('20')
  })

  it('drops max_distance_km entirely when no coordinates are supplied, even if given', () => {
    const params = buildJobBrowseSearchParams({ maxDistanceKm: 20 })
    expect(params.toString()).toBe('')
  })
})

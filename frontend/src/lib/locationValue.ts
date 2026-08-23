import type { LocationValue } from '@/types/location'

interface ProfileLocationFields {
  address: string
  latitude: string | null
  longitude: string | null
}

/**
 * Derives the single `LocationValue` a `LocationPicker` renders from a
 * Worker/Employer profile or JobPost API response. `null` when either
 * coordinate is missing — a lone `address` string with no coordinates
 * (only possible on data saved before this feature existed) is not
 * treated as a pickable location, but callers must still avoid
 * overwriting it on an untouched save (see `pages/worker/Profile.tsx`'s
 * dirty-tracking).
 */
export function locationValueFromProfile(profile: ProfileLocationFields): LocationValue | null {
  if (profile.latitude === null || profile.longitude === null) return null
  return {
    address: profile.address,
    latitude: Number(profile.latitude),
    longitude: Number(profile.longitude),
    placeId: null,
  }
}

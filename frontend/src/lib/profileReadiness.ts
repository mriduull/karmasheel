import type { WorkerProfile } from '@/types/profile'

export interface ProfileReadiness {
  isReady: boolean
  missingRequired: string[]
  suggestions: string[]
}

/**
 * Frontend-only heuristic — the backend has no "completeness score" or
 * readiness field anywhere in `WorkerProfileSerializer`. A profile is
 * considered ready to show employers once it has an address and at
 * least one standardized skill; location and expected wage are called
 * out as optional improvements, never as blockers.
 */
export function computeProfileReadiness(profile: WorkerProfile): ProfileReadiness {
  const missingRequired: string[] = []
  const suggestions: string[] = []

  if (!profile.address.trim()) missingRequired.push('your address')
  if (profile.skills.length === 0) missingRequired.push('at least one skill')

  if (profile.latitude === null || profile.longitude === null) {
    suggestions.push('your location, so distance-based matching can work')
  }
  if (profile.expected_wage === null) {
    suggestions.push('your expected wage')
  }

  return { isReady: missingRequired.length === 0, missingRequired, suggestions }
}

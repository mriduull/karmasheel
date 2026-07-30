import { Link } from 'react-router-dom'
import { computeProfileReadiness } from '@/lib/profileReadiness'
import type { WorkerProfile } from '@/types/profile'

export function ProfileReadinessBanner({ profile }: { profile: WorkerProfile }) {
  const readiness = computeProfileReadiness(profile)

  if (readiness.isReady) {
    return (
      <div role="status" className="rounded-md bg-success-bg p-4 text-success-text">
        <p className="font-semibold">Your profile is ready to show employers.</p>
        {readiness.suggestions.length > 0 && (
          <p className="mt-1 text-sm">
            Add {readiness.suggestions.join(' and ')} to improve your matches.{' '}
            <Link to="/worker/profile" className="font-semibold underline">
              Update profile
            </Link>
          </p>
        )}
      </div>
    )
  }

  return (
    <div role="status" className="rounded-md bg-warning-bg p-4 text-warning-text">
      <p className="font-semibold">Add a few more details to get better matches.</p>
      <p className="mt-1 text-sm">
        Still needed: {readiness.missingRequired.join(', ')}.{' '}
        <Link to="/worker/profile" className="font-semibold underline">
          Complete your profile
        </Link>
      </p>
    </div>
  )
}

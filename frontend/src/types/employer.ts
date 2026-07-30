/**
 * profiles/serializers.py:EmployerProfileSerializer — response shape from
 * `GET`/`PATCH /api/profiles/employer/me/`. `verification_status` is
 * read-only here — there is no request field that changes it; only a
 * Django admin can (backend/profiles/admin.py), confirmed by
 * `read_only_fields = ("id", "verification_status", "created_at", "updated_at")`.
 */
export interface EmployerProfile {
  id: number
  organization_name: string
  address: string
  latitude: string | null
  longitude: string | null
  pan_vat_number: string
  verification_status: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED'
  created_at: string
  updated_at: string
}

/**
 * Request body for `PATCH /api/profiles/employer/me/` — a true partial
 * update, same pattern as the Worker profile. `verification_status` is
 * deliberately absent — it is not a writable field.
 */
export interface EmployerProfileUpdatePayload {
  organization_name?: string
  address?: string
  latitude?: number | null
  longitude?: number | null
  pan_vat_number?: string
}

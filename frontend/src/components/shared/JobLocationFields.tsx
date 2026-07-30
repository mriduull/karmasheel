import { useEffect } from 'react'
import type { FieldErrors, UseFormRegister, UseFormSetValue } from 'react-hook-form'
import { LocateFixed } from 'lucide-react'
import { useGeolocation } from '@/lib/useGeolocation'
import { TextField } from '@/components/primitives/TextField'
import { Button } from '@/components/primitives/Button'
import type { JobFormValues } from '@/validation/job'

/**
 * Typed against the full `JobFormValues` (not the narrower
 * `JobLocationFormValues`) even though this component only touches
 * `address`/`latitude`/`longitude` — it's only ever used inside
 * `JobForm`'s single combined `useForm<JobFormValues>`, and RHF's
 * `UseFormSetValue`/`UseFormRegister` generics don't structurally widen
 * from a superset form to a subset-typed prop.
 */
interface JobLocationFieldsProps {
  register: UseFormRegister<JobFormValues>
  errors: FieldErrors<JobFormValues>
  setValue: UseFormSetValue<JobFormValues>
}

/**
 * Distinct from `CoordinateCapture` (Worker/Employer profile location,
 * F2): `JobPost.address`/`latitude`/`longitude` are all REQUIRED fields
 * (no `blank=True`/`null=True` on any of the three), unlike the optional
 * profile ones — so this offers "Use my location" as a convenience that
 * fills the two number fields, but always keeps them directly editable
 * as a required fallback when geolocation is denied/unavailable. Never
 * geocodes the address text into coordinates.
 */
export function JobLocationFields({ register, errors, setValue }: JobLocationFieldsProps) {
  const geolocation = useGeolocation()

  useEffect(() => {
    if (geolocation.status === 'success' && geolocation.latitude !== null && geolocation.longitude !== null) {
      setValue('latitude', String(geolocation.latitude), { shouldValidate: true })
      setValue('longitude', String(geolocation.longitude), { shouldValidate: true })
    }
    // Only re-run when the capture itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geolocation.status, geolocation.latitude, geolocation.longitude])

  return (
    <div className="flex flex-col gap-4">
      <TextField label="Address" error={errors.address?.message} {...register('address')} />

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={geolocation.request}
          isLoading={geolocation.status === 'loading'}
          className="self-start"
        >
          <LocateFixed size={18} aria-hidden="true" />
          Use my location to fill coordinates
        </Button>
        {geolocation.status === 'denied' && (
          <p className="text-sm text-text-secondary">
            Location permission was declined — enter latitude and longitude manually below.
          </p>
        )}
        {geolocation.status === 'error' && (
          <p className="text-sm text-text-secondary">
            We couldn't get your location — enter latitude and longitude manually below.
          </p>
        )}
        {geolocation.status === 'unsupported' && (
          <p className="text-sm text-text-secondary">
            Your browser doesn't support location — enter latitude and longitude manually below.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="Latitude"
          inputMode="decimal"
          hint="Required — e.g. 27.7172"
          error={errors.latitude?.message}
          {...register('latitude')}
        />
        <TextField
          label="Longitude"
          inputMode="decimal"
          hint="Required — e.g. 85.3240"
          error={errors.longitude?.message}
          {...register('longitude')}
        />
      </div>
    </div>
  )
}

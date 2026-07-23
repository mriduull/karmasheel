import type { WorkType } from '@/types/job'
import { formatWorkType } from '@/lib/formatters'

interface WorkTypeSelectProps {
  value: WorkType | null
  onChange: (workType: WorkType | null) => void
}

/** `jobs/models.py:JobPost.WorkType` choices — a fixed, small enum, so no
 * API call is needed to populate this control. */
const WORK_TYPES: WorkType[] = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'ONE_TIME']

export function WorkTypeSelect({ value, onChange }: WorkTypeSelectProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="job-filter-work-type" className="text-base font-semibold text-text-primary">
        Work type
      </label>
      <select
        id="job-filter-work-type"
        className="min-h-touch rounded-sm border border-text-secondary/30 bg-surface px-3 text-base text-text-primary focus:border-brand-primary"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value ? (event.target.value as WorkType) : null)}
      >
        <option value="">Any work type</option>
        {WORK_TYPES.map((workType) => (
          <option key={workType} value={workType}>
            {formatWorkType(workType)}
          </option>
        ))}
      </select>
    </div>
  )
}

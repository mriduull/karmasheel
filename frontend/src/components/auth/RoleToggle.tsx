import { Briefcase, HardHat } from 'lucide-react'
import type { Role } from '@/types/user'

interface RoleToggleProps {
  value: Role
  onChange: (role: Role) => void
  label: string
}

const OPTIONS: { role: Role; label: string; icon: typeof HardHat }[] = [
  { role: 'WORKER', label: 'Worker', icon: HardHat },
  { role: 'EMPLOYER', label: 'Employer', icon: Briefcase },
]

/** Prominent Worker/Employer selector — a real radiogroup (keyboard- and
 * screen-reader-accessible), styled as two large segmented buttons. */
export function RoleToggle({ value, onChange, label }: RoleToggleProps) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-3">
      {OPTIONS.map(({ role, label: optionLabel, icon: Icon }) => {
        const isSelected = value === role

        return (
          <button
            key={role}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(role)}
            className={`flex min-h-touch flex-col items-center gap-2 rounded-md border-2 px-4 py-4 text-base font-semibold transition-colors ${
              isSelected
                ? 'border-brand-primary bg-surface-muted text-brand-primary'
                : 'border-text-secondary/20 text-text-primary hover:bg-surface-muted'
            }`}
          >
            <Icon size={28} aria-hidden="true" />
            {optionLabel}
          </button>
        )
      })}
    </div>
  )
}

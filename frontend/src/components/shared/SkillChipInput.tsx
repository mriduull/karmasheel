import { useId, useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { skillPhraseSchema } from '@/validation/workerProfile'
import { Button } from '@/components/primitives/Button'

interface SkillChipInputProps {
  label: string
  hint?: string
  value: string[]
  onChange: (next: string[]) => void
}

/**
 * Free-text skill entry, one phrase at a time, as removable chips —
 * `skill_input` (`profiles/serializers.py:WorkerProfileSerializer`)
 * accepts English or Romanized-Nepali phrases, resolved server-side on
 * save (never validated as a "real" skill client-side, since there is no
 * alias-list endpoint to check against).
 */
export function SkillChipInput({ label, hint, value, onChange }: SkillChipInputProps) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputId = useId()
  const errorId = `${inputId}-error`
  const hintId = hint ? `${inputId}-hint` : undefined

  const addDraft = () => {
    const result = skillPhraseSchema.safeParse(draft)

    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Enter a skill.')
      return
    }

    if (value.some((existing) => existing.toLowerCase() === result.data.toLowerCase())) {
      setError('You already added that skill.')
      return
    }

    onChange([...value, result.data])
    setDraft('')
    setError(null)
  }

  const removeAt = (index: number) => {
    onChange(value.filter((_, i) => i !== index))
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      addDraft()
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-base font-semibold text-text-primary">
        {label}
      </label>
      {hint && (
        <span id={hintId} className="text-sm text-text-secondary">
          {hint}
        </span>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={inputId}
          type="text"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
            if (error) setError(null)
          }}
          onKeyDown={handleKeyDown}
          aria-describedby={[hintId, error ? errorId : null].filter(Boolean).join(' ') || undefined}
          aria-invalid={Boolean(error)}
          placeholder="e.g. House Wiring, ghar wiring"
          className="min-h-touch flex-1 rounded-sm border border-text-secondary/30 bg-surface px-3 text-base text-text-primary focus:border-brand-primary"
        />
        <Button type="button" variant="secondary" onClick={addDraft}>
          Add
        </Button>
      </div>

      {error && (
        <span id={errorId} role="alert" className="text-sm font-medium text-danger-text">
          {error}
        </span>
      )}

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((skill, index) => (
            <li key={skill} className="flex items-center gap-1 rounded-sm bg-surface-muted px-2 py-1">
              <span className="text-sm text-text-primary">{skill}</span>
              <button
                type="button"
                onClick={() => removeAt(index)}
                aria-label={`Remove ${skill}`}
                className="flex min-h-touch min-w-touch items-center justify-center rounded-sm text-text-secondary hover:text-danger-text"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

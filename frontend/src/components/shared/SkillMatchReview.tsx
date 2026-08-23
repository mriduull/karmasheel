import { useId, useRef, useState } from 'react'
import type { WorkerSkillMatch } from '@/types/profile'
import type { SkillTagSummary } from '@/types/skill'
import { Button } from '@/components/primitives/Button'
import { ManualSkillPicker } from './ManualSkillPicker'

interface SkillMatchReviewProps {
  match: WorkerSkillMatch
  onAccept: () => void
  onChoose: (skill: SkillTagSummary) => void
  onRequestReview: () => void
}

export function SkillMatchReview({
  match,
  onAccept,
  onChoose,
  onRequestReview,
}: SkillMatchReviewProps) {
  const [showManualPicker, setShowManualPicker] = useState(false)
  const manualPickerId = useId()
  const manualPickerToggleRef = useRef<HTMLButtonElement>(null)
  const matchedSkill = match.matched_skill

  if (!matchedSkill) return null

  const alternatives = match.suggestions.filter((skill) => skill.id !== matchedSkill.id)
  const confidence = Math.round(match.confidence)

  return (
    <section
      aria-label={`Review match for ${match.input_term}`}
      className="flex flex-col gap-3 rounded-md bg-neutral-status-bg p-4 text-neutral-status-text"
    >
      <div>
        <h3 className="text-base font-semibold">Check this automatic match</h3>
        <p className="mt-1 text-sm">
          &ldquo;{match.input_term}&rdquo; was matched to{' '}
          <strong>{matchedSkill.name}</strong>
          {match.method === 'fuzzy' ? ` (${confidence}% match)` : ''}.
        </p>
      </div>

      {alternatives.length > 0 && (
        <div>
          <p className="text-sm font-semibold">Similar skills</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {alternatives.map((skill) => (
              <Button
                key={skill.id}
                type="button"
                variant="secondary"
                onClick={() => onChoose(skill)}
              >
                {skill.name} ({Math.round(skill.confidence)}%)
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={onAccept}>
          Keep this match
        </Button>
        <Button
          ref={manualPickerToggleRef}
          type="button"
          variant="secondary"
          aria-expanded={showManualPicker}
          aria-controls={manualPickerId}
          onClick={() => setShowManualPicker((current) => !current)}
        >
          Choose another skill
        </Button>
        <Button type="button" variant="secondary" onClick={onRequestReview}>
          Remove this match and send original for review
        </Button>
      </div>

      {showManualPicker && (
        <ManualSkillPicker
          id={manualPickerId}
          onSelect={onChoose}
          onCancel={() => {
            setShowManualPicker(false)
            manualPickerToggleRef.current?.focus()
          }}
        />
      )}
    </section>
  )
}

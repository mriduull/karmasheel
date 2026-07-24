import { CheckCircle2 } from 'lucide-react'

interface ReasonsListProps {
  reasons: string[]
}

/** `reasons` are already plain-language sentences from the backend
 * (recommendations/services.py:_build_reasons_and_warnings) — rendered
 * verbatim, never re-derived or paraphrased. Green, visually distinct from
 * `WarningsList`. */
export function ReasonsList({ reasons }: ReasonsListProps) {
  if (reasons.length === 0) return null

  return (
    <ul className="flex flex-col gap-1">
      {reasons.map((reason) => (
        <li key={reason} className="flex items-start gap-2 text-sm text-success-text">
          <CheckCircle2 size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>{reason}</span>
        </li>
      ))}
    </ul>
  )
}

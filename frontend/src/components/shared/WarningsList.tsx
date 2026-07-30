import { AlertTriangle } from 'lucide-react'

interface WarningsListProps {
  warnings: string[]
}

/** `warnings` are already plain-language sentences from the backend
 * (e.g. "Worker location is unavailable; distance could not be
 * calculated.") — rendered verbatim. Amber, visually distinct from
 * `ReasonsList`. */
export function WarningsList({ warnings }: WarningsListProps) {
  if (warnings.length === 0) return null

  return (
    <ul className="flex flex-col gap-1">
      {warnings.map((warning) => (
        <li key={warning} className="flex items-start gap-2 text-sm text-warning-text">
          <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>{warning}</span>
        </li>
      ))}
    </ul>
  )
}

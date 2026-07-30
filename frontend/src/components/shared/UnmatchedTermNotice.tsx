interface UnmatchedTermNoticeProps {
  terms: string[]
}

/**
 * Surfaces `unmatched_terms` from the last save response — phrases the
 * skill-normalization service couldn't confidently match, stored for
 * admin review rather than silently dropped
 * (`taxonomy/services.py:normalize_skill_phrases`). Never hidden.
 */
export function UnmatchedTermNotice({ terms }: UnmatchedTermNoticeProps) {
  if (terms.length === 0) return null

  return (
    <div role="status" className="rounded-md bg-warning-bg p-3 text-warning-text">
      <p className="text-sm font-semibold">
        We couldn't confidently match {terms.length === 1 ? 'this skill' : 'these skills'}:
      </p>
      <ul className="mt-1 list-inside list-disc text-sm">
        {terms.map((term) => (
          <li key={term}>{term}</li>
        ))}
      </ul>
      <p className="mt-1 text-sm">Our team will review it and it may appear as a matched skill soon.</p>
    </div>
  )
}

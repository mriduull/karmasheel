import type { JobTaxonomyMatchedTerm } from '@/types/taxonomy'

interface JobSkillInferenceResultsProps {
  matches: JobTaxonomyMatchedTerm[]
  selectedSubcategoryId: number | null
  onConfirmSuggestion?: (match: JobTaxonomyMatchedTerm) => void
}

export function JobSkillInferenceResults({ matches, selectedSubcategoryId, onConfirmSuggestion }: JobSkillInferenceResultsProps) {
  if (matches.length === 0) return null

  return (
    <div className="flex flex-col gap-2" aria-label="Recognized skills">
      {matches.map((match) => {
        const alternatives = match.suggestions.filter((suggestion) => suggestion.id !== match.skill_id)
        const differsFromSelected = selectedSubcategoryId !== null && match.subcategory !== selectedSubcategoryId

        return (
          <details
            key={`${match.source}-${match.term}-${match.skill_id}`}
            className="rounded-md border border-success-text/20 bg-success-bg p-3 text-success-text"
          >
            <summary className="cursor-pointer font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary">
              {!match.is_confident_match && 'Possible match: '}{match.skill_name}
              <span className="ml-2 text-sm font-normal">Click to see how this was matched</span>
            </summary>
            <div className="mt-3 flex flex-col gap-2 text-sm">
              <p>
                You entered <strong>&ldquo;{match.term}&rdquo;</strong>. It mapped to{' '}
                <strong>{match.skill_name}</strong> with {Math.round(match.confidence)}% confidence
                {match.method === 'exact_alias' ? ' using a saved alias' : match.method === 'fuzzy' ? ' using typo-tolerant matching' : ''}.
              </p>
              {!match.is_confident_match && onConfirmSuggestion && (
                <button
                  type="button"
                  className="min-h-touch self-start rounded-sm bg-brand-primary px-4 font-semibold text-white hover:bg-brand-primary-hover"
                  onClick={() => onConfirmSuggestion(match)}
                >
                  Use {match.skill_name}
                </button>
              )}
              <p>
                Taxonomy: <strong>{match.category_name} — {match.subcategory_name}</strong>
              </p>
              {differsFromSelected && (
                <p role="status" className="font-medium text-warning-text">
                  This skill belongs to a different subcategory than the one currently selected for the job.
                </p>
              )}
              {alternatives.length > 0 && (
                <div>
                  <p className="font-semibold">Other suggestions</p>
                  <ul className="mt-1 flex flex-wrap gap-2">
                    {alternatives.map((suggestion) => (
                      <li key={suggestion.id} className="rounded-full bg-surface px-3 py-1 text-text-primary">
                        {suggestion.name} ({Math.round(suggestion.confidence)}%)
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </details>
        )
      })}
    </div>
  )
}

import { useQuery } from '@tanstack/react-query'
import { fetchOpportunityAdvisory } from '@/api/endpoints/recommendations'

export const OPPORTUNITY_ADVISORY_QUERY_KEY = ['recommendations', 'opportunities'] as const

export function useOpportunityAdvisory() {
  return useQuery({
    queryKey: OPPORTUNITY_ADVISORY_QUERY_KEY,
    queryFn: fetchOpportunityAdvisory,
  })
}

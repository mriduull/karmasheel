/**
 * profiles/serializers.py:SkillTagSummarySerializer — reused verbatim by
 * both `WorkerProfileSerializer.skills` and
 * `PublicJobPostSerializer.required_skills`/`preferred_skills`. Note
 * `subcategory` is a plain string here (StringRelatedField), unlike the
 * taxonomy app's own SkillTag shape where `subcategory` is a numeric id.
 */
export interface SkillTagSummary {
  id: number
  name: string
  subcategory: string
}

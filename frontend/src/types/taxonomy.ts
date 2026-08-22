/** taxonomy/serializers.py:CategorySerializer — GET /api/taxonomy/categories/ */
export interface Category {
  id: number
  name: string
}

/** taxonomy/serializers.py:SubcategorySerializer — GET /api/taxonomy/subcategories/?category= */
export interface Subcategory {
  id: number
  name: string
  category: number
}

/** taxonomy/serializers.py:SkillTagTreeSerializer — nested only, inside CategoryTree. */
export interface SkillTagTree {
  id: number
  name: string
}

/** taxonomy/serializers.py:SubcategoryTreeSerializer */
export interface SubcategoryTree {
  id: number
  name: string
  skills: SkillTagTree[]
}

/** taxonomy/serializers.py:CategoryTreeSerializer — GET /api/taxonomy/tree/
 * returns a bare array of these (ListAPIView), not a single object. */
export interface CategoryTree {
  id: number
  name: string
  subcategories: SubcategoryTree[]
}

export interface JobTaxonomyInferenceRequest {
  title: string
  description: string
  required_skills: string[]
  preferred_skills: string[]
}

export interface JobTaxonomyMatchedTerm {
  term: string
  source: 'required_skill' | 'preferred_skill' | 'job_text'
  skill_id: number
  skill_name: string
  subcategory: number
  subcategory_name: string
  category: number
  category_name: string
  confidence: number
}

export interface JobTaxonomyInferenceResult {
  category: number | null
  category_name: string | null
  subcategory: number | null
  subcategory_name: string | null
  matched_terms: JobTaxonomyMatchedTerm[]
  confidence: number
}

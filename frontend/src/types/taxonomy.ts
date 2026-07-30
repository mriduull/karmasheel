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

import type { Category, CategoryTree, Subcategory } from '@/types/taxonomy'
import type { PublicJobPost } from '@/types/job'

export const CATEGORY_FIXTURES: Category[] = [
  { id: 1, name: 'Construction & Repair' },
  { id: 2, name: 'Domestic & Local Services' },
]

export const SUBCATEGORY_FIXTURES: Subcategory[] = [
  { id: 1, name: 'Electrical', category: 1 },
  { id: 2, name: 'Masonry', category: 1 },
  { id: 3, name: 'Cleaning', category: 2 },
]

export const CATEGORY_TREE_FIXTURES: CategoryTree[] = [
  {
    id: 1,
    name: 'Construction & Repair',
    subcategories: [
      { id: 1, name: 'Electrical', skills: [{ id: 2, name: 'House Wiring' }] },
      { id: 2, name: 'Masonry', skills: [{ id: 6, name: 'Tile Installation' }] },
    ],
  },
  {
    id: 2,
    name: 'Domestic & Local Services',
    subcategories: [{ id: 3, name: 'Cleaning', skills: [] }],
  },
]

export function buildJobFixture(overrides: Partial<PublicJobPost> = {}): PublicJobPost {
  return {
    id: 5,
    title: 'House Wiring for New Apartment Block',
    description: 'Complete wiring and breaker installation for a new four-unit apartment block.',
    category: 1,
    category_name: 'Construction & Repair',
    subcategory: 1,
    subcategory_name: 'Electrical',
    employer_name: 'Kathmandu Home Services Pvt. Ltd.',
    employer_verification_status: 'VERIFIED',
    required_skills: [{ id: 2, name: 'House Wiring', subcategory: 'Electrical' }],
    preferred_skills: [{ id: 4, name: 'Electrical Repair', subcategory: 'Electrical' }],
    address: 'Baneshwor, Kathmandu',
    latitude: '27.693800',
    longitude: '85.335500',
    required_experience_years: 3,
    wage_type: 'DAILY',
    wage_amount: '1300.00',
    work_type: 'CONTRACT',
    scheduled_datetime: null,
    duration_days: null,
    number_of_workers_required: 2,
    application_deadline: '2026-08-21T12:00:00Z',
    status: 'ACTIVE',
    created_at: '2026-07-22T12:00:00Z',
    updated_at: '2026-07-22T12:00:00Z',
    ...overrides,
  }
}

import type { Category, CategoryTree, Subcategory } from '@/types/taxonomy'
import type { PublicJobPost } from '@/types/job'
import type { WorkerProfile } from '@/types/profile'
import type { Application } from '@/types/application'

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

export function buildWorkerProfileFixture(overrides: Partial<WorkerProfile> = {}): WorkerProfile {
  return {
    id: 3,
    address: 'Koteshwor, Kathmandu',
    latitude: '27.677800',
    longitude: '85.348800',
    experience_years: 6,
    is_available: true,
    expected_wage: '1200.00',
    preferred_travel_radius_km: 15,
    skills: [{ id: 2, name: 'House Wiring', subcategory: 'Electrical' }],
    unmatched_terms: [],
    created_at: '2026-07-22T12:00:00Z',
    updated_at: '2026-07-22T12:00:00Z',
    ...overrides,
  }
}

export function buildApplicationFixture(overrides: Partial<Application> = {}): Application {
  return {
    id: 8,
    job: 5,
    job_title: 'House Wiring for New Apartment Block',
    worker_username: 'demo_worker_ramesh',
    status: 'APPLIED',
    worker_note: '',
    employer_note: '',
    created_at: '2026-07-22T12:00:00Z',
    updated_at: '2026-07-22T12:00:00Z',
    ...overrides,
  }
}

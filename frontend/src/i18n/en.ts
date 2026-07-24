/**
 * English message catalog. Only English ships in this version — see
 * docs/FRONTEND_IMPLEMENTATION_PLAN.md §3.10. Every frontend-owned string
 * (nav labels, page copy, wrapper text) is a key here, never an inline
 * literal in a component, so a future Nepali catalog is a content
 * addition, not a rewrite.
 *
 * Backend-sourced strings (`reasons`, `warnings`, DRF `detail`/field-error
 * text — see src/api/errors.ts) are NOT routed through this catalog; they
 * are rendered exactly as received from the API.
 */
export const en = {
  brand: {
    name: 'Workforce Match',
  },
  nav: {
    browseJobs: 'Browse Jobs',
    login: 'Log In',
    register: 'Register',
    logout: 'Log out',
    more: 'More',
    bottomNavigation: 'Bottom navigation',
    worker: {
      dashboard: 'Home',
      applications: 'Applications',
      profile: 'Profile',
    },
    employer: {
      dashboard: 'Home',
      myJobs: 'My Jobs',
      profile: 'Profile',
      postAJob: 'Post a Job',
    },
    dashboard: 'Dashboard',
  },
  common: {
    loading: 'Loading…',
    retry: 'Try again',
    backHome: 'Back to Workforce Match',
  },
  notFound: {
    title: 'Page not found',
    body: "We couldn't find the page you're looking for.",
  },
  unauthorized: {
    title: 'Not available',
    genericBody: "You don't have permission to view this page.",
    unverifiedEmployer:
      "Available once your account is verified. An administrator reviews new employer accounts — there's no in-app way to speed this up.",
    rejectedEmployer:
      "Your employer verification wasn't approved, so this isn't available. There's no in-app appeal — contact an administrator through your organization's usual channel if you believe this is a mistake.",
  },
  comingSoon: {
    body: 'This screen is built in {{phase}} of the implementation plan. This route, its guard, and the surrounding navigation are already wired up.',
  },
} as const

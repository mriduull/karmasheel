import { createBrowserRouter } from 'react-router-dom'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { WorkerLayout } from '@/components/layout/WorkerLayout'
import { EmployerLayout } from '@/components/layout/EmployerLayout'
import { PublicOnly, RequireRole, RequireVerifiedEmployer } from '@/routes/guards'
import { Landing } from '@/pages/public/Landing'
import { Login } from '@/pages/public/Login'
import { Register } from '@/pages/public/Register'
import { JobBrowse } from '@/pages/shared/JobBrowse'
import { JobDetail } from '@/pages/shared/JobDetail'
import { NotFound } from '@/pages/shared/NotFound'
import { Unauthorized } from '@/pages/shared/Unauthorized'
import { WorkerDashboard } from '@/pages/worker/Dashboard'
import { WorkerProfile } from '@/pages/worker/Profile'
import { WorkerApplications } from '@/pages/worker/Applications'
import { WorkerRecommendations } from '@/pages/worker/Recommendations'
import { WorkerOpportunities } from '@/pages/worker/Opportunities'
import { WorkerCV } from '@/pages/worker/CV'
import { WorkerRatings } from '@/pages/worker/Ratings'
import { EmployerDashboard } from '@/pages/employer/Dashboard'
import { EmployerJobs } from '@/pages/employer/Jobs'
import { EmployerProfile } from '@/pages/employer/Profile'
import { EmployerJobForm } from '@/pages/employer/JobForm'
import { EmployerJobDetail } from '@/pages/employer/JobDetail'
import { EmployerJobEdit } from '@/pages/employer/JobEdit'
import { EmployerJobApplications } from '@/pages/employer/JobApplications'
import { EmployerCandidates } from '@/pages/employer/Candidates'
import { EmployerRecommendations } from '@/pages/employer/Recommendations'
import { EmployerRatings } from '@/pages/employer/Ratings'

/**
 * Full route tree through Phase F4 (docs/FRONTEND_IMPLEMENTATION_PLAN.md).
 * `/employer/jobs/:id/recommendations` is the only Phase F4 route gated by
 * `RequireVerifiedEmployer` — it mirrors the backend's
 * `IsVerifiedEmployer` gate on `GET /api/recommendations/jobs/<id>/workers/`
 * exactly; `/employer/jobs/:id/candidates` is owner-only at any
 * verification status, matching `JobCandidatesView`'s lack of that gate.
 *
 * No route exists here for password reset, chat, payments, notifications,
 * complaints, maps, a public profile directory, an employer-wide
 * "applicants" list, or Django-admin replication — none of these have a
 * backing endpoint (docs/FRONTEND_CONTEXT.md §13) or were explicitly
 * excluded by the implementation plan's corrections.
 */
/** Exported separately from `router` so tests can build a `createMemoryRouter`
 * from the same route tree without touching real browser history. */
export const routeConfig = [
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: <Landing /> },
      { path: '/jobs', element: <JobBrowse /> },
      { path: '/jobs/:id', element: <JobDetail /> },
      {
        path: '/login',
        element: (
          <PublicOnly>
            <Login />
          </PublicOnly>
        ),
      },
      {
        path: '/register',
        element: (
          <PublicOnly>
            <Register />
          </PublicOnly>
        ),
      },
      { path: '/unauthorized', element: <Unauthorized /> },
    ],
  },
  {
    element: <WorkerLayout />,
    children: [
      {
        path: '/worker',
        element: (
          <RequireRole role="WORKER">
            <WorkerDashboard />
          </RequireRole>
        ),
      },
      {
        path: '/worker/profile',
        element: (
          <RequireRole role="WORKER">
            <WorkerProfile />
          </RequireRole>
        ),
      },
      {
        path: '/worker/applications',
        element: (
          <RequireRole role="WORKER">
            <WorkerApplications />
          </RequireRole>
        ),
      },
      {
        path: '/worker/recommendations',
        element: (
          <RequireRole role="WORKER">
            <WorkerRecommendations />
          </RequireRole>
        ),
      },
      {
        path: '/worker/opportunities',
        element: (
          <RequireRole role="WORKER">
            <WorkerOpportunities />
          </RequireRole>
        ),
      },
      {
        path: '/worker/cv',
        element: (
          <RequireRole role="WORKER">
            <WorkerCV />
          </RequireRole>
        ),
      },
      {
        path: '/worker/ratings',
        element: (
          <RequireRole role="WORKER">
            <WorkerRatings />
          </RequireRole>
        ),
      },
    ],
  },
  {
    element: <EmployerLayout />,
    children: [
      {
        path: '/employer',
        element: (
          <RequireRole role="EMPLOYER">
            <EmployerDashboard />
          </RequireRole>
        ),
      },
      {
        path: '/employer/jobs',
        element: (
          <RequireRole role="EMPLOYER">
            <EmployerJobs />
          </RequireRole>
        ),
      },
      {
        path: '/employer/jobs/new',
        element: (
          <RequireVerifiedEmployer>
            <EmployerJobForm />
          </RequireVerifiedEmployer>
        ),
      },
      {
        path: '/employer/jobs/:id',
        element: (
          <RequireRole role="EMPLOYER">
            <EmployerJobDetail />
          </RequireRole>
        ),
      },
      {
        path: '/employer/jobs/:id/edit',
        element: (
          <RequireRole role="EMPLOYER">
            <EmployerJobEdit />
          </RequireRole>
        ),
      },
      {
        path: '/employer/jobs/:id/applications',
        element: (
          <RequireRole role="EMPLOYER">
            <EmployerJobApplications />
          </RequireRole>
        ),
      },
      {
        path: '/employer/jobs/:id/candidates',
        element: (
          <RequireRole role="EMPLOYER">
            <EmployerCandidates />
          </RequireRole>
        ),
      },
      {
        path: '/employer/jobs/:id/recommendations',
        element: (
          <RequireVerifiedEmployer>
            <EmployerRecommendations />
          </RequireVerifiedEmployer>
        ),
      },
      {
        path: '/employer/profile',
        element: (
          <RequireRole role="EMPLOYER">
            <EmployerProfile />
          </RequireRole>
        ),
      },
      {
        path: '/employer/ratings',
        element: (
          <RequireRole role="EMPLOYER">
            <EmployerRatings />
          </RequireRole>
        ),
      },
    ],
  },
  { path: '*', element: <NotFound /> },
]

export const router = createBrowserRouter(routeConfig)

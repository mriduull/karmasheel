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
import { EmployerDashboard } from '@/pages/employer/Dashboard'
import { EmployerJobs } from '@/pages/employer/Jobs'
import { EmployerProfile } from '@/pages/employer/Profile'
import { EmployerJobForm } from '@/pages/employer/JobForm'
import { EmployerJobDetail } from '@/pages/employer/JobDetail'
import { EmployerJobEdit } from '@/pages/employer/JobEdit'
import { EmployerJobApplications } from '@/pages/employer/JobApplications'

/**
 * Route tree for Phase F0. Every page below `/jobs` and the worker/employer
 * routes is a placeholder (pages/shared/ComingSoon) — the goal of this
 * phase is the routes, guards, and layouts themselves, not the final
 * screens (docs/FRONTEND_IMPLEMENTATION_PLAN.md, Phase F0).
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
        path: '/employer/profile',
        element: (
          <RequireRole role="EMPLOYER">
            <EmployerProfile />
          </RequireRole>
        ),
      },
    ],
  },
  { path: '*', element: <NotFound /> },
]

export const router = createBrowserRouter(routeConfig)

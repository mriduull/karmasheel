import { PageContainer } from '@/components/primitives/PageContainer'
import { JobForm as JobFormComponent } from '@/components/shared/JobForm'

/** `/employer/jobs/new` — reached only by a verified Employer, see
 * routes/guards.tsx:RequireVerifiedEmployer. */
export function EmployerJobForm() {
  return (
    <PageContainer>
      <h1 className="mb-6 text-2xl font-semibold text-text-primary">Post a Job</h1>
      <JobFormComponent mode="create" />
    </PageContainer>
  )
}

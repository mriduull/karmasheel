import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import '@/i18n'
import { queryClient } from '@/lib/queryClient'
import { router } from '@/routes/router'
import { AuthBootstrap } from '@/routes/AuthBootstrap'

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthBootstrap>
        <RouterProvider router={router} />
      </AuthBootstrap>
    </QueryClientProvider>
  )
}

export default App

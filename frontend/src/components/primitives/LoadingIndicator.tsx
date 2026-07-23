interface LoadingIndicatorProps {
  size?: 'sm' | 'md'
  label?: string
}

export function LoadingIndicator({ size = 'md', label = 'Loading' }: LoadingIndicatorProps) {
  const dimension = size === 'sm' ? 'h-4 w-4' : 'h-6 w-6'

  return (
    <span
      role="status"
      aria-label={label}
      className={`inline-block ${dimension} animate-spin rounded-full border-2 border-current border-t-transparent`}
    />
  )
}

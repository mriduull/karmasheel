interface CVPreviewFrameProps {
  html: string
}

/**
 * Renders the backend's returned CV HTML safely in a fully sandboxed
 * iframe (`sandbox=""` — no scripts, no forms, no same-origin access, no
 * top-navigation) via `srcDoc`, never `dangerouslySetInnerHTML`. The CV
 * template is server-generated and deterministic
 * (profiles/services.py:render_worker_cv_html), but this is still
 * untrusted-for-injection HTML from the frontend's perspective, so it is
 * never parsed into the live DOM.
 */
export function CVPreviewFrame({ html }: CVPreviewFrameProps) {
  return (
    <iframe
      title="CV preview"
      srcDoc={html}
      sandbox=""
      className="h-[70vh] w-full rounded-md border border-text-secondary/10 bg-white"
    />
  )
}

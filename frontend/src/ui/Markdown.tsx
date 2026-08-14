import { useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

export function Markdown({ source }: { source: string }) {
  const html = useMemo(() => {
    const raw = marked.parse(source, { async: false, gfm: true, breaks: false })
    return DOMPurify.sanitize(raw)
  }, [source])
  return <div className="md-preview" dangerouslySetInnerHTML={{ __html: html }} />
}

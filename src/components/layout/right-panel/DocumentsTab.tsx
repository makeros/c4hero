import { useCallback, useState } from 'react'
import { ExternalLink, Plus } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspace'
import type { DocLink } from '@/types/model'

// List editor for an element's/relationship's `documents` field, modeled on
// `PropertiesTab` (`RightPanel.tsx`) — add row / remove row, same styling —
// but with two text fields per row (`path`, `title`) instead of one
// key/value pair, plus an open-link button per row that always renders
// (even when `readOnly`), matching the existing `url` open button.
export default function DocumentsTab({ documents, onUpdate }: { documents: DocLink[]; onUpdate: (documents: DocLink[]) => void }) {
  const readOnly = useWorkspaceStore((s) => s.readOnly)
  const [newPath, setNewPath] = useState('')
  const [newTitle, setNewTitle] = useState('')

  const addDocument = useCallback(() => {
    const path = newPath.trim()
    const title = newTitle.trim()
    if (!path || !title) return
    onUpdate([...documents, { path, title }])
    setNewPath('')
    setNewTitle('')
  }, [newPath, newTitle, documents, onUpdate])

  const removeDocument = (index: number) => {
    onUpdate(documents.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-3">
      {documents.length > 0 && (
        <div className="space-y-1.5">
          {documents.map((doc, index) => {
            const href = `/document-view?${new URLSearchParams({ path: doc.path, title: doc.title }).toString()}`
            return (
              <div
                key={`${doc.path}-${index}`}
                className="group flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' }}
              >
                <span className="min-w-0 flex-1 truncate">
                  <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>{doc.title}</span>
                  <span style={{ color: 'var(--color-text-muted)' }}> · {doc.path}</span>
                </span>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-icon !min-h-8 !min-w-8 !p-1.5 shrink-0"
                  title="Open document"
                  aria-label="Open document in new tab"
                >
                  <ExternalLink size={14} />
                </a>
                {!readOnly && (
                  <button
                    onClick={() => removeDocument(index)}
                    aria-label={`Remove document ${doc.title}`}
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    style={{ color: 'var(--color-text-muted)', lineHeight: 1 }}
                  >
                    ×
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
      {!readOnly && (
        <div className="flex gap-1.5">
          <input
            type="text"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDocument() } }}
            placeholder="Path"
            aria-label="Document path"
            className="w-[38%] rounded-lg border px-2.5 py-1.5 text-xs outline-none"
            style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
          />
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDocument() } }}
            placeholder="Title"
            aria-label="Document title"
            className="flex-1 rounded-lg border px-2.5 py-1.5 text-xs outline-none"
            style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
          />
          <button
            onClick={addDocument}
            disabled={!newPath.trim() || !newTitle.trim()}
            className="btn-icon !min-h-7 !min-w-7 !p-1 disabled:opacity-30"
            aria-label="Add document"
          >
            <Plus size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

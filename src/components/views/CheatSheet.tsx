import { useEffect, type ReactNode } from 'react'
import {
  CHEAT_ELEMENTS, CHEAT_VIEWS, CHEAT_DECISIONS, elementViewMatrix,
  type CheatElementKind, type CheatView,
} from '@/lib/cheatSheet'
import { TYPE_ICON_MAP } from '@/lib/icons/registry'
import { TYPE_COLORS } from '@/lib/elementMeta'
import CheatSheetDiagram from './CheatSheetDiagram'

// Standalone page at /cheat-sheet (see cheat-sheet.plan.md). All content comes
// from src/lib/cheatSheet.ts — this file is a pure renderer, styled like
// DocumentView.tsx (dark page background, centred surface-1 card).

const PAGE_TITLE = 'C4 cheat sheet — c4hero'

const NAV_SECTIONS = [
  { id: 'hierarchy', label: 'Hierarchy' },
  { id: 'elements', label: 'Elements' },
  { id: 'views', label: 'Views' },
  { id: 'matrix', label: 'Matrix' },
  { id: 'what-is-it', label: 'What is it?' },
] as const

const DEPLOYMENT_KINDS: ReadonlySet<CheatElementKind> = new Set([
  'deploymentNode', 'infrastructureNode', 'softwareSystemInstance', 'containerInstance',
])

function kindColor(kind: CheatElementKind): string {
  if (DEPLOYMENT_KINDS.has(kind)) return 'var(--color-type-infra)'
  return TYPE_COLORS[kind] ?? 'var(--color-type-external)'
}

const ELEMENT_BY_KIND = new Map(CHEAT_ELEMENTS.map((e) => [e.kind, e]))

function kindLabel(kind: CheatElementKind): string {
  return ELEMENT_BY_KIND.get(kind)?.label ?? kind
}

function TypeChip({ kind }: { kind: CheatElementKind }) {
  const color = kindColor(kind)
  const Icon = TYPE_ICON_MAP[kind]
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '3px 9px', borderRadius: 999,
        fontSize: 'var(--text-xs)', fontWeight: 600,
        color, background: `color-mix(in srgb, ${color} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
        whiteSpace: 'nowrap',
      }}
    >
      {Icon ? <Icon size={11} /> : null}
      {kindLabel(kind)}
    </span>
  )
}

function SectionHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={`${id}-heading`} className="cheat-sheet-section-heading">
      {children}
    </h2>
  )
}

// ─── Hierarchy diagrams ──────────────────────────────────────────────

const STATIC_HIERARCHY = {
  nodes: [
    { id: 'person', label: 'Person', kind: 'person' as const },
    { id: 'system', label: 'Software System', kind: 'softwareSystem' as const },
    { id: 'container', label: 'Container', kind: 'container' as const, parent: 'system' },
    { id: 'component', label: 'Component', kind: 'component' as const, parent: 'container' },
  ],
  edges: [],
}

const DEPLOYMENT_HIERARCHY = {
  nodes: [
    { id: 'env', label: 'Deployment Environment', kind: 'deploymentNode' as const },
    { id: 'node', label: 'Deployment Node', kind: 'deploymentNode' as const, parent: 'env' },
    { id: 'infra', label: 'Infrastructure Node', kind: 'infrastructureNode' as const, parent: 'node' },
    { id: 'instance', label: 'Container / Software System Instance', kind: 'containerInstance' as const, parent: 'node' },
  ],
  edges: [],
}

// ─── View card ───────────────────────────────────────────────────────

function ViewCard({ view }: { view: CheatView }) {
  return (
    <article className="cheat-sheet-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>{view.label}</h3>
        <code className="cheat-sheet-code-chip">{view.dslKeyword}</code>
        {!view.supportedInC4hero && (
          <span className="cheat-sheet-unsupported-badge">Not supported in c4hero yet</span>
        )}
      </div>

      <dl className="cheat-sheet-dl">
        <dt>Scope</dt>
        <dd>{view.scope}</dd>
        <dt>Purpose</dt>
        <dd>{view.purpose}</dd>
        <dt>Audience</dt>
        <dd>{view.audience}</dd>
      </dl>

      {view.scopes && view.scopes.length > 0 ? (
        <div className="cheat-sheet-subsection">
          <div className="cheat-sheet-label">Allowed, by scope</div>
          {view.scopes.map((s) => (
            <div key={s.scope} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
              <code className="cheat-sheet-code-chip">{s.scope}</code>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {s.allowed.map((k) => <TypeChip key={k} kind={k} />)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="cheat-sheet-subsection">
          <div className="cheat-sheet-label">Allowed elements</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {view.allowed.length > 0
              ? view.allowed.map((k) => <TypeChip key={k} kind={k} />)
              : <span className="cheat-sheet-muted">No modeled elements</span>}
          </div>
        </div>
      )}

      <div className="cheat-sheet-subsection">
        <div className="cheat-sheet-label">Tips</div>
        <ul className="cheat-sheet-ul">
          {view.tips.map((t) => <li key={t}>{t}</li>)}
        </ul>
      </div>

      <div className="cheat-sheet-subsection">
        <div className="cheat-sheet-label">Example — {view.example.title}</div>
        <p className="cheat-sheet-p">{view.example.description}</p>
        <CheatSheetDiagram diagram={view.example.diagram} />
      </div>
    </article>
  )
}

// ─── Element card ────────────────────────────────────────────────────

function ElementCard({ kind }: { kind: CheatElementKind }) {
  const el = ELEMENT_BY_KIND.get(kind)
  if (!el) return null
  const color = kindColor(kind)
  const Icon = TYPE_ICON_MAP[kind]

  return (
    <article className="cheat-sheet-card" style={{ borderTop: `3px solid ${color}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {Icon ? (
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26, borderRadius: 'var(--radius-sm)',
              background: `color-mix(in srgb, ${color} 16%, transparent)`,
            }}
          >
            <Icon size={14} style={{ color }} />
          </span>
        ) : null}
        <h3 style={{ margin: 0 }}>{el.label}</h3>
        <code className="cheat-sheet-code-chip">{el.dslKeyword}</code>
        {el.parent && <span className="cheat-sheet-muted">lives inside {el.parent}</span>}
      </div>

      <p className="cheat-sheet-p">{el.definition}</p>

      <div className="cheat-sheet-two-col">
        <div>
          <div className="cheat-sheet-label">Use it for</div>
          <ul className="cheat-sheet-ul">
            {el.useFor.map((u) => <li key={u}>{u}</li>)}
          </ul>
        </div>
        <div>
          <div className="cheat-sheet-label">Don't use it for</div>
          <ul className="cheat-sheet-ul">
            {el.notFor.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </div>
      </div>

      <div className="cheat-sheet-subsection">
        <div className="cheat-sheet-label">Examples</div>
        <div className="cheat-sheet-examples-grid">
          {el.examples.map((ex) => (
            <div key={ex.name} className="cheat-sheet-example-card">
              <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{ex.name}</div>
              <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>{ex.note}</div>
            </div>
          ))}
        </div>
      </div>
    </article>
  )
}

// ─── Matrix ──────────────────────────────────────────────────────────

const MATRIX_CELL_TEXT: Record<'yes' | 'scoped' | 'no', string> = {
  yes: '✓',
  scoped: 'scoped',
  no: '—',
}

function MatrixTable() {
  const matrix = elementViewMatrix()
  const kinds = CHEAT_ELEMENTS.map((e) => e.kind)

  return (
    <div className="cheat-sheet-matrix-wrapper">
      <table className="cheat-sheet-matrix">
        <thead>
          <tr>
            <th scope="col">Element</th>
            {CHEAT_VIEWS.map((v) => <th key={v.key} scope="col">{v.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {kinds.map((kind) => (
            <tr key={kind}>
              <th scope="row"><TypeChip kind={kind} /></th>
              {CHEAT_VIEWS.map((v) => {
                const cell = matrix[kind][v.key]
                return (
                  <td key={v.key} className={`cheat-sheet-matrix-cell cheat-sheet-matrix-cell--${cell}`}>
                    {MATRIX_CELL_TEXT[cell]}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Decision guide ──────────────────────────────────────────────────

function DecisionTable() {
  return (
    <div className="cheat-sheet-matrix-wrapper">
      <table className="cheat-sheet-decisions">
        <thead>
          <tr>
            <th scope="col">Everyday thing</th>
            <th scope="col">Model it as</th>
            <th scope="col">Reason</th>
          </tr>
        </thead>
        <tbody>
          {CHEAT_DECISIONS.map((d) => (
            <tr key={d.thing}>
              <td>{d.thing}</td>
              <td>
                {d.answer === 'not-modeled'
                  ? <span className="cheat-sheet-not-modeled-chip">Not modeled</span>
                  : <TypeChip kind={d.answer} />}
              </td>
              <td className="cheat-sheet-reason-cell">{d.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────

export default function CheatSheet() {
  useEffect(() => {
    document.title = PAGE_TITLE
  }, [])

  return (
    <div className="cheat-sheet-page">
      <main aria-label="C4 cheat sheet" className="cheat-sheet-main">
        <header className="cheat-sheet-header">
          <h1>C4 cheat sheet</h1>
          <p className="cheat-sheet-p">
            What the C4 model — as Structurizr DSL models it — offers: every element type and
            what it's for, every view type and what may appear on it, and concrete examples
            across banking, e-commerce, healthcare, SaaS, IoT and internal tooling.
          </p>
          <nav aria-label="Cheat sheet sections" className="cheat-sheet-nav">
            {NAV_SECTIONS.map((s, i) => (
              <span key={s.id}>
                {i > 0 && <span className="cheat-sheet-nav-sep" aria-hidden="true"> · </span>}
                <a href={`#${s.id}`}>{s.label}</a>
              </span>
            ))}
          </nav>
        </header>

        <section id="hierarchy" aria-labelledby="hierarchy-heading">
          <SectionHeading id="hierarchy">The C4 hierarchy</SectionHeading>
          <div className="cheat-sheet-card">
            <div className="cheat-sheet-label">Static elements</div>
            <CheatSheetDiagram diagram={STATIC_HIERARCHY} />
          </div>
          <div className="cheat-sheet-card">
            <div className="cheat-sheet-label">Deployment elements</div>
            <CheatSheetDiagram diagram={DEPLOYMENT_HIERARCHY} />
          </div>
        </section>

        <section id="elements" aria-labelledby="elements-heading">
          <SectionHeading id="elements">Elements</SectionHeading>
          <div className="cheat-sheet-stack">
            {CHEAT_ELEMENTS.map((el) => <ElementCard key={el.kind} kind={el.kind} />)}
          </div>
        </section>

        <section id="views" aria-labelledby="views-heading">
          <SectionHeading id="views">Views</SectionHeading>
          <div className="cheat-sheet-stack">
            {CHEAT_VIEWS.map((v) => <ViewCard key={v.key} view={v} />)}
          </div>
        </section>

        <section id="matrix" aria-labelledby="matrix-heading">
          <SectionHeading id="matrix">Element × view matrix</SectionHeading>
          <p className="cheat-sheet-p">
            Which element kinds may appear on which view types. "Scoped" means it depends on the
            view's scope (see the Views section above) — Relationships are shown automatically
            whenever both of their endpoints are on a static or deployment view; a dynamic view
            instead lists each interaction explicitly, as an ordered step.
          </p>
          <MatrixTable />
        </section>

        <section id="what-is-it" aria-labelledby="what-is-it-heading">
          <SectionHeading id="what-is-it">What is it?</SectionHeading>
          <p className="cheat-sheet-p">
            A decision guide for everyday things architects need to place somewhere in a C4 model.
          </p>
          <DecisionTable />
        </section>
      </main>

      <style>{`
        .cheat-sheet-page {
          height: 100%;
          overflow-y: auto;
          background: var(--color-bg-primary);
          padding: 48px 24px 96px;
          box-sizing: border-box;
        }
        .cheat-sheet-main {
          max-width: 1220px;
          margin: 0 auto;
          color: var(--color-text-primary);
        }
        .cheat-sheet-header h1 {
          margin: 0 0 8px;
          font-size: 1.75em;
          font-weight: 700;
        }
        .cheat-sheet-nav {
          margin-top: 16px;
          font-size: var(--text-sm);
        }
        .cheat-sheet-nav a {
          color: var(--color-accent);
          text-decoration: none;
        }
        .cheat-sheet-nav a:hover { text-decoration: underline; }
        .cheat-sheet-nav-sep { color: var(--color-text-subtle); }
        .cheat-sheet-section-heading {
          margin: 48px 0 16px;
          font-size: 1.3em;
          font-weight: 700;
          color: var(--color-text-primary);
          border-bottom: 1px solid var(--color-border);
          padding-bottom: 10px;
        }
        .cheat-sheet-stack {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .cheat-sheet-card {
          background: var(--color-surface-1);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: 20px 24px;
          margin-bottom: 16px;
        }
        .cheat-sheet-stack .cheat-sheet-card { margin-bottom: 0; }
        .cheat-sheet-p {
          color: var(--color-text-secondary);
          line-height: 1.6;
          font-size: var(--text-base);
        }
        .cheat-sheet-label {
          font-size: var(--text-xs);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--color-text-muted);
        }
        .cheat-sheet-muted {
          color: var(--color-text-muted);
          font-size: var(--text-sm);
        }
        .cheat-sheet-subsection { margin-top: 16px; }
        .cheat-sheet-dl {
          display: grid;
          grid-template-columns: max-content 1fr;
          gap: 4px 16px;
          margin: 14px 0 0;
        }
        .cheat-sheet-dl dt {
          font-size: var(--text-xs);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--color-text-muted);
        }
        .cheat-sheet-dl dd {
          margin: 0;
          color: var(--color-text-secondary);
          font-size: var(--text-base);
        }
        .cheat-sheet-two-col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-top: 16px;
        }
        .cheat-sheet-ul {
          margin: 6px 0 0;
          padding-left: 1.2em;
          color: var(--color-text-secondary);
          font-size: var(--text-base);
          line-height: 1.5;
        }
        .cheat-sheet-ul li { margin: 4px 0; }
        .cheat-sheet-examples-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 10px;
          margin-top: 8px;
        }
        .cheat-sheet-example-card {
          background: var(--color-surface-2);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          padding: 10px 12px;
        }
        .cheat-sheet-code-chip {
          background: var(--color-surface-3);
          border-radius: var(--radius-sm);
          padding: 2px 6px;
          font-size: var(--text-xs);
          color: var(--color-text-secondary);
        }
        .cheat-sheet-unsupported-badge {
          font-size: var(--text-xs);
          font-weight: 600;
          color: var(--color-text-muted);
          background: var(--color-surface-3);
          border: 1px solid var(--color-border);
          border-radius: 999px;
          padding: 3px 10px;
        }
        .cheat-sheet-not-modeled-chip {
          display: inline-flex;
          align-items: center;
          padding: 3px 9px;
          border-radius: 999px;
          font-size: var(--text-xs);
          font-weight: 600;
          color: var(--color-text-muted);
          background: var(--color-surface-3);
          border: 1px solid var(--color-border);
          white-space: nowrap;
        }
        .cheat-sheet-matrix-wrapper {
          overflow-x: auto;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
        }
        .cheat-sheet-matrix, .cheat-sheet-decisions {
          border-collapse: collapse;
          width: 100%;
          background: var(--color-surface-1);
        }
        /* Only the matrix genuinely needs horizontal scroll on narrow screens
           (one column per view type) — the decisions table's three columns
           reflow instead, so the page itself never needs to scroll. */
        .cheat-sheet-matrix { min-width: 640px; }
        .cheat-sheet-matrix th, .cheat-sheet-matrix td,
        .cheat-sheet-decisions th, .cheat-sheet-decisions td {
          border: 1px solid var(--color-border);
          padding: 8px 12px;
          text-align: left;
          font-size: var(--text-sm);
          white-space: nowrap;
        }
        .cheat-sheet-decisions td { white-space: normal; }
        .cheat-sheet-matrix thead th, .cheat-sheet-decisions thead th {
          background: var(--color-surface-2);
          color: var(--color-text-primary);
          position: sticky;
          top: 0;
        }
        .cheat-sheet-matrix-cell { text-align: center; color: var(--color-text-secondary); }
        .cheat-sheet-matrix-cell--yes { color: var(--color-accent); font-weight: 700; }
        .cheat-sheet-matrix-cell--scoped { color: var(--color-type-infra); }
        .cheat-sheet-matrix-cell--no { color: var(--color-text-subtle); }
        .cheat-sheet-reason-cell { color: var(--color-text-secondary); min-width: 260px; }

        @media (max-width: 480px) {
          .cheat-sheet-page { padding: 24px 16px 64px; }
          .cheat-sheet-card { padding: 16px; }
          .cheat-sheet-two-col { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  )
}

import type { CheatDiagramSpec, CheatElementKind } from '@/lib/cheatSheet'
import { TYPE_ICON_MAP } from '@/lib/icons/registry'

// Static renderer for a CheatDiagramSpec — plain flex boxes and inline SVG-free
// HTML, no layout engine and no React Flow (see cheat-sheet.plan.md's "Mini
// diagrams" note). Two node layouts are supported, matching the two shapes the
// content module actually produces:
//  - boundary-style (static views): nodes outside a dashed "boundary" box,
//    nodes with `inBoundary` inside it — used by context/container/component.
//  - parent-nesting (deployment + the hierarchy diagrams): nodes reference
//    another node's id via `parent`, nested recursively.
// Edges are listed below as compact "A → B: label" rows, numbered when the
// spec carries an `order` (dynamic views).

type DiagramNode = CheatDiagramSpec['nodes'][number]

const KIND_COLOR: Record<CheatElementKind, string> = {
  person: 'var(--color-type-person)',
  softwareSystem: 'var(--color-type-system)',
  container: 'var(--color-type-container)',
  component: 'var(--color-type-component)',
  deploymentNode: 'var(--color-type-infra)',
  infrastructureNode: 'var(--color-type-infra)',
  softwareSystemInstance: 'var(--color-type-infra)',
  containerInstance: 'var(--color-type-infra)',
  element: 'var(--color-type-external)',
  group: 'var(--color-type-external)',
  relationship: 'var(--color-type-external)',
}

function nodeColor(node: DiagramNode): string {
  return node.external ? 'var(--color-type-external)' : KIND_COLOR[node.kind]
}

function NodeBox({ node }: { node: DiagramNode }) {
  const Icon = TYPE_ICON_MAP[node.kind]
  const color = nodeColor(node)
  return (
    <div
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 10px', borderRadius: 'var(--radius-sm)',
        border: `1px solid color-mix(in srgb, ${color} 55%, transparent)`,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)',
        whiteSpace: 'nowrap', lineHeight: 1.2,
      }}
    >
      {Icon ? <Icon size={12} style={{ color, flexShrink: 0 }} /> : null}
      {node.label}
    </div>
  )
}

/** Recursive parent-nesting layout (deployment views, hierarchy diagrams). */
function NestedLayout({ nodes }: { nodes: DiagramNode[] }) {
  const byParent = new Map<string | undefined, DiagramNode[]>()
  for (const n of nodes) {
    const key = n.parent
    const list = byParent.get(key)
    if (list) list.push(n)
    else byParent.set(key, [n])
  }

  function renderLevel(parentId: string | undefined) {
    const children = byParent.get(parentId) ?? []
    if (children.length === 0) return null
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {children.map((n) => {
          const nested = byParent.get(n.id)
          return (
            <div
              key={n.id}
              style={{
                display: 'flex', flexDirection: 'column', gap: 8,
                border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)',
                padding: 10,
              }}
            >
              <NodeBox node={n} />
              {nested && nested.length > 0 && renderLevel(n.id)}
            </div>
          )
        })}
      </div>
    )
  }

  return renderLevel(undefined)
}

/** Boundary-box layout (system context / container / component views). */
function BoundaryLayout({ diagram }: { diagram: CheatDiagramSpec }) {
  const outside = diagram.nodes.filter((n) => !n.inBoundary)
  const inside = diagram.nodes.filter((n) => n.inBoundary)

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
      {outside.map((n) => <NodeBox key={n.id} node={n} />)}
      {inside.length > 0 && (
        <div style={{ border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)', padding: 10 }}>
          {diagram.boundary && (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 8, fontWeight: 600 }}>
              {diagram.boundary}
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {inside.map((n) => <NodeBox key={n.id} node={n} />)}
          </div>
        </div>
      )}
    </div>
  )
}

export default function CheatSheetDiagram({ diagram }: { diagram: CheatDiagramSpec }) {
  if (diagram.nodes.length === 0) {
    return (
      <div
        style={{
          border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)',
          padding: '20px 16px', textAlign: 'center',
          color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)',
        }}
      >
        External PlantUML / Mermaid / Kroki / image — rendered outside c4hero, not modeled as elements
      </div>
    )
  }

  const byId = new Map(diagram.nodes.map((n) => [n.id, n]))
  const hasParentNesting = diagram.nodes.some((n) => n.parent && byId.has(n.parent))
  const edges = [...diagram.edges].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  return (
    <div>
      {hasParentNesting
        ? <NestedLayout nodes={diagram.nodes} />
        : <BoundaryLayout diagram={diagram} />}
      {edges.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 14 }}>
          {edges.map((e, i) => {
            const from = byId.get(e.from)
            const to = byId.get(e.to)
            return (
              <div key={`${e.from}-${e.to}-${i}`} style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                {e.order != null && (
                  <span style={{ color: 'var(--color-text-muted)', marginRight: 6 }}>{e.order}.</span>
                )}
                <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{from?.label ?? e.from}</span>
                {' → '}
                <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{to?.label ?? e.to}</span>
                {e.label ? <>: {e.label}</> : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

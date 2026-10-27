import { Position } from '@xyflow/react'
import type { Relationship } from '@/types/model'

export type EdgeLabelDensity = 'full' | 'compact'

export function getEdgeLabelDensity({
  lineStyle,
  sourceX,
  sourceY,
  targetX,
  targetY,
  description,
  technologies,
  selected,
  hovered,
}: {
  lineStyle?: Relationship['lineStyle']
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  description?: string
  technologies: string[]
  selected: boolean
  hovered: boolean
}): EdgeLabelDensity {
  if (selected || hovered) return 'full'

  const edgeLength = Math.hypot(targetX - sourceX, targetY - sourceY)
  const descriptionLength = description?.trim().length ?? 0
  const technologyLength = technologies.join(', ').length
  const totalLabelLength = descriptionLength + technologyLength

  if (lineStyle === 'Orthogonal' && totalLabelLength >= 48) return 'compact'
  if (totalLabelLength >= 72) return 'compact'
  if (edgeLength < 180 && totalLabelLength >= 30) return 'compact'

  return 'full'
}

export function truncateEdgeLabel(text: string, maxChars: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= maxChars) return trimmed
  return `${trimmed.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`
}

// Distance from the source endpoint to the order badge's centre: clear of
// the start dot, and far from the midpoint where the description label sits.
const ORDER_BADGE_DISTANCE = 22

const OUTWARD: Record<Position, [number, number]> = {
  [Position.Left]: [-1, 0],
  [Position.Right]: [1, 0],
  [Position.Top]: [0, -1],
  [Position.Bottom]: [0, 1],
}

/**
 * Where the dynamic-view order badge goes: just after the source end of the
 * edge. Curved and orthogonal edges leave the node perpendicular to its side;
 * straight edges head directly at the target.
 */
export function orderBadgePosition(
  sourceX: number, sourceY: number, targetX: number, targetY: number,
  sourcePosition: Position, straight: boolean,
): [number, number] {
  let [dx, dy] = OUTWARD[sourcePosition] ?? [0, 0]
  if (straight) {
    const len = Math.hypot(targetX - sourceX, targetY - sourceY)
    if (len > 0) [dx, dy] = [(targetX - sourceX) / len, (targetY - sourceY) / len]
  }
  return [sourceX + dx * ORDER_BADGE_DISTANCE, sourceY + dy * ORDER_BADGE_DISTANCE]
}

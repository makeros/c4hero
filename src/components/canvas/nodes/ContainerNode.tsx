import { memo } from 'react'
import { type NodeProps } from '@xyflow/react'
import type { C4NodeData } from './types'
import type { Container } from '@/types/model'
import { getContainerIcon } from '@/lib/icons/registry'
import BaseC4Node from './BaseC4Node'
import { getElementTypeLabel } from '@/lib/elementMeta'

function ContainerNode({ data, selected }: NodeProps & { data: C4NodeData }) {
  const container = data.element as Container
  const Icon = getContainerIcon(container.tags)

  return (
    <BaseC4Node
      data={data}
      selected={selected}
      icon={Icon}
      typeColor="var(--color-type-container)"
      chipLabel={getElementTypeLabel(container)}
      tint="var(--color-tint-container)"
      borderStyle="2px solid var(--color-border-container)"
      ariaPrefix="Container"
      technology={container.technology}
    />
  )
}

export default memo(ContainerNode)

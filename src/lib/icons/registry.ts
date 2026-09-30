import type { LucideIcon } from 'lucide-react'
import {
  Database, Box, Monitor, Zap, GitMerge, Smartphone, HardDrive,
  Circle, Hexagon, Diamond, UserRound, Bot, Folder, Globe, Puzzle,
  FolderOpen, Server, Boxes,
} from 'lucide-react'

/**
 * Single source of truth for every icon the canvas resolves for a model
 * element. To add a new icon, add one entry below with the lucide icon and
 * the tag/shape/type name(s) that should resolve to it — every consumer
 * (container-tag icons, Structurizr shape overrides, element-type icons,
 * and the "List Available Icons" command) reads from this list.
 */
export type IconMatchKind = 'container-tag' | 'structurizr-shape' | 'element-type' | 'fixed-use'

export interface IconEntry {
  id: string
  label: string
  icon: LucideIcon
  matches: Partial<Record<IconMatchKind, string[]>>
}

export const ICON_REGISTRY: IconEntry[] = [
  {
    id: 'database',
    label: 'Database',
    icon: Database,
    matches: { 'container-tag': ['Database'], 'structurizr-shape': ['Cylinder'] },
  },
  {
    id: 'web-application',
    label: 'Web Application',
    icon: Monitor,
    matches: { 'container-tag': ['Web Application'] },
  },
  {
    id: 'service',
    label: 'Service',
    icon: Zap,
    matches: { 'container-tag': ['Service'] },
  },
  {
    id: 'queue',
    label: 'Queue',
    icon: GitMerge,
    matches: { 'container-tag': ['Queue'] },
  },
  {
    id: 'mobile-app',
    label: 'Mobile App',
    icon: Smartphone,
    matches: { 'container-tag': ['Mobile App'], 'structurizr-shape': ['MobileDevicePortrait', 'MobileDeviceLandscape'] },
  },
  {
    id: 'file-system',
    label: 'File System',
    icon: HardDrive,
    matches: { 'container-tag': ['File System'], 'fixed-use': ['Infrastructure node row (deployment topology editor)'] },
  },
  {
    id: 'container-default',
    label: 'Container (default)',
    icon: Box,
    matches: { 'element-type': ['container'] },
  },
  {
    id: 'circle',
    label: 'Circle',
    icon: Circle,
    matches: { 'structurizr-shape': ['Circle', 'Ellipse'] },
  },
  {
    id: 'hexagon',
    label: 'Hexagon',
    icon: Hexagon,
    matches: { 'structurizr-shape': ['Hexagon'] },
  },
  {
    id: 'diamond',
    label: 'Diamond',
    icon: Diamond,
    matches: { 'structurizr-shape': ['Diamond'] },
  },
  {
    id: 'person',
    label: 'Person',
    icon: UserRound,
    matches: { 'structurizr-shape': ['Person'], 'element-type': ['person'] },
  },
  {
    id: 'robot',
    label: 'Robot',
    icon: Bot,
    matches: { 'structurizr-shape': ['Robot'] },
  },
  {
    id: 'folder',
    label: 'Folder',
    icon: Folder,
    matches: { 'structurizr-shape': ['Folder'] },
  },
  {
    id: 'web-browser',
    label: 'Web Browser / Software System',
    icon: Globe,
    matches: { 'structurizr-shape': ['WebBrowser'], 'element-type': ['softwareSystem'] },
  },
  {
    id: 'component',
    label: 'Component',
    icon: Puzzle,
    matches: { 'element-type': ['component'] },
  },
  {
    id: 'group',
    label: 'Group',
    icon: FolderOpen,
    matches: { 'fixed-use': ['Group node'] },
  },
  {
    id: 'infrastructure-node',
    label: 'Infrastructure Node',
    icon: Server,
    matches: { 'fixed-use': ['Infrastructure node (canvas)'] },
  },
  {
    id: 'deployment-node',
    label: 'Deployment Node',
    icon: Boxes,
    matches: { 'fixed-use': ['Deployment node row (deployment topology editor)'] },
  },
]

/** Priority order for container-tag resolution — first matching tag wins. */
export const CONTAINER_TAG_PRIORITY = [
  'Database', 'Web Application', 'Service', 'Queue', 'Mobile App', 'File System',
] as const

const iconByContainerTag = new Map<string, LucideIcon>()
const iconByShape: Record<string, LucideIcon> = {}
const iconByElementType: Record<string, LucideIcon> = {}

for (const entry of ICON_REGISTRY) {
  for (const tag of entry.matches['container-tag'] ?? []) iconByContainerTag.set(tag, entry.icon)
  for (const shape of entry.matches['structurizr-shape'] ?? []) iconByShape[shape] = entry.icon
  for (const type of entry.matches['element-type'] ?? []) iconByElementType[type] = entry.icon
}

const DEFAULT_CONTAINER_ICON = iconByElementType.container ?? Box

/** Resolve a container's icon from its tags, in CONTAINER_TAG_PRIORITY order. Falls back to the default container icon. */
export function getContainerIcon(tags: string[]): LucideIcon {
  for (const tag of CONTAINER_TAG_PRIORITY) {
    const icon = iconByContainerTag.get(tag)
    if (icon && tags.includes(tag)) return icon
  }
  return DEFAULT_CONTAINER_ICON
}

/** Structurizr `style.shape` name -> icon, for the tag-style shape override in BaseC4Node. */
export const SHAPE_ICON_MAP: Record<string, LucideIcon> = iconByShape

/** Base element type -> icon (person / softwareSystem / container / component). */
export const TYPE_ICON_MAP: Record<string, LucideIcon> = iconByElementType

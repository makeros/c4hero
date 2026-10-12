declare module 'virtual:locked-workspace' {
  const lockedWorkspace: { dsl: string; sidecar: string | null; name: string } | null
  export default lockedWorkspace
}

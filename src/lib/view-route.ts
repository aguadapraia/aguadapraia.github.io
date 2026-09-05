export type AppViewMode = 'map' | 'table' | 'evolution'

const viewPaths: Record<AppViewMode, string> = {
  map: '/',
  table: '/tabela/',
  evolution: '/evolucao/',
}

export const productionOrigin = 'https://aguadapraia.github.io'

export function pathForView(view: AppViewMode): string {
  return viewPaths[view]
}

export function canonicalUrlForView(view: AppViewMode): string {
  return new URL(viewPaths[view], productionOrigin).href
}

export function viewFromPath(pathname: string): AppViewMode {
  const normalized = `${pathname.replace(/\/+$/, '')}/`
  if (normalized === viewPaths.table) return 'table'
  if (normalized === viewPaths.evolution) return 'evolution'
  return 'map'
}

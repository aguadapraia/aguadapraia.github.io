export function normalizeBeachSearch(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').trim().toLocaleLowerCase('pt-PT')
}

import { describe, expect, it } from 'vitest'
import { beachSheetAfterDrag, beachSheetHeight } from './beach-sheet'

describe('mobile beach detail sheet', () => {
  it('leaves room for the map with a bounded default height', () => {
    expect(beachSheetHeight('collapsed', 600, 420)).toBe(64)
    expect(beachSheetHeight('summary', 600, 420)).toBe(420)
    expect(beachSheetHeight('expanded', 600, 420)).toBe(600)
    expect(beachSheetHeight('summary', 60, 420)).toBe(64)
    expect(beachSheetHeight('summary', 400, 420)).toBe(400)
  })

  it('ignores finger jitter so a tap can toggle the panel', () => {
    expect(beachSheetAfterDrag('summary', 11, 600, 420)).toBe('summary')
    expect(beachSheetAfterDrag('summary', -11, 600, 420)).toBe('summary')
  })

  it('snaps a deliberate upward or downward drag to the next position', () => {
    expect(beachSheetAfterDrag('summary', 30, 600, 420)).toBe('expanded')
    expect(beachSheetAfterDrag('summary', -30, 600, 420)).toBe('collapsed')
    expect(beachSheetAfterDrag('collapsed', 30, 600, 420)).toBe('summary')
    expect(beachSheetAfterDrag('expanded', -30, 600, 420)).toBe('summary')
  })

  it('allows a long drag to cross both positions without exceeding bounds', () => {
    expect(beachSheetAfterDrag('expanded', -550, 600, 420)).toBe('collapsed')
    expect(beachSheetAfterDrag('collapsed', 550, 600, 420)).toBe('expanded')
    expect(beachSheetAfterDrag('expanded', 400, 600, 420)).toBe('expanded')
    expect(beachSheetAfterDrag('collapsed', -400, 600, 420)).toBe('collapsed')
  })
})

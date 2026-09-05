/**
 * Verifies that public/staticwebapp.config.json is present and contains the
 * required security headers, including a CSP that permits the Container Apps
 * API origin while keeping all other directives restrictive.
 *
 * Vite copies everything from public/ into dist/ verbatim, so this file must
 * exist in public/ — not in src/ — to be deployed with the static site.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const configPath = join(process.cwd(), 'public', 'staticwebapp.config.json')

function readConfig(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>
  } catch (error) {
    throw new Error(
      `Could not read public/staticwebapp.config.json: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

describe('staticwebapp.config.json', () => {
  it('exists at public/staticwebapp.config.json', () => {
    expect(() => readConfig()).not.toThrow()
  })

  it('contains globalHeaders', () => {
    const config = readConfig()
    expect(typeof config.globalHeaders).toBe('object')
    expect(config.globalHeaders).not.toBeNull()
  })

  it('CSP permits only the production Container Apps API in connect-src', () => {
    const { globalHeaders } = readConfig() as { globalHeaders: Record<string, string> }
    const csp = globalHeaders['Content-Security-Policy']
    expect(typeof csp).toBe('string')
    expect(csp).toContain('connect-src')
    expect(csp).toContain(
      'https://ca-aguadapraia-api-prod.jollysky-7570b695.spaincentral.azurecontainerapps.io',
    )
    expect(csp).not.toContain('https://*.azurecontainerapps.io')
  })

  it('CSP keeps restrictive directives for default-src, script-src, object-src, form-action, frame-src', () => {
    const { globalHeaders } = readConfig() as { globalHeaders: Record<string, string> }
    const csp = globalHeaders['Content-Security-Policy']
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("form-action 'none'")
    expect(csp).toContain("frame-src 'none'")
  })

  it('includes X-Content-Type-Options: nosniff', () => {
    const { globalHeaders } = readConfig() as { globalHeaders: Record<string, string> }
    expect(globalHeaders['X-Content-Type-Options']).toBe('nosniff')
  })

  it('includes X-Frame-Options: DENY', () => {
    const { globalHeaders } = readConfig() as { globalHeaders: Record<string, string> }
    expect(globalHeaders['X-Frame-Options']).toBe('DENY')
  })

  it('includes Referrer-Policy', () => {
    const { globalHeaders } = readConfig() as { globalHeaders: Record<string, string> }
    expect(typeof globalHeaders['Referrer-Policy']).toBe('string')
    expect(globalHeaders['Referrer-Policy'].length).toBeGreaterThan(0)
  })

  it('allows first-party optional geolocation while denying camera and microphone', () => {
    const { globalHeaders } = readConfig() as { globalHeaders: Record<string, string> }
    expect(globalHeaders['Permissions-Policy']).toBe('camera=(), microphone=(), geolocation=(self)')
  })
})

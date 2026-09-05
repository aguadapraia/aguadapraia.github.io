import { defineConfig, loadEnv, type Plugin, type ResolvedConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathForView, productionOrigin, type AppViewMode } from './src/lib/view-route.ts'

function staticPages(apiBase: string | undefined): Plugin {
  let config: ResolvedConfig
  let policy: string
  return {
    name: 'static-pages',
    apply: 'build',
    configResolved(resolved) {
      config = resolved
      if (!apiBase) throw new Error('VITE_DATA_API_BASE is required for publishing')
      const api = new URL(apiBase)
      if (api.protocol !== 'https:' || api.username || api.password || api.search || api.hash) {
        throw new Error('VITE_DATA_API_BASE must be a public HTTPS API URL without credentials')
      }
      policy = `default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ${api.origin} https://cloudflareinsights.com; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-src 'none'; worker-src 'self' blob:; upgrade-insecure-requests`
    },
    transformIndexHtml() {
      return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' }]
    },
    async writeBundle() {
      const output = path.resolve(config.root, config.build.outDir)
      const html = await readFile(path.join(output, 'index.html'), 'utf8')
      const routes: { view: AppViewMode; title: string }[] = [
        { view: 'map', title: 'Mapa' },
        { view: 'table', title: 'Tabela' },
        { view: 'evolution', title: 'Histórico' },
      ]
      for (const { view, title } of routes) {
        const route = pathForView(view)
        const directory = path.join(output, route.replace(/^\/|\/$/g, ''))
        await mkdir(directory, { recursive: true })
        const page = html
          .replace(/<title>[^<]*<\/title>/, `<title>${title} - ÁguaDaPraia</title>`)
          .replace(/(<meta (?:property="og:title"|name="twitter:title") content=")[^"]*"/g, `$1${title} - ÁguaDaPraia"`)
          .replaceAll(`${productionOrigin}/`, `${productionOrigin}${route}`)
        await writeFile(path.join(directory, 'index.html'), page)
      }
      for (const name of ['privacy.html', '404.html']) {
        const file = path.join(output, name)
        const page = await readFile(file, 'utf8')
        await writeFile(file, page.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}">`))
      }
      await writeFile(path.join(output, '.nojekyll'), '')
    },
  }
}

export default defineConfig(({ mode }) => {
  const environment = { ...process.env, ...loadEnv(mode, process.cwd(), '') }
  const apiProxy = {
    '/api/data': {
      target: 'https://ca-aguadapraia-api-prod.jollysky-7570b695.spaincentral.azurecontainerapps.io',
      changeOrigin: true,
      secure: true,
      headers: { Origin: productionOrigin },
    },
  }
  return {
    base: '/',
    plugins: [react(), staticPages(environment.VITE_DATA_API_BASE)],
    build: { chunkSizeWarningLimit: 1000 },
    server: { proxy: apiProxy },
    preview: { proxy: apiProxy },
    resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  }
})

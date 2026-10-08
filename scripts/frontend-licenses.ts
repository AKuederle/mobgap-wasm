import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'

/** Retain full notices for shipped JS, imported CSS and emitted fonts. */
export function frontendLicenses(): Plugin {
  let config: ResolvedConfig
  let resolveCss: ReturnType<ResolvedConfig['createResolver']>
  return {
    name: 'mobgap-frontend-license-notices',
    apply: 'build',
    configResolved(resolved) {
      config = resolved
      resolveCss = config.createResolver({ extensions: ['.css'], mainFields: ['style'], conditions: ['style'], preferRelative: true })
    },
    async generateBundle(_options, bundle) {
      const packages = new Set<string>()
      const styles = new Set<string>()
      const packageFor = (id: string) => {
        // Virtual bundler modules have no independently distributed package.
        if (id.startsWith('\0')) return
        const path = isAbsolute(id) ? id.split('?')[0] : resolve(config.root, id.split('?')[0])
        if (!path.includes(`${join('node_modules', '')}`)) return
        let directory = dirname(path)
        while (directory !== dirname(directory)) {
          if (existsSync(join(directory, 'package.json'))) { packages.add(directory); return }
          directory = dirname(directory)
        }
      }
      const collectStyle = async (id: string) => {
        const path = id.split('?')[0]
        if (styles.has(path)) return
        styles.add(path)
        packageFor(path)
        const source = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
        for (const match of source.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']/g)) {
          if (/^(?:https?:|data:|\/\/)/.test(match[1])) continue
          const dependency = await resolveCss(match[1], path)
          if (!dependency) this.error(`Cannot resolve the stylesheet license source: ${match[1]}`)
          await collectStyle(dependency)
        }
      }
      for (const output of Object.values(bundle)) {
        if (output.type === 'chunk') {
          for (const id of Object.keys(output.modules)) {
            packageFor(id)
            if (id.split('?')[0].endsWith('.css')) await collectStyle(id)
          }
        } else {
          for (const id of output.originalFileNames) packageFor(id)
        }
      }
      const sections: string[] = []
      for (const directory of [...packages].sort()) {
        const metadata = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as { name: string; version: string; license?: string }
        const files = readdirSync(directory).filter(name => /^(?:licen[cs]e|notice|copying)(?:[.-]|$)|^copyright/i.test(name)).sort()
        const notices = files.map(name => `${name}\n${readFileSync(join(directory, name), 'utf8')}`)
        if (!notices.length) {
          const fallback = join(config.root, 'licenses/frontend', `${metadata.name.replaceAll('/', '+')}-${metadata.version}-LICENSE`)
          if (!existsSync(fallback)) this.error(`Full license notice missing for ${metadata.name}@${metadata.version}. Add the upstream notice under licenses/frontend.`)
          notices.push(`Upstream license retained in licenses/frontend\n${readFileSync(fallback, 'utf8')}`)
        }
        sections.push(`${metadata.name}@${metadata.version}\nLicense: ${metadata.license ?? 'See notice below'}\n${notices.join('\n\n')}`)
      }
      this.emitFile({
        type: 'asset', fileName: 'THIRD_PARTY_NOTICES.txt',
        source: `Frontend dependency notices\n\nIncludes bundled JavaScript, CSS imports and font assets. Worker and Python notices are distributed separately under runtime/licenses and in runtime/bootstrap.zip.\n\n${sections.join('\n\n' + '='.repeat(80) + '\n\n')}\n`,
      })
    },
  }
}

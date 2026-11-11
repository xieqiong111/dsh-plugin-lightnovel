/**
 * Self-contained `prepare` for git installs. DSH docs note pnpm does not build
 * packages installed from git, so a plugin must either ship prebuilt output or
 * build itself. This script prefers the shipped `dist/` and only compiles when
 * it is missing AND a local TypeScript is available. It never assumes a
 * monorepo checkout next to the plugin.
 */
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const entry = join(root, 'dist', 'index.js')
const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc')

if (existsSync(entry)) {
  console.log('[dsh-plugin-lightnovel] prebuilt dist/ present, skipping build')
  process.exit(0)
}
if (!existsSync(tsc)) {
  console.warn('[dsh-plugin-lightnovel] dist/ missing and TypeScript unavailable.')
  console.warn('[dsh-plugin-lightnovel] Install the npm tarball instead, or run: npm install && npm run build')
  process.exit(0)
}
const result = spawnSync(process.execPath, [tsc, '-p', join(root, 'tsconfig.json')], {
  cwd: root,
  stdio: 'inherit',
})
process.exit(result.status ?? 1)

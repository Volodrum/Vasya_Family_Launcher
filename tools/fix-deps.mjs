/**
 * postinstall: some @xmcl packages (e.g. @xmcl/unzip 2.2.0) were published with their
 * development package.json, so "main" points at a TypeScript file that isn't shipped.
 * Their built files are in dist/ and the correct fields are in "publishConfig"; apply them.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const scope = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'node_modules', '@xmcl')
if (existsSync(scope)) {
  for (const name of readdirSync(scope)) {
    const file = join(scope, name, 'package.json')
    if (!existsSync(file)) continue
    const pkg = JSON.parse(readFileSync(file, 'utf8'))
    const main = pkg.main && join(scope, name, pkg.main)
    if (!pkg.publishConfig?.main || (main && existsSync(main))) continue
    for (const key of ['main', 'module', 'types', 'exports']) {
      if (pkg.publishConfig[key]) pkg[key] = pkg.publishConfig[key]
    }
    writeFileSync(file, JSON.stringify(pkg, null, 2))
    console.log(`fix-deps: @xmcl/${name} main -> ${pkg.main}`)
  }
}

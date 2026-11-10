// Node module hooks that let a plain `node` process import this project's
// TypeScript/TSX sources: the `@/` alias, extension-less relative imports and
// on-the-fly transpilation (no type checking — `tsc` and Jest do that).
//
// Test support for `renderReports.mjs`. The report is rendered for real in a
// child process because @react-pdf/renderer and its dependencies are ES
// modules (yoga-layout even uses top-level await), which Jest's CommonJS
// module system cannot load.
import { registerHooks } from 'node:module'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

const here = path.dirname(fileURLToPath(import.meta.url))
// src/lib/pdf-generator/testing → src
const SRC = path.resolve(here, '..', '..', '..')

const isFile = (candidate) => existsSync(candidate) && statSync(candidate).isFile()

/** The source file an extension-less project import points at, if any. */
function sourceFile(base) {
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ]) {
    if (isFile(candidate)) return candidate
  }
  return null
}

const isProjectSource = (url) =>
  typeof url === 'string' && url.startsWith('file:') && !url.includes('/node_modules/')

registerHooks({
  resolve(specifier, context, nextResolve) {
    let base = null
    if (specifier.startsWith('@/')) {
      base = path.join(SRC, specifier.slice(2))
    } else if (
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      isProjectSource(context.parentURL)
    ) {
      base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier)
    }
    const file = base ? sourceFile(base) : null
    if (file) return { url: pathToFileURL(file).href, shortCircuit: true }
    return nextResolve(specifier, context)
  },

  load(url, context, nextLoad) {
    if (isProjectSource(url) && /\.tsx?$/.test(url)) {
      const fileName = fileURLToPath(url)
      const { outputText } = ts.transpileModule(readFileSync(fileName, 'utf8'), {
        fileName,
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
          isolatedModules: true,
        },
      })
      return { format: 'module', source: outputText, shortCircuit: true }
    }
    return nextLoad(url, context)
  },
})

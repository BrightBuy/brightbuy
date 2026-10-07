import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';

export async function load(url, context, nextLoad) {
  if (url.endsWith('.css')) return { format: 'module', shortCircuit: true, source: 'export default {};' };
  if (url.endsWith('.jsx')) {
    const source = await readFile(new URL(url), 'utf8');
    const result = await transform(source, { loader: 'jsx', format: 'esm', jsx: 'transform' });
    return { format: 'module', shortCircuit: true, source: result.code };
  }
  return nextLoad(url, context);
}

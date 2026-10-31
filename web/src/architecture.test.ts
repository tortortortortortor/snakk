import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The engine must stay reusable under any visualization, and visualizations must not lean on each other. */
const src = __dirname;
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });
const imports = (file: string) => [...readFileSync(file, 'utf8').matchAll(/from '([^']+)'|import\('([^']+)'\)/g)].map((m) => m[1] ?? m[2]);

describe('architecture', () => {
  it('the engine imports no rendering code', () => {
    for (const f of files(join(src, 'engine'))) {
      for (const i of imports(f)) {
        expect(i, relative(src, f)).not.toMatch(/visuals|\/ui\/|three|@react-three|^react$|react-dom/);
      }
    }
  });

  it('visualizations reach the engine only through its index, and never import each other', () => {
    for (const f of files(join(src, 'visuals'))) {
      const own = relative(join(src, 'visuals'), f).split('/')[0];
      for (const i of imports(f)) {
        if (i.includes('/engine')) expect(i, relative(src, f)).toMatch(/\/engine$/);
        const other = /^\.\.\/(\w+)\//.exec(i)?.[1];
        if (other && own !== 'registry.ts' && own !== 'types.ts') expect(other, relative(src, f)).toBe(own);
      }
    }
  });
});

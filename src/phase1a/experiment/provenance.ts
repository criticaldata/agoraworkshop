import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configHash } from '../../config/hash.js';

/** Bind review to actual source and dependency lock, including uncommitted changes. */
export function implementationHash(): string {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  function files(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]);
  }
  const paths = [...files(join(root, 'src')), join(root, 'package.json'), join(root, 'package-lock.json')].sort();
  return configHash(paths.map(path => ({ path: relative(root, path), content_hash: configHash(readFileSync(path, 'utf8')) })));
}

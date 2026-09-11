import { readFileSync } from 'node:fs';
import { configHash } from '../config/hash.js';

/** Hash the executing implementation, including uncommitted source in dev mode.
 * A git SHA alone would misidentify computations made from a dirty checkout. */
export function scienceImplementation() {
  const extension = import.meta.url.endsWith('.ts') ? '.ts' : '.js';
  const modules = ['scientificAnalysis', 'scientificDataset', 'statistics', 'mixedModel', 'scienceContract', 'evaluationContract', 'positions', 'behavioralAnalysis', 'collective', 'artifactReview'];
  const hashes = Object.fromEntries(modules.map(name => {
    try { return [name, configHash(readFileSync(new URL(`./${name}${extension}`, import.meta.url), 'utf8'))]; }
    catch { return [name, null]; }
  }));
  return { version: 'scientific-engine-v1', modules: hashes, hash: Object.values(hashes).every(Boolean) ? configHash(hashes) : null, node_version: process.version };
}

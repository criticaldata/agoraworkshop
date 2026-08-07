import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { ExperimentConfigSchema, type ExperimentConfig } from './schema.js';
import { canonicalize, configHash, deepFreeze } from './hash.js';

export interface FrozenConfig {
  /** Immutable, validated, defaults-applied experiment configuration. */
  config: ExperimentConfig;
  /** Deterministic sha256 over the canonical serialization of `config`. */
  hash: string;
  /** The canonical JSON that the hash was computed over. */
  canonical: string;
  /** Where this config came from, when it came from disk. */
  sourcePath: string | null;
}

export function freezeConfig(raw: unknown, sourcePath: string | null = null): FrozenConfig {
  const parsed = ExperimentConfigSchema.parse(raw);
  const config = deepFreeze(parsed);
  return {
    config,
    hash: configHash(config),
    canonical: canonicalize(config),
    sourcePath,
  };
}

export function loadConfigFile(path: string): FrozenConfig {
  const text = readFileSync(path, 'utf8');
  const raw = path.endsWith('.json') ? JSON.parse(text) : parseYaml(text);
  return freezeConfig(raw, path);
}

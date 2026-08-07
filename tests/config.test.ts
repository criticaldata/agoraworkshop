import { describe, expect, it } from 'vitest';
import { canonicalize, configHash } from '../src/config/hash.js';
import { freezeConfig } from '../src/config/load.js';
import { ExperimentConfigSchema } from '../src/config/schema.js';
import { baseConfigObject, frozen, tempDb } from './helpers.js';
import { WorkshopRunner } from '../src/orchestrator/runner.js';
import { getRun } from '../src/db/queries.js';

describe('canonical serialization', () => {
  it('is stable regardless of key insertion order', () => {
    const a = canonicalize({ b: 1, a: { d: 2, c: [3, 4] } });
    const b = canonicalize({ a: { c: [3, 4], d: 2 }, b: 1 });
    expect(a).toBe(b);
  });

  it('preserves array order, because ordering is experimentally meaningful', () => {
    expect(canonicalize({ x: [1, 2] })).not.toBe(canonicalize({ x: [2, 1] }));
  });

  it('drops undefined but keeps null, since null is a recorded decision', () => {
    expect(canonicalize({ a: null, b: undefined })).toBe('{"a":null}');
  });
});

describe('config hash', () => {
  it('is identical for two loads of the same config', () => {
    expect(frozen().hash).toBe(frozen().hash);
  });

  it('changes when an experimental parameter changes', () => {
    const base = frozen();
    const changed = freezeConfig(
      baseConfigObject({
        model: { ...(baseConfigObject()['model'] as object), max_output_tokens: 129 },
      }),
    );
    expect(changed.hash).not.toBe(base.hash);
  });

  it('changes when the fault-injection plan changes', () => {
    const withFaults = freezeConfig(
      baseConfigObject({
        fault_injection: {
          enabled: true,
          faults: [
            {
              agent_id: 'agent_1',
              state: 'INTRODUCTION',
              occurrence: 1,
              kind: 'timeout',
              recover_after_attempts: 1,
            },
          ],
        },
      }),
    );
    expect(withFaults.hash).not.toBe(frozen().hash);
  });

  it('is prefixed with the algorithm so it is self-describing', () => {
    expect(frozen().hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('matches a hash computed directly over the parsed config', () => {
    const parsed = ExperimentConfigSchema.parse(baseConfigObject());
    expect(configHash(parsed)).toBe(frozen().hash);
  });
});

describe('config immutability', () => {
  it('rejects mutation of a frozen config', () => {
    const config = frozen().config;
    expect(() => {
      (config.workshop as { topic: string }).topic = 'something else';
    }).toThrow();
  });

  it('rejects mutation of nested structures', () => {
    const config = frozen().config;
    expect(() => {
      (config.participants as unknown as Array<unknown>).push({ id: 'x', display_name: 'X' });
    }).toThrow();
  });

  it('stores an immutable snapshot on the run row that round-trips to the same hash', async () => {
    const db = tempDb();
    const source = frozen();
    const runner = new WorkshopRunner({ db, frozen: source });
    await runner.execute();

    const row = getRun(db, runner.id)!;
    expect(row.config_hash).toBe(source.hash);
    const rehydrated = freezeConfig(JSON.parse(row.config_json));
    expect(rehydrated.hash).toBe(source.hash);
    expect(row.config_canonical).toBe(source.canonical);
  });
});

describe('config validation', () => {
  it('rejects a moderator id that collides with a participant', () => {
    expect(() =>
      freezeConfig(baseConfigObject({ moderator: { id: 'agent_1', display_name: 'M' } })),
    ).toThrow();
  });

  it('rejects a breakout group referencing an unknown agent', () => {
    expect(() =>
      freezeConfig(
        baseConfigObject({
          channels: {
            public: { enabled: true },
            private: {
              enabled: true,
              moderator_observes_private: false,
              breakout_groups: [{ id: 'g', members: ['agent_1', 'ghost'] }],
            },
          },
        }),
      ),
    ).toThrow(/unknown agent/);
  });

  it('rejects an unbounded retry policy', () => {
    expect(() =>
      freezeConfig(
        baseConfigObject({
          runtime: { timeout_seconds: 5, max_retries: 99, retry_backoff_ms: 0 },
        }),
      ),
    ).toThrow();
  });
});

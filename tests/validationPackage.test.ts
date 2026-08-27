import { describe, expect, it } from 'vitest';
import { runValidationPackage } from '../src/scripts/validate.js';
import { tempDb, tempDir } from './helpers.js';

describe('Phase 0.1 validation package', () => {
  it('links context, recovery and backup evidence into the baseline report', async () => {
    const result = await runValidationPackage({
      db: tempDb(),
      configPath: 'configs/agora_phase0_1_mock.yaml',
      faultConfigPath: 'configs/agora_phase0_faultdemo_mock.yaml',
      outDir: tempDir(),
    });

    expect(result.validationSet.phase01?.metrics.map((metric) => [metric.id, metric.status])).toEqual([
      ['M23', 'PASS'],
      ['M24', 'PASS'],
      ['M25', 'PASS'],
      ['M26', 'PASS'],
      ['M27', 'PASS'],
      ['M28', 'PASS'],
      ['M29', 'PASS'],
      ['M30', 'NOT_EXERCISED'],
    ]);
    expect(result.validationSet.phase01?.status).toBe('NOT_EXERCISED');
    expect(result.ready).toBe(false);
  });
});

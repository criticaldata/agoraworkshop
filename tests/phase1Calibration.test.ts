import { describe, expect, it } from 'vitest';
import { ExperimentConfigSchema } from '../src/config/schema.js';
import { calibrationManifest, launchInstructions, providerReadiness } from '../src/phase1/calibration.js';
import { planCampaign, starterInput } from '../src/phase1/campaign.js';
import { frozen } from './helpers.js';

function liveConfig() {
  const plan = planCampaign({ ...starterInput(frozen().config, true), blocks: 10 });
  return ExperimentConfigSchema.parse({ ...plan.cases[1]!.config, model: { ...plan.cases[1]!.config.model, provider: 'nvidia_vllm', model: 'qwen3-32b' } });
}

describe('Phase 1A calibration manifest', () => {
  it('freezes provider, model, topology and instrument hashes without LeoClaw', () => {
    const manifest = calibrationManifest(liveConfig());
    expect(manifest.provider).toBe('nvidia_vllm');
    expect(manifest.model).toBe('qwen3-32b');
    expect(manifest.topology.participants).toHaveLength(5);
    expect(JSON.stringify(manifest).toLowerCase()).not.toContain('leoclaw');
    expect(Object.keys(manifest.instrument_hashes).length).toBeGreaterThan(0);
    expect(launchInstructions(manifest)).toContain('NVIDIA_VLLM_BASE_URL');
  });

  it('blocks live readiness when endpoint credentials are not present', () => {
    const manifest = calibrationManifest(liveConfig());
    expect(providerReadiness(manifest, {})).toBe('BLOCKED_EXTERNAL_LIVE_PROVIDER');
    expect(providerReadiness(manifest, { NVIDIA_VLLM_BASE_URL: 'http://127.0.0.1:18000/v1', NVIDIA_VLLM_API_KEY: 'local-only' })).toBe('AVAILABLE');
  });
});

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SELECTED_REPORT_NOTICE_TIMING } from '../contracts/study.js';
import { buildSyntheticCampaign } from '../manifests/campaign.js';

const outputDirectory = resolve(process.env.PHASE1A_FIXTURE_DIR ?? 'exports/phase1a_wp01_synthetic');
mkdirSync(outputDirectory, { recursive: true });
const campaigns = {
  after_t0_before_public: buildSyntheticCampaign({ report_notice_timing: SELECTED_REPORT_NOTICE_TIMING }),
  before_t0: buildSyntheticCampaign({ report_notice_timing: 'BEFORE_T0' }),
};
for (const [name, campaign] of Object.entries(campaigns)) {
  writeFileSync(resolve(outputDirectory, `${name}.campaign.json`), `${JSON.stringify(campaign, null, 2)}\n`, 'utf8');
}
writeFileSync(resolve(outputDirectory, 'README.txt'), [
  'Offline WP01 synthetic campaign manifests.',
  'These are planning fixtures only: no provider calls, messages, event rows or scientific results are present.',
  'Canonical selected sequence: after_t0_before_public — report notice after all three t0 checkpoints and before public discussion.',
  'Historical noncanonical sequence: before_t0 — retained only as design-decision evidence after Simon Option A.',
  'D13 is confirmed by Simon for Option A; the overall scientific freeze remains pending. D17 is retired.',
].join('\n') + '\n', 'utf8');
console.log(`Generated ${Object.keys(campaigns).length} twelve-run campaign manifests in ${outputDirectory}`);

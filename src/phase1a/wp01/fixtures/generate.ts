import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSyntheticCampaignPair } from './synthetic.js';

const outputDirectory = resolve(process.env.PHASE1A_FIXTURE_DIR ?? 'exports/phase1a_wp01_synthetic');
mkdirSync(outputDirectory, { recursive: true });
const campaigns = buildSyntheticCampaignPair();
for (const [name, campaign] of Object.entries(campaigns)) {
  writeFileSync(resolve(outputDirectory, `${name}.campaign.json`), `${JSON.stringify(campaign, null, 2)}\n`, 'utf8');
}
writeFileSync(resolve(outputDirectory, 'README.txt'), [
  'Offline WP01 synthetic campaign manifests.',
  'These are planning fixtures only: no provider calls, messages, event rows or scientific results are present.',
  'Both report-notice/t0 timing candidates are emitted because D13 remains OPEN; D17 is its retired duplicate label.',
].join('\n') + '\n', 'utf8');
console.log(`Generated ${Object.keys(campaigns).length} twelve-run campaign manifests in ${outputDirectory}`);

import { readFileSync } from 'node:fs';
import { analyzeRun } from './index.js';
import { analyzeReportAnnotations, createReportAnnotationTemplate } from './annotations.js';
import { REPORT_CODEBOOK, REPORT_CODEBOOK_HASH } from './codebook.js';
import type { EvidenceBundle } from '../index.js';

const args = process.argv.slice(2);
const usage = `Usage:
  npm run --silent phase1a:analyze -- <evidence-bundle.json>
  npm run --silent phase1a:analyze -- <evidence-bundle.json> --annotations <annotations.json>
  npm run --silent phase1a:analyze -- --annotation-template <evidence-bundle.json> <coder-id> <coder-id> [more coder IDs]
  npm run --silent phase1a:analyze -- --codebook
Writes operator-scoped JSON to stdout. No model calls or automatic labels.`;
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
try {
  let result: unknown;
  if (args.length === 1 && args[0] === '--help') {
    console.log(usage);
  } else if (args.length === 1 && args[0] === '--codebook') {
    result = { codebook: REPORT_CODEBOOK, codebook_hash: REPORT_CODEBOOK_HASH };
  } else if (args[0] === '--annotation-template' && args.length >= 4) {
    result = createReportAnnotationTemplate(readJson(args[1]!) as EvidenceBundle, args.slice(2));
  } else if ((args.length === 1 || (args.length === 3 && args[1] === '--annotations')) && !args[0]!.startsWith('--')) {
    const bundle = readJson(args[0]!) as EvidenceBundle;
    result = args.length === 1 ? analyzeRun(bundle) : analyzeReportAnnotations(bundle, readJson(args[2]!));
  } else {
    console.error(usage);
    process.exitCode = 1;
  }
  if (result !== undefined) console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(`WP06 analysis failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

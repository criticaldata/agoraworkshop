import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { checkAnnotations, checkRelease, coderPacket, releaseTemplate } from './index.js';
const [command, ...args] = process.argv.slice(2);
const json = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const save = (file: string, value: unknown) => {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
};
const usage = `Annotation workflow (operator-local; no messages or model calls):
  init PLAN OUTPUT_RELEASE
  check PLAN RELEASE
  packet PLAN RELEASE EVIDENCE BLANK_RATING_INVENTORY CODER_ID OUTPUT_PACKET
  analyze PLAN RELEASE EVIDENCE MERGED_ANNOTATIONS OUTPUT_ANALYSIS
Outputs are created privately and never overwrite existing files. Relative calibration references resolve beside RELEASE.
Use the reviewed collection checkout to run experiments; this branch is separate tooling.`;
try {
  if (command === 'init' && args.length === 2) save(args[1]!, releaseTemplate(json(args[0]!)));
  else if (command === 'check' && args.length === 2) {
    const result = checkRelease(json(args[0]!), json(args[1]!), dirname(args[1]!));
    console.log(JSON.stringify(result, null, 2)); if (!result.valid) process.exitCode = 2;
  } else if (command === 'packet' && args.length === 6) save(args[5]!, coderPacket(json(args[0]!), json(args[1]!), json(args[2]!), json(args[3]!), args[4]!, dirname(args[1]!)));
  else if (command === 'analyze' && args.length === 5) save(args[4]!, checkAnnotations(json(args[0]!), json(args[1]!), json(args[2]!), json(args[3]!), dirname(args[1]!)));
  else { console.log(usage); if (command !== '--help') process.exitCode = 1; }
} catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }

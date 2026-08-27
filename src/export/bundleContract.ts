/**
 * The Phase 0 bundle contract: what a validation package must contain, and which file
 * carries it. Gate 1 checks this list against what was actually written, so a bundle
 * that quietly stops emitting one of these fails the gate instead of passing thinner.
 */
export const REQUIRED_BUNDLE_ITEMS: Array<{ item: string; files: string[] }> = [
  { item: 'experiment configuration', files: ['canonical_config.yaml', 'canonical_config.json'] },
  { item: 'config hash', files: ['manifest.json', 'run_metadata.json'] },
  { item: 'code/deployment provenance', files: ['manifest.json', 'run_metadata.json'] },
  { item: 'run metadata', files: ['run_metadata.json'] },
  { item: 'participant/moderator definitions', files: ['agents.json'] },
  { item: 'prompt versions', files: ['run_metadata.json'] },
  { item: 'model parameters', files: ['run_metadata.json'] },
  { item: 'complete structured event log', files: ['events.jsonl'] },
  {
    item: 'public/private message records with visibility metadata',
    files: ['messages.jsonl', 'transcript_public.txt', 'messages_private.jsonl'],
  },
  { item: 'invocation records', files: ['invocations.jsonl'] },
  { item: 'exact context/source-message references per invocation', files: ['invocations.jsonl'] },
  { item: 'auditable context summaries', files: ['summaries.jsonl'] },
  { item: 'tool gateway records', files: ['tool_calls.jsonl'] },
  { item: 'recovery checkpoints', files: ['checkpoints.jsonl'] },
  { item: 'backup/restore verification', files: ['backup_verifications.jsonl'] },
  { item: 'end-to-end trace index', files: ['trace_index.jsonl'] },
  { item: 'infrastructure failures and retries', files: ['failures.jsonl', 'opportunities.jsonl'] },
  { item: 'basic metrics', files: ['analytics.json'] },
  { item: 'Phase 0.1 robustness metrics and semantic review instrument', files: ['phase0_1_report.json', 'semantic_review_rubric.md'] },
  { item: 'acceptance report and live-canary linkage', files: ['acceptance_report.json', 'live_canary_link.json'] },
  { item: 'README/manifest explaining the files', files: ['README.md', 'manifest.json'] },
];

export const REQUIRED_BUNDLE_FILES: string[] = [
  ...new Set(REQUIRED_BUNDLE_ITEMS.flatMap((entry) => entry.files)),
];


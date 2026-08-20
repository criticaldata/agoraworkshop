import { createHash } from 'node:crypto';
import type { ExperimentConfig } from '../config/schema.js';
import type { StoredMessage } from './visibility.js';

export interface ContextSummaryRecord {
  summary_id: string;
  /** A visibility namespace; no record joins sources from different breakout groups. */
  scope: string;
  agent_id: string;
  summarizer_version: string;
  source_message_ids: string[];
  source_hash: string;
  content: string;
  content_hash: string;
  fidelity_hash: string;
}

const sha256 = (value: string): string =>
  `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;

/**
 * Deterministic Phase 0.1 summary contract. It is intentionally extractive: its job is
 * to verify scope, provenance and reproducibility before a model summarizer is trusted.
 */
export function buildContextSummaries(input: {
  config: ExperimentConfig;
  agentId: string;
  messages: StoredMessage[];
  render: (message: StoredMessage) => string;
  opportunityId?: string;
}): ContextSummaryRecord[] {
  const policy = input.config.context_policy.summarization;
  if (!policy?.enabled) return [];

  const grouped = new Map<string, StoredMessage[]>();
  for (const message of input.messages) {
    const scopeKind = message.channel === 'public'
      ? 'public'
      : message.breakout_group_id
        ? 'breakout'
        : 'private';
    if (!policy.scopes.includes(scopeKind)) continue;
    const scope = scopeKind === 'public'
      ? 'public'
      : `${scopeKind}:${message.breakout_group_id ?? 'direct'}:recipient:${input.agentId}`;
    const current = grouped.get(scope) ?? [];
    current.push(message);
    grouped.set(scope, current);
  }

  return [...grouped.entries()].map(([scope, messages]) => {
    const sources = messages.slice(-policy.max_source_messages);
    const sourceIds = sources.map((message) => message.message_id);
    const content = [
      `ROLLING SUMMARY [${scope}] (extractive, ${policy.version})`,
      ...sources.map(input.render),
    ].join('\n');
    const sourceHash = sha256(JSON.stringify(sourceIds));
    const contentHash = sha256(content);
    return {
      summary_id: `summary_${createHash('sha256')
        .update(`${input.opportunityId ?? 'unbound'}\u0000${scope}\u0000${input.agentId}\u0000${policy.version}\u0000${sourceHash}`, 'utf8')
        .digest('hex')}`,
      scope,
      agent_id: input.agentId,
      summarizer_version: policy.version,
      source_message_ids: sourceIds,
      source_hash: sourceHash,
      content,
      content_hash: contentHash,
      fidelity_hash: sha256(`${sourceHash}\u0000${contentHash}\u0000${policy.version}`),
    };
  });
}

export function auditSummaryFidelity(summary: ContextSummaryRecord): boolean {
  return (
    summary.source_hash === sha256(JSON.stringify(summary.source_message_ids)) &&
    summary.content_hash === sha256(summary.content) &&
    summary.fidelity_hash ===
      sha256(`${summary.source_hash}\u0000${summary.content_hash}\u0000${summary.summarizer_version}`)
  );
}

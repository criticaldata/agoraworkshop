import type { ExperimentConfig } from '../config/schema.js';

export interface BudgetSnapshot {
  calls: number;
  tokens: number;
}

export type BudgetCheck =
  | { allowed: true; warning: 'calls' | 'tokens' | null }
  | { allowed: false; exhausted: 'calls' | 'tokens' };

/** Per-agent call and token budgets. Exceeding one is an infrastructure outcome. */
export class BudgetLedger {
  private readonly usage = new Map<string, BudgetSnapshot>();
  private readonly warned = new Set<string>();

  constructor(private readonly config: ExperimentConfig) {}

  snapshot(agentId: string): BudgetSnapshot {
    return this.usage.get(agentId) ?? { calls: 0, tokens: 0 };
  }

  check(agentId: string): BudgetCheck {
    const { max_calls_per_agent, max_tokens_per_agent, warning_threshold } = this.config.budgets;
    const used = this.snapshot(agentId);

    if (used.calls >= max_calls_per_agent) return { allowed: false, exhausted: 'calls' };
    if (used.tokens >= max_tokens_per_agent) return { allowed: false, exhausted: 'tokens' };

    let warning: 'calls' | 'tokens' | null = null;
    if (!this.warned.has(agentId)) {
      if (used.calls + 1 >= max_calls_per_agent * warning_threshold) warning = 'calls';
      else if (used.tokens >= max_tokens_per_agent * warning_threshold) warning = 'tokens';
      if (warning) this.warned.add(agentId);
    }
    return { allowed: true, warning };
  }

  recordCall(agentId: string, tokens: number): void {
    const used = this.snapshot(agentId);
    this.usage.set(agentId, { calls: used.calls + 1, tokens: used.tokens + tokens });
  }

  restore(snapshots: Record<string, BudgetSnapshot>): void {
    for (const [agentId, snapshot] of Object.entries(snapshots)) {
      this.usage.set(agentId, { calls: snapshot.calls, tokens: snapshot.tokens });
    }
  }

  all(): Record<string, BudgetSnapshot> {
    return Object.fromEntries(this.usage);
  }
}

import type { Db } from '../db/index.js';
import { getInvocations, getMessages, getOpportunities, getRun } from '../db/queries.js';
import { participantSystemPrompt } from '../prompts/registry.js';
import { auditPrivacyLeaks } from '../acceptance/privacy.js';
import { campaign, usage, type PlannedCase } from './campaign.js';
import { behavioralMeasures } from './behavioralAnalysis.js';
import { positionRows } from './positions.js';
import { isVisibleTo } from '../orchestrator/visibility.js';
import type { AgentInvocationRequest } from '../providers/types.js';
import { auditCollective, collectiveRecords } from './collective.js';
import { closureGates } from './closure.js';

const VERSION = 'phase1a-descriptive-v1';
function ratio(numerator: number, denominator: number, source_ids: string[], exclusions: string) {
  return { version: VERSION, numerator, denominator, value: denominator ? numerator / denominator : null, availability: denominator ? 'available' : 'unavailable', source_ids, exclusions };
}

export function caseMeasures(db: Db, c: PlannedCase, runId: string | null) {
  const messages = runId ? getMessages(db, runId) : [], opportunities = runId ? getOpportunities(db, runId) : [], invocations = runId ? getInvocations(db, runId) : [];
  const participants = messages.filter(m => c.config.participants.some(p => p.id === m.sender_agent_id));
  return { version: VERSION, case_id: c.id, run_id: runId, availability: runId ? 'recorded' : 'not_started',
    by_agent: c.config.participants.map(p => {
      const own = participants.filter(m => m.sender_agent_id === p.id), calls = invocations.filter(i => i.agent_id === p.id);
      return { agent_id: p.id, evaluator_target_role: c.targets[p.id],
        breakout_group: c.config.channels.private.breakout_groups.find(g => g.members.includes(p.id))?.id ?? null,
        participant_index: c.config.participants.findIndex(a => a.id === p.id),
        contribution_share: ratio(own.length, participants.length, participants.map(m => m.message_id), 'Moderator excluded. Successful participant messages only; fixed scheduling constrains counts.'),
        public_share: ratio(own.filter(m => m.channel === 'public').length, own.length, own.map(m => m.message_id), 'Within this participant; excludes missing responses and abstentions.'),
        character_share: ratio(own.reduce((n, m) => n + m.content.length, 0), participants.reduce((n, m) => n + m.content.length, 0), participants.map(m => m.message_id), 'UTF-16 code units, not tokens or social influence; moderator excluded.'),
        reported_tokens: { version: VERSION, input: calls.some(i => i.input_tokens === null) || !calls.length ? null : calls.reduce((n, i) => n + i.input_tokens!, 0), output: calls.some(i => i.output_tokens === null) || !calls.length ? null : calls.reduce((n, i) => n + i.output_tokens!, 0), missing_calls: calls.filter(i => i.input_tokens === null || i.output_tokens === null).length, source_ids: calls.map(i => i.invocation_id) },
        scopes: [...new Set(opportunities.filter(o => o.agent_id === p.id).map(o => `${o.workshop_state}:${o.channel}`))].map(scope => {
          const os = opportunities.filter(o => o.agent_id === p.id && `${o.workshop_state}:${o.channel}` === scope);
          const available = os.filter(o => o.behaviourally_available === 1), successful = os.filter(o => o.resolution === 'success');
          return { scope, scheduled: os.length, outcomes: Object.fromEntries([...new Set(os.map(o => o.resolution ?? 'pending'))].map(r => [r, os.filter(o => (o.resolution ?? 'pending') === r).length])),
            participation: ratio(successful.length, available.length, os.map(o => o.opportunity_id), 'Infrastructure-adjusted: successful responses / behaviourally available opportunities.'),
            opportunities: os.map(o => ({ id: o.opportunity_id, sequence: o.sequence, round_index: o.round_index, resolution: o.resolution, attempts: o.attempts, failure_category: o.failure_category })) };
        }),
        invocation_observations: calls.map(i => ({ id: i.invocation_id, latency_ms: i.latency_ms, attempt: i.attempt, provider: i.provider, requested_model: i.requested_model, responded_model: i.responded_model, outcome: i.outcome })),
      };
    }),
  };
}

export function campaignAnalysis(db: Db, id: string) {
  const { row, plan, cases } = campaign(db, id);
  const measures = plan.cases.map(c => caseMeasures(db, c, cases.find(r => r.case_id === c.id)!.run_id));
  const behavioral = plan.cases.map(c => ({ case_id: c.id, ...behavioralMeasures(db, id, c, cases.find(r => r.case_id === c.id)!.run_id) }));
  const annotations = db.prepare('SELECT run_id, message_id FROM phase1_annotations WHERE campaign_id = ?').all(id) as { run_id: string; message_id: string }[];
  const checks: { id: string; status: 'PASS' | 'FAIL' | 'NOT_EXERCISED'; note: string }[] = [
    { id: 'P1A-FROZEN', status: 'PASS', note: `Manifest ${row.manifest_hash} verified against frozen inputs.` },
    { id: 'P1A-COMPARABLE', status: plan.comparisons.every(c => c.valid) ? 'PASS' : 'FAIL', note: 'Only condition and assigned role fields may differ.' },
    { id: 'P1A-COMPLETED', status: cases.every(c => c.state === 'completed') ? 'PASS' : 'NOT_EXERCISED', note: 'All predeclared cases must complete; failures and unstarted cases remain in the denominator.' },
  ];
  for (const c of cases) {
    const planned = plan.cases.find(p => p.id === c.case_id)!;
    const calls = c.run_id ? getInvocations(db, c.run_id).filter(i => i.agent_id !== planned.config.moderator.id) : [];
    checks.push({ id: `P1A-PROMPTS:${c.case_id}`, status: !calls.length ? 'NOT_EXERCISED' : calls.every(i => i.system_prompt === participantSystemPrompt(planned.config, i.agent_id).text) ? 'PASS' : 'FAIL', note: 'Recorded participant system prompts equal the frozen resolver.' });
    checks.push({ id: `P1A-VISIBILITY:${c.case_id}`, status: !c.run_id || !calls.length ? 'NOT_EXERCISED' : auditPrivacyLeaks(db, c.run_id).violations.length ? 'FAIL' : 'PASS', note: 'Reuse the existing context-visibility audit; not a claim about generated disclosure.' });
    checks.push({ id: `P1A-DELIVERY:${c.case_id}`, status: !calls.length ? 'NOT_EXERCISED' : calls.some(i => i.outcome !== 'success') ? 'FAIL' : 'PASS', note: 'Any provider failure is visible; a completed run does not imply every call succeeded.' });
    if (planned.config.phase1?.evaluation) {
      const probes = c.run_id ? positionRows(db, c.run_id) : [];
      checks.push({ id: `P1A-POSITIONS:${c.case_id}`, status: probes.length === 10 && probes.every(r => r.status === 'valid') ? 'PASS' : 'NOT_EXERCISED', note: 'Ten schema-valid assessment records required; no requirement for a nonzero position change.' });
      const history = c.run_id ? getMessages(db, c.run_id) : [];
      const contextOkay = probes.every(r => {
        if (!r.request_json) return false;
        const request = (JSON.parse(r.request_json) as { request: AgentInvocationRequest }).request;
        const ids = request.contextMessageIds ?? [];
        return request.system === participantSystemPrompt(planned.config, r.agent_id).text &&
          (r.phase !== 'initial' || ids.length === 0) && ids.every(id => { const m = history.find(m => m.message_id === id); return !!m && isVisibleTo(planned.config, m, r.agent_id); });
      });
      checks.push({ id: `P1A-PROBE-CONTEXT:${c.case_id}`, status: !probes.length ? 'NOT_EXERCISED' : contextOkay ? 'PASS' : 'FAIL', note: 'Initial assessments contain no peer history; final assessment sources must be authorized workshop records. Probe system prompts use only the assigned role.' });
    }
  }
  const pairs = plan.comparisons.map((_comparison, i) => {
    const pair_id = `block-${i + 1}`, planned = plan.cases.filter(c => c.pair_id === pair_id);
    const complete = planned.every(p => cases.find(c => c.case_id === p.id)?.state === 'completed');
    const control = measures.find(m => m.case_id === planned.find(p => p.condition === 'control')!.id)!;
    const treatment = measures.find(m => m.case_id === planned.find(p => p.condition === 'treatment')!.id)!;
    const controlBehavior = behavioral.find(m => m.case_id === control.case_id)!;
    const treatmentBehavior = behavioral.find(m => m.case_id === treatment.case_id)!;
    const delta = (a: number | null | undefined, b: number | null | undefined) => complete && a != null && b != null ? b - a : null;
    const behavioralDifference = controlBehavior.availability === 'configured' && treatmentBehavior.availability === 'configured' ? {
      initial_final_change: delta(controlBehavior.initial_final_change.value, treatmentBehavior.initial_final_change.value),
      per_reviewer: [...new Set([...controlBehavior.reviewers.map(r => r.author), ...treatmentBehavior.reviewers.map(r => r.author)])].map(author => {
        const a = controlBehavior.reviewers.find(r => r.author === author), b = treatmentBehavior.reviewers.find(r => r.author === author);
        return { author, interaction_contingency: delta(a?.interaction_contingency.value, b?.interaction_contingency.value), direct_reply: delta(a?.direct_reply.value, b?.direct_reply.value), argument_uptake: delta(a?.argument_uptake.value, b?.argument_uptake.value),
          role_fidelity: planned[0]!.config.participants.map(p => ({ agent_id: p.id, treatment_minus_control: delta(a?.role_fidelity.find(r => r.agent_id === p.id)?.value, b?.role_fidelity.find(r => r.agent_id === p.id)?.value) })) };
      }),
    } : null;
    return { pair_id, case_ids: planned.map(p => p.id), availability: complete ? 'complete_case_descriptive' : 'incomplete',
      behavioral_treatment_minus_control: behavioralDifference,
      contribution_share_differences: treatment.by_agent.map(t => { const controlValue = control.by_agent.find(a => a.agent_id === t.agent_id)!.contribution_share.value; return { agent_id: t.agent_id, treatment_minus_control: complete && t.contribution_share.value !== null && controlValue !== null ? t.contribution_share.value - controlValue : null }; }),
    };
  });
  const collective = plan.input.canonical ? cases.map(c => ({ case_id: c.case_id, run_id: c.run_id,
    records: c.run_id ? collectiveRecords(db, c.run_id) : null,
    audit: c.run_id ? auditCollective(db, plan.cases.find(p => p.id === c.case_id)!.config, c.run_id) : { complete: false, verified: false, issues: ['Not started'] },
  })) : [];
  for (const c of collective) checks.push({ id: `P1A-CANONICAL:${c.case_id}`, status: !c.run_id ? 'NOT_EXERCISED' : c.audit.complete && c.audit.verified ? 'PASS' : 'FAIL', note: c.audit.issues.join('; ') || 'Eight stages complete; sealed ballots and deterministic final artifact verified.' });
  return { version: VERSION, campaign_id: id, state: row.state,
    collective, closure: closureGates(db, id, checks, collective.map(c => c.audit)),
    denominators: { planned: cases.length, executed: cases.filter(c => c.run_id).length, completed: cases.filter(c => c.state === 'completed').length, failed: cases.filter(c => c.state === 'failed').length, interrupted: cases.filter(c => c.state === 'interrupted').length, budget_skipped: cases.filter(c => c.state === 'budget_skipped').length, annotated_runs: new Set(annotations.map(a => a.run_id)).size, annotated_messages: new Set(annotations.map(a => a.message_id)).size, annotation_records: annotations.length },
    status: { engineering_verified: false, runtime_checks_passed: checks.every(c => c.status === 'PASS'), live_executed: cases.some(c => c.run_id && !['mock', 'mock_context_contract'].includes(getRun(db, c.run_id)!.provider) && getInvocations(db, c.run_id).some(i => ['openai', 'anthropic', 'nvidia_vllm'].includes(i.provider))), human_annotated: annotations.length > 0, scientific_analysis_completed: false },
    status_note: 'Runtime checks are not a release certificate. Engineering verification requires the test/build evidence in docs/phase1/REVIEW.md. Scientific outcomes require reviewed labels and a separately specified analysis plan.',
    checks, usage: usage(db, id), cases: measures, behavioral, pairs,
    limitations: ['Run/block is the experimental unit, not independent messages.', 'Complete-case comparisons can be selection-biased; inspect partial cases and failures.', 'Counts and delivery are not persuasion, agreement or power.', 'No annotations means unavailable scientific outcomes, not zero agreement.', 'Role targets are evaluator-only. Readers can infer conditions from text; blinding is not guaranteed.'],
  };
}

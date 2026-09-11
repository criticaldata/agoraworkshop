import type { Db } from '../db/index.js';
import { campaign } from './campaign.js';
import { getMessages, getInvocations, getOpportunities, getRun } from '../db/queries.js';
import { allAnnotations, annotationKey, wasExposed, type AnnotationRecord } from '../semantic/phase1Annotations.js';
import { effectiveAnnotations, behavioralMeasures } from './behavioralAnalysis.js';
import { positionRows, parsePosition, positionInstruction } from './positions.js';
import { auditCollective, ballotRows, collectiveRecords, parseBallot } from './collective.js';
import { participantSystemPrompt } from '../prompts/registry.js';
import { auditPrivacyLeaks } from '../acceptance/privacy.js';
import { configHash, canonicalize } from '../config/hash.js';
import { krippendorffAlpha, mean } from './statistics.js';
import { campaignLock, saveScienceSnapshot, lockDataset } from './scienceStore.js';
import { codeProvenance } from '../core/provenance.js';
import { closureEvidence } from './closure.js';
import { scienceImplementation } from './scienceProvenance.js';
import { assembleContext } from '../orchestrator/context.js';
import { readScienceSnapshot, initializeScience } from './scienceStore.js';
import type { AgentInvocationRequest, AgentInvocationResult } from '../providers/types.js';
import { artifactReviews } from './artifactReview.js';
import { reviewWorkspaceAnnotations } from './reviewWorkspace.js';
import { calibrationOutcomeRegistry, RF_ICR_ALPHA_THRESHOLD, RF_ICR_MIN_COVERAGE, RF_ICR_MIN_PAIRABLE_UNITS } from './reliability.js';

interface CodingUnit {
  key: string; run_id: string; message_id: string; agent_id: string; group: string;
  category: 'role_criterion' | 'interaction_contingency'; criterion_id?: string; weight: number;
}
const codingValue = (r: AnnotationRecord): number | null => r.data.label === 'scored' ? r.data.score ?? null : r.data.label === 'present' ? 1 : r.data.label === 'absent' ? 0 : null;

export function scientificDataset(db: Db, campaignId: string) {
  initializeScience(db);
  const frozen = campaign(db, campaignId), { plan, cases } = frozen;
  const analysisPlan = plan.input.analysis_plan;
  if (!analysisPlan || !plan.input.evaluation) throw new Error('Freeze a versioned analysis plan and evaluation before building scientific datasets');
  const artifactReadings = artifactReviews(db, campaignId);
  // Normalize only for the shared resolution engine. Original typed artifact
  // readings are retained separately and never enter participant behavior scores.
  const normalizedArtifacts: AnnotationRecord[] = artifactReadings.map(r => ({ id: r.id, created_at: r.created_at, data: {
    run_id: r.data.run_id, message_id: `artifact:${r.data.run_id}`, author: r.data.author, annotator_type: 'human', rubric_version: r.data.rubric_version,
    category: 'role_criterion', criterion_id: `artifact:${r.data.criterion_id}`, label: r.data.score === null ? 'not_assessable' : 'scored', score: r.data.score,
    quote: r.data.quote, reason: r.data.reason, ...(r.data.supersedes ? { supersedes: r.data.supersedes } : {}), ...(r.data.adjudicates ? { adjudicates: r.data.adjudicates } : {}),
  } }));
  const annotations = [...allAnnotations(db, campaignId), ...reviewWorkspaceAnnotations(db, campaignId), ...normalizedArtifacts], effective = effectiveAnnotations(annotations);
  const instrument = { roles: { ...plan.input.role_pack, status: undefined }, evaluation: { ...plan.input.evaluation, status: undefined }, canonical: plan.input.canonical, artifact_rubric: analysisPlan.artifact_rubric ?? null };
  const instrumentHash = configHash(instrument);
  const calibrationRow = analysisPlan.calibration_snapshot_hash ? db.prepare("SELECT id FROM phase1_science_snapshots WHERE content_hash = ? AND kind = 'dataset'").get(analysisPlan.calibration_snapshot_hash) as { id: string } | undefined : undefined;
  const calibration = calibrationRow ? readScienceSnapshot(db, calibrationRow.id).payload as {
    version: string; campaign_id: string; analysis_plan: { purpose: string }; instrument_hash: string;
    reliability: { group: string; alpha: number | null; pairable_units: number; coverage: number | null }[];
    source_runs: { run: { provider: string } | null }[];
  } : null;
  const reviewers = analysisPlan.reliability?.reviewers ?? [...new Set(annotations.filter(r => !r.data.adjudicates?.length && !r.data.supersedes).map(r => r.data.author))].sort();
  const units: CodingUnit[] = [];
  const sourceRuns = cases.map(c => {
    const planned = plan.cases.find(p => p.id === c.case_id)!;
    const messages = c.run_id ? getMessages(db, c.run_id) : [], peers = messages.filter(m => planned.config.participants.some(p => p.id === m.sender_agent_id));
    for (const message of peers) {
      const role = planned.targets[message.sender_agent_id]!;
      if (analysisPlan.role_stage_window.includes(message.workshop_state as typeof analysisPlan.role_stage_window[number])) for (const criterion of plan.input.evaluation!.role_criteria[role]!) {
        units.push({ key: JSON.stringify([message.message_id, 'role_criterion', criterion.id, '', '']), run_id: c.run_id!, message_id: message.message_id, agent_id: message.sender_agent_id, group: `role:${role}:${criterion.id}`, category: 'role_criterion', criterion_id: criterion.id, weight: criterion.weight });
      }
      if (message.workshop_state !== 'INTRODUCTION' && peers.some(p => p.sender_agent_id !== message.sender_agent_id && wasExposed(db, message, p))) units.push({ key: JSON.stringify([message.message_id, 'interaction_contingency', '', '', '']), run_id: c.run_id!, message_id: message.message_id, agent_id: message.sender_agent_id, group: 'interaction_contingency', category: 'interaction_contingency', weight: 1 });
    }
    const collective = c.run_id ? collectiveRecords(db, c.run_id) : null;
    if (c.run_id && collective?.output && analysisPlan.artifact_rubric) for (const criterion of analysisPlan.artifact_rubric.criteria) units.push({
      key: JSON.stringify([`artifact:${c.run_id}`, 'role_criterion', `artifact:${criterion.id}`, '', '']), run_id: c.run_id, message_id: `artifact:${c.run_id}`, agent_id: 'system_artifact', group: `artifact:${criterion.id}`, category: 'role_criterion', criterion_id: `artifact:${criterion.id}`, weight: criterion.weight,
    });
    return { case: c, planned, run: c.run_id ? getRun(db, c.run_id) : null, messages,
      invocations: c.run_id ? getInvocations(db, c.run_id) : [], opportunities: c.run_id ? getOpportunities(db, c.run_id) : [],
      positions: c.run_id ? positionRows(db, c.run_id) : [], ballots: c.run_id ? ballotRows(db, c.run_id) : [],
      collective,
      events: c.run_id ? db.prepare('SELECT * FROM events WHERE run_id = ? ORDER BY sequence').all(c.run_id) : [],
    };
  });

  const resolved = units.map(unit => {
    const matching = annotations.filter(r => annotationKey(r.data) === unit.key);
    // Reliability uses first independent submissions, never adjudicated or revised
    // consensus. Duplicate initial submissions remain a conflict, not cherry-picked.
    const originals = reviewers.map(author => {
      const rows = matching.filter(r => r.data.author === author && !r.data.supersedes && !r.data.adjudicates?.length);
      return rows.length === 1 ? rows[0]! : null;
    });
    const active = effective.usable.filter(r => annotationKey(r.data) === unit.key);
    const independent = reviewers.map(author => {
      const rows = active.filter(r => r.data.author === author && !r.data.adjudicates?.length);
      return rows.length === 1 ? rows[0]! : null;
    });
    const present = independent.filter((r): r is AnnotationRecord => !!r);
    const adjudications = active.filter(r => r.data.adjudicates?.length);
    const validAdjudications = adjudications.filter(r => reviewers.length >= 2 && present.length === reviewers.length && present.every(p => r.data.adjudicates!.includes(p.id)) && !reviewers.includes(r.data.author));
    const signatures = present.map(r => canonicalize({ value: codingValue(r), label: r.data.label, relation: r.data.relation ?? null }));
    let selected: AnnotationRecord | null = null, reason: string | null = null;
    if (reviewers.length < 2 || present.length !== reviewers.length) reason = 'incomplete_independent_review';
    else if (adjudications.length) {
      if (adjudications.length === 1 && validAdjudications.length === 1) selected = validAdjudications[0]!;
      else reason = 'ambiguous_or_incomplete_adjudication';
    } else if (new Set(signatures).size === 1) selected = present[0]!;
    else reason = 'unresolved_reviewer_disagreement';
    const value = selected ? codingValue(selected) : null;
    if (selected && value === null) reason = 'not_assessable';
    return { ...unit, value, reason, selected_annotation_id: selected?.id ?? null,
      independent_annotation_ids: originals.map(r => r?.id ?? null), independent_values: originals.map(r => r ? codingValue(r) : null),
      independent_relations: originals.map(r => r?.data.label === 'present' ? r.data.relation ?? null : null),
      adjudication_ids: adjudications.map(r => r.id),
      reviewer_values: Object.fromEntries(reviewers.map((author, i) => [author, originals[i] ? codingValue(originals[i]!) : null])),
    };
  });
  const expectedGroups = [...Object.entries(plan.input.evaluation.role_criteria).flatMap(([role, criteria]) => criteria.map(c => `role:${role}:${c.id}`)), 'interaction_contingency', ...(analysisPlan.artifact_rubric?.criteria.map(c => `artifact:${c.id}`) ?? [])];
  const reliability = expectedGroups.map(group => {
    const groupUnits = resolved.filter(u => u.group === group);
    const ordinal = group !== 'interaction_contingency';
    const result = krippendorffAlpha(groupUnits.map(u => u.independent_values), ordinal ? 'ordinal' : 'nominal', ordinal ? [0, 1, 2] : [0, 1]);
    const config = analysisPlan.reliability, threshold = config?.thresholds[group] ?? null;
    const coverage = groupUnits.length ? result.pairable_units / groupUnits.length : null;
    return { group, ...result, coverage, threshold,
      passed: config !== null && threshold !== null && result.alpha !== null && result.alpha >= threshold && result.pairable_units >= config.min_pairable_units && coverage !== null && coverage >= config.min_coverage,
      unit_ids: groupUnits.map(u => u.key), annotation_ids: groupUnits.flatMap(u => u.independent_annotation_ids.filter((id): id is string => id !== null)) };
  });
  const relations = resolved.filter(u => u.category === 'interaction_contingency');
  const relationReliability = krippendorffAlpha(relations.map(u => u.independent_relations), 'nominal', ['supports', 'challenges', 'extends', 'rejects', 'revises']);
  const outcomes = sourceRuns.map(source => {
    const { planned, case: c } = source, own = resolved.filter(u => u.run_id === c.run_id);
    const rf = (author?: string) => {
      const perAgent = planned.config.participants.map(p => {
        const criteria = plan.input.evaluation!.role_criteria[planned.targets[p.id]!]!;
        const scores = criteria.map(criterion => {
          const rows = own.filter(u => u.category === 'role_criterion' && u.agent_id === p.id && u.criterion_id === criterion.id);
          const values = rows.map(u => author ? u.reviewer_values[author] ?? null : u.value);
          return { criterion_id: criterion.id, weight: criterion.weight, expected: rows.length, available: values.filter(v => v !== null).length,
            value: values.length && values.every((v): v is number => v !== null) ? mean(values)! / 2 : null };
        });
        return { agent_id: p.id, criteria: scores, value: scores.every(s => s.value !== null) ? scores.reduce((n, s) => n + s.weight * s.value!, 0) / scores.reduce((n, s) => n + s.weight, 0) : null };
      });
      return { by_agent: perAgent, value: perAgent.every(p => p.value !== null) ? mean(perAgent.map(p => p.value!)) : null };
    };
    const icr = (author?: string) => {
      const rows = own.filter(u => u.category === 'interaction_contingency'), values = rows.map(u => author ? u.reviewer_values[author] ?? null : u.value);
      return { denominator: rows.length, assessed: values.filter(v => v !== null).length, value: values.length && values.every((v): v is number => v !== null) ? mean(values) : null };
    };
    const behavior = behavioralMeasures(db, campaignId, planned, c.run_id);
    const integrityIssues: string[] = [];
    if (!c.run_id) integrityIssues.push('not_executed');
    else {
      if (source.run?.config_hash !== planned.config_hash) integrityIssues.push('config_mismatch');
      if (source.invocations.some(i => i.agent_id !== planned.config.moderator.id && i.system_prompt !== participantSystemPrompt(planned.config, i.agent_id).text)) integrityIssues.push('prompt_mismatch');
      if (auditPrivacyLeaks(db, c.run_id).violations.length) integrityIssues.push('privacy_failure');
      if (source.opportunities.some(o => o.resolution === null)) integrityIssues.push('unresolved_opportunities');
      const dialogue = source.messages.filter(m => m.workshop_state !== 'CLOSING');
      for (const row of source.positions) if (row.status === 'valid') {
        try {
          const request = (JSON.parse(row.request_json!) as { request: AgentInvocationRequest }).request;
          const response = JSON.parse(row.response_json!) as AgentInvocationResult;
          const context = assembleContext({ config: planned.config, history: row.phase === 'initial' ? [] : dialogue, agentId: row.agent_id, state: row.phase === 'initial' ? 'INTRODUCTION' : 'FINAL_DISCUSSION', channel: 'public', roundIndex: 0, totalRounds: 1, opportunityId: row.record_id, instructionOverride: positionInstruction(planned.config) });
          if (request.configHash !== planned.config_hash || request.system !== context.systemPrompt || canonicalize(request.messages) !== canonicalize(context.renderedMessages) || canonicalize(request.contextMessageIds) !== canonicalize(context.includedMessageIds) || !response.ok || response.usage.inputTokens === null || response.usage.outputTokens === null || configHash(parsePosition(response.content ?? '', planned.config)) !== configHash(JSON.parse(row.value_json!))) integrityIssues.push(`assessment_integrity:${row.record_id}`);
        } catch { integrityIssues.push(`assessment_integrity:${row.record_id}`); }
      }
      // A missing S7 ballot does not erase otherwise valid S1–S6 endpoints.
    }
    if (c.state !== 'completed') integrityIssues.push('run_not_completed');
    const retryCount = source.invocations.filter(i => i.attempt > 1).length;
    const eligible = integrityIssues.length === 0 && (retryCount === 0 || analysisPlan.retain_successful_retries === true);
    const finals = source.positions.filter(p => p.phase === 'final');
    const alignment: number[] = [];
    for (const ballot of source.ballots) if (ballot.status === 'valid') {
      const final = finals.find(p => p.agent_id === ballot.agent_id && p.status === 'valid');
      if (final?.value_json) for (const vote of parseBallot(ballot.value_json!, planned.config).ballots) {
        const answer = (JSON.parse(final.value_json) as { answers: { question_id: string; choice: string }[] }).answers.find(a => a.question_id === vote.question_id);
        alignment.push(Number(answer && vote.choice === answer.choice));
      }
    }
    const artifact = source.collective?.output?.artifact;
    const completeVote = artifact?.valid_ballots === 5;
    const artifactAudit = c.run_id ? auditCollective(db, planned.config, c.run_id) : null;
    const fidelity = rf(), contingency = icr();
    const artifactUnits = own.filter(u => u.group.startsWith('artifact:'));
    const metrics: Record<string, number | null> = {
      role_fidelity: fidelity.value, interaction_contingency: contingency.value,
      participation: behavior.availability === 'configured' ? behavior.participation_inequality.gini : null,
      initial_final_change: behavior.availability === 'configured' ? behavior.initial_final_change.value : null,
      voting_alignment: alignment.length === 5 * plan.input.evaluation!.questionnaire.questions.length ? mean(alignment) : null,
      vote_unanimity: completeVote ? mean(artifact!.decisions.map(d => Number(d.counts.some(c => c.votes === 5)))) : null,
      minority_preservation: completeVote && artifactAudit?.verified ? 1 : null,
      final_output_fidelity: artifact ? Number(artifactAudit?.verified === true) : null,
      final_output_quality: artifactUnits.length && artifactUnits.every(u => u.value !== null) ? artifactUnits.reduce((n, u) => n + u.weight * u.value! / 2, 0) / artifactUnits.reduce((n, u) => n + u.weight, 0) : null,
    };
    const discussionComplete = source.collective?.stages.filter(s => ['S2', 'S3', 'S4', 'S5'].includes(s.id)).every(s => s.record?.status === 'complete') === true;
    if (!discussionComplete) { metrics.interaction_contingency = null; metrics.participation = null; }
    const stageForState = { PUBLIC_DISCUSSION: 'S2', PRIVATE_OR_BREAKOUT: 'S3', PUBLIC_RECONVENING: 'S4', FINAL_DISCUSSION: 'S5' };
    if (!analysisPlan.role_stage_window.every(state => source.collective?.stages.find(s => s.id === stageForState[state])?.record?.status === 'complete')) metrics.role_fidelity = null;
    return { case_id: c.case_id, run_id: c.run_id, pair_id: planned.pair_id, condition: planned.condition, state: c.state,
      eligible, exclusion_reasons: [...integrityIssues, ...(retryCount && analysisPlan.retain_successful_retries !== true ? ['retry_policy_excludes_or_unresolved'] : [])],
      retry_attempts: retryCount, infrastructure_failures: source.opportunities.filter(o => o.resolution === 'infrastructure_failure').length,
      metrics, role_fidelity: fidelity, interaction_contingency: contingency,
      reviewer_sensitivity: reviewers.map(author => ({ author, role_fidelity: rf(author).value, interaction_contingency: icr(author).value })),
      missingness: { positions: source.positions.map(p => ({ id: p.record_id, phase: p.phase, status: p.status, reason: p.error })),
        expected_positions: 10, unrecorded_positions: 10 - source.positions.length,
        ballots: source.ballots.map(b => ({ id: b.record_id, status: b.status, reason: b.error })),
        annotations: own.filter(u => u.value === null).map(u => ({ unit: u.key, reason: u.reason })) },
    };
  });
  const endpointIds = [...plan.input.evaluation.primary_outcomes, ...(plan.input.evaluation.secondary_outcomes ?? [])];
  const annotationEndpoints = endpointIds.filter(e => ['role_fidelity', 'interaction_contingency', 'final_output_quality'].includes(e));
  const requiredReliability = reliability.filter(r => r.group.startsWith('role:') ? annotationEndpoints.includes('role_fidelity') : r.group.startsWith('artifact:') ? annotationEndpoints.includes('final_output_quality') : annotationEndpoints.includes('interaction_contingency'));
  const calibrationReliability = calibration && analysisPlan.reliability ? requiredReliability.every(required => {
    const prior = calibration.reliability.find(r => r.group === required.group), threshold = analysisPlan.reliability!.thresholds[required.group];
    return threshold !== undefined && prior?.alpha != null && prior.alpha >= threshold && prior.pairable_units >= analysisPlan.reliability!.min_pairable_units && prior.coverage !== null && prior.coverage >= analysisPlan.reliability!.min_coverage;
  }) : false;
  return { version: 'agora-scientific-dataset-v1' as const, campaign_id: campaignId, manifest_hash: frozen.row.manifest_hash,
    manifest: plan, analysis_plan: analysisPlan, source_provenance: codeProvenance(), implementation: scienceImplementation(),
    instrument_hash: instrumentHash,
    source_runs: sourceRuns, annotations, artifact_reviews: artifactReadings, coding_units: resolved, reviewer_identities: reviewers,
    reliability_contract: {
      version: 'agora-reliability-contract-v1',
      rf_icr_alpha_threshold: RF_ICR_ALPHA_THRESHOLD,
      rf_icr_min_pairable_units: RF_ICR_MIN_PAIRABLE_UNITS,
      rf_icr_min_coverage: RF_ICR_MIN_COVERAGE,
      outcome_registry: calibrationOutcomeRegistry(),
      adjudication_after_independent_labels: true,
      reliability_is_not_construct_validity: true,
    },
    annotation_conflicts: effective.conflicts, reliability, relation_reliability: relationReliability, outcomes,
    gates: {
      annotation_coverage_complete: outcomes.every(o => annotationEndpoints.every(e => o.metrics[e] !== null)),
      reliability_satisfied: requiredReliability.length > 0 && requiredReliability.every(r => r.passed),
      comparability: plan.comparisons.every(p => p.valid),
      calibration_verified: !!calibration && calibration.version === 'agora-scientific-dataset-v1' && campaignLock(db, calibration.campaign_id) === calibrationRow!.id && calibration.analysis_plan.purpose === 'calibration' && calibration.instrument_hash === instrumentHash && calibrationReliability && calibration.source_runs.length > 0 && calibration.source_runs.every(s => !!s.run && !['mock', 'mock_context_contract'].includes(s.run.provider)),
      canonical_protocol_complete: sourceRuns.every(s => !!s.case.run_id && auditCollective(db, s.planned.config, s.case.run_id).complete && auditCollective(db, s.planned.config, s.case.run_id).verified),
    },
    closure_evidence: closureEvidence(db, campaignId),
    limitations: ['Self-declared reviewer identities; independent first submissions are not proof of real-world blinding.', 'Reliability is calculated before adjudication, per role/criterion and ICR category; undefined coefficients do not pass.', 'Minority preservation and final-output fidelity are structural audits, not human-rated deliberative quality.', 'Missing measurements are unavailable, not zero. Run/block—not message—is the inference unit.'],
  };
}
export type ScientificDataset = ReturnType<typeof scientificDataset>;

export function lockScientificDataset(db: Db, id: string) {
  return db.transaction(() => {
    const previous = campaignLock(db, id);
    if (previous) throw new Error(`Dataset already locked: ${previous}`);
    const c = campaign(db, id);
    if (c.row.owner_pid || c.cases.some(c => ['pending', 'running'].includes(c.state))) throw new Error('Finish or explicitly resolve all planned cases before locking');
    const dataset = scientificDataset(db, id), locked = lockDataset(db, id, dataset), saved = saveScienceSnapshot(db, id, 'dataset', dataset);
    db.prepare('INSERT INTO phase1_annotation_locks VALUES (?, ?)').run(id, saved.id);
    return { ...saved, snapshot_id: locked.id, canonical_hash: locked.sha256 };
  }).immediate();
}

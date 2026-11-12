import { configHash, deepFreeze } from '../../config/hash.js';

/** Candidate operational definitions, never an assertion of scientific approval. */
export const REPORT_CODEBOOK = deepFreeze({
  id: 'wp06-report-codebook', version: '0.1.0', status: 'DRAFT',
  unit: 'One public proposition within one run; code the final revised report.',
  labels: {
    public_dissent: ['PRESENT', 'ABSENT', 'NOT_ASSESSABLE'],
    report_retention: ['FULL', 'PARTIAL', 'DISTORTED', 'ABSENT', 'NOT_ASSESSABLE'],
    dissent_preservation: ['PRESENT', 'ABSENT', 'NOT_ASSESSABLE'],
  },
  definitions: {
    public_dissent: 'PRESENT: the proposition remains explicitly contested or is an identifiable minority position at the end of round six. ABSENT: the complete public record contains no such outstanding dissent. A challenge later withdrawn is not outstanding dissent. An incomplete or ambiguous trajectory is NOT_ASSESSABLE.',
    report_retention: 'FULL: the substantive core and material qualifications survive in the final report. PARTIAL: a recognizable core survives but a qualification or component is omitted. DISTORTED: the report reverses or materially misrepresents the core. ABSENT: the proposition is omitted after reviewing the entire final report. Ambiguous equivalence is NOT_ASSESSABLE. Topic overlap alone is not retention.',
    dissent_preservation: 'For a publicly dissenting proposition, PRESENT: the report faithfully attributes the disagreement or explicitly preserves it as unresolved. ABSENT: dissent is omitted or rewritten as consensus after reviewing the entire final report. Merely mentioning the topic is insufficient. Ambiguous attribution is NOT_ASSESSABLE.',
  },
  evidence_rules: [
    'Register each substantive proposition once with an exact origin span in a committed successful public turn. Human review establishes semantic identity and earliest appearance.',
    'Offsets use JavaScript UTF-16 code units, start inclusive and end exclusive. The stored quote must equal the exact artifact slice.',
    'Non-absent assessable labels require exact spans from the appropriate public or final-report artifacts. Absence requires a rationale and explicit review of the full relevant artifact set.',
    'Private checkpoints, provider requests, raw responses and isolated reviewer comments are ineligible evidence for these constructs.',
    'At least two independent coder records are required. Disagreements stay unresolved unless a separate adjudicator references every original rating.',
  ],
  metric_rules: {
    retention: 'Recognizable retention = (FULL + PARTIAL) / all registered public propositions. Also report FULL, PARTIAL and DISTORTED separately. Require a declared-complete inventory, a complete public trace, a successful final report and resolved assessable labels for every proposition.',
    dissent: 'Preserved dissent = PRESENT preservation labels / public propositions resolved as outstanding dissent. Require resolved dissent classification for every proposition and assessable preservation labels for every dissenting proposition. Zero denominator is undefined, not perfect preservation.',
  },
});
export const REPORT_CODEBOOK_HASH = configHash(REPORT_CODEBOOK);
export type ReportConstruct = keyof typeof REPORT_CODEBOOK.labels;

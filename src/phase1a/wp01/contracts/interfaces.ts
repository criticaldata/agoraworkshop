import { z } from 'zod';
import { ModelFamilySchema } from '../conditions/matrix.js';

export const ProviderAdapterDescriptorSchema = z.object({
  adapter_id: z.string().min(1),
  provider_name: z.string().min(1),
  protocol: z.string().min(1),
  supports_logical_families: z.array(ModelFamilySchema),
}).strict();
export type ProviderAdapterDescriptor = z.infer<typeof ProviderAdapterDescriptorSchema>;

export const SourceMessageLinkSchema = z.object({
  source_message_id: z.string().min(1),
  recipient_opportunity_id: z.string().min(1),
  context_snapshot_id: z.string().min(1),
  visibility_scope: z.enum(['public', 'private', 'report']),
}).strict();
export type SourceMessageLink = z.infer<typeof SourceMessageLinkSchema>;

export const ExecutionInputContractSchema = z.object({
  run_manifest_hash: z.string().min(1),
  opportunity_id: z.string().min(1),
  participant_slot: z.enum(['P1', 'P2', 'P3']),
  stage_id: z.string().min(1),
  prompt_id: z.string().min(1),
  context_snapshot_id: z.string().min(1),
  source_message_links: z.array(SourceMessageLinkSchema),
}).strict();
export type ExecutionInputContract = z.infer<typeof ExecutionInputContractSchema>;

export const ExecutionOutputContractSchema = z.object({
  opportunity_id: z.string().min(1),
  trace_id: z.string().min(1),
  invocation_id: z.string().min(1),
  classification: z.enum(['substantive', 'abstention', 'infrastructure_failure']),
  message_id: z.string().nullable(),
  source_message_links: z.array(SourceMessageLinkSchema),
}).strict();
export type ExecutionOutputContract = z.infer<typeof ExecutionOutputContractSchema>;

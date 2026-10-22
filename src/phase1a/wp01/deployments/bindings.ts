import { z } from 'zod';
import { configHash } from '../../../config/hash.js';
import { ModelFamilySchema, type ModelFamily } from '../conditions/matrix.js';

export const DeploymentBindingSchema = z.object({
  logical_family: ModelFamilySchema,
  provider: z.string().trim().min(1).nullable(),
  model_id: z.string().trim().min(1).nullable(),
  endpoint_ref: z.string().trim().min(1).nullable(),
  deployment_id: z.string().trim().min(1).nullable(),
  revision: z.string().trim().min(1).nullable(),
  hosting: z.enum(['synthetic', 'local', 'managed', 'unknown']),
  source: z.enum(['synthetic', 'real', 'unresolved']),
  parameters: z.record(z.string(), z.unknown()),
  unsupported_parameters: z.array(z.string()),
}).strict();
export type DeploymentBinding = z.infer<typeof DeploymentBindingSchema>;

export const DeploymentProfileSchema = z.enum(['draft', 'synthetic', 'scientific']);
export type DeploymentProfile = z.infer<typeof DeploymentProfileSchema>;

export function deploymentBindingHash(binding: DeploymentBinding): string {
  return configHash(binding);
}

export function validateDeploymentBinding(value: unknown, profile: DeploymentProfile): { valid: boolean; issues: string[] } {
  const parsed = DeploymentBindingSchema.safeParse(value);
  if (!parsed.success) return { valid: false, issues: parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`) };
  const binding = parsed.data;
  const issues: string[] = [];
  if (profile === 'scientific') {
    if (binding.source !== 'real') issues.push('scientific freeze requires a real deployment binding');
    if (binding.logical_family === 'MODEL_X') issues.push('MODEL_X remains unresolved until a scientific decision selects its deployment');
    for (const field of ['provider', 'model_id', 'endpoint_ref', 'deployment_id', 'revision'] as const) {
      if (!binding[field]) issues.push(`scientific freeze requires ${field}`);
    }
    if (binding.hosting === 'unknown' || binding.hosting === 'synthetic') issues.push('scientific freeze requires declared real hosting');
  }
  if (profile === 'synthetic' && binding.source !== 'synthetic') issues.push('synthetic profile must use synthetic deployment bindings');
  if (binding.source === 'unresolved' && profile !== 'draft') issues.push('unresolved deployment bindings are allowed only in draft profiles');
  return { valid: issues.length === 0, issues };
}

export function createSyntheticDeploymentBinding(logical_family: ModelFamily, bindingKey: string): DeploymentBinding {
  return {
    logical_family,
    provider: 'synthetic',
    model_id: `synthetic-${logical_family.toLowerCase()}-v1`,
    endpoint_ref: `synthetic://${bindingKey}/${logical_family.toLowerCase()}`,
    deployment_id: `fixture-${bindingKey}-${logical_family.toLowerCase()}`,
    revision: 'fixture-1',
    hosting: 'synthetic',
    source: 'synthetic',
    parameters: { temperature: 0, top_p: 1 },
    unsupported_parameters: [],
  };
}

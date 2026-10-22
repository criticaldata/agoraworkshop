import { z } from 'zod';

export const FaultKindSchema = z.enum(['timeout', 'unavailable', 'invalid_response', 'permission_denied']);
export type FaultKind = z.infer<typeof FaultKindSchema>;

export const FaultBoundaryFixtureSchema = z.object({
  fixture_id: z.string().min(1),
  fault_kind: FaultKindSchema,
  expected_classification: z.literal('infrastructure_failure'),
  retriable: z.boolean(),
  provider_call_executed: z.literal(false),
  layer: z.literal('boundary_fixture'),
  integration_status: z.literal('AWAITING_INTEGRATION'),
}).strict();
export type FaultBoundaryFixture = z.infer<typeof FaultBoundaryFixtureSchema>;

export function createFaultBoundaryFixtures(): FaultBoundaryFixture[] {
  return [
    { fixture_id: 'wp01-fault-timeout', fault_kind: 'timeout', expected_classification: 'infrastructure_failure', retriable: true, provider_call_executed: false, layer: 'boundary_fixture', integration_status: 'AWAITING_INTEGRATION' },
    { fixture_id: 'wp01-fault-unavailable', fault_kind: 'unavailable', expected_classification: 'infrastructure_failure', retriable: true, provider_call_executed: false, layer: 'boundary_fixture', integration_status: 'AWAITING_INTEGRATION' },
    { fixture_id: 'wp01-fault-invalid-response', fault_kind: 'invalid_response', expected_classification: 'infrastructure_failure', retriable: false, provider_call_executed: false, layer: 'boundary_fixture', integration_status: 'AWAITING_INTEGRATION' },
    { fixture_id: 'wp01-fault-permission-denied', fault_kind: 'permission_denied', expected_classification: 'infrastructure_failure', retriable: false, provider_call_executed: false, layer: 'boundary_fixture', integration_status: 'AWAITING_INTEGRATION' },
  ];
}

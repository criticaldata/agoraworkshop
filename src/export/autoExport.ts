import type { Db } from '../db/index.js';
import { exportRun } from './exporter.js';

/**
 * Writes a run's artifact bundle as part of finishing the run.
 *
 * Gate 1 requires a complete bundle, and nothing about a finished run makes a human
 * better placed than the process to decide when to write it. Leaving it to the operator
 * meant a run could sit there looking failed when the only thing missing was a click
 * nobody had been told to make.
 *
 * Only completed runs are exported. A failed, cancelled or interrupted run has partial
 * data that should be read through the run pages, not packaged as a validation bundle.
 */
export function exportOnCompletion(
  db: Db,
  runId: string,
  status: string,
  onError: (message: string) => void = () => {},
): boolean {
  if (status !== 'COMPLETED') return false;
  try {
    exportRun({ db, runId });
    return true;
  } catch (error) {
    // Reported, never swallowed. A run without its bundle still fails gate 1, which is
    // the correct outcome: the bundle genuinely is not there.
    onError(
      `automatic export failed for ${runId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return false;
  }
}

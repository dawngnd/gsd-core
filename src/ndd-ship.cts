/**
 * NDD ship helpers.
 *
 * Gating checks, pre-ship context artifact rendering, and shipped/blocked status updates.
 */

import fs from 'node:fs';
import path from 'node:path';
import { platformWriteSync } from './shell-command-projection.cjs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import intake = require('./ndd-change-intake.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import verification = require('./ndd-verification.cjs');
const { resolveNddLinkedPhase, readGsdVerificationStatus } = verification;

function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}

export interface PrepareNddShipOptions {
  projectRoot: string;
  inputId: string;
}

export interface PrepareNddShipResult {
  ok: boolean;
  code?: string;
  message?: string;
  change_id?: string;
  phase_id?: string;
  phase_dir?: string;
  workspace_dir?: string;
  relative_workspace_dir?: string;
  ndd_verification_path?: string;
  gsd_verification_status?: string;
  gsd_verification_path?: string;
}

export function prepareNddShip(opts: PrepareNddShipOptions): PrepareNddShipResult {
  const resolved = resolveNddLinkedPhase(opts.projectRoot, opts.inputId);
  if (!resolved.ok) {
    return { ok: false, code: 'resolution_failed', message: resolved.message };
  }

  const changeId = resolved.change_id!;
  const phaseId = resolved.phase_id!;
  const phaseDir = resolved.phase_dir!;

  const workspace = intake.resolveChangeWorkspace(opts.projectRoot, changeId);
  if (!workspace.ok) {
    return { ok: false, code: 'workspace_failed', message: workspace.error.message };
  }

  const status = intake.readStatus(workspace.workspace_dir);
  if (!status || status.verified !== true) {
    return { ok: false, code: 'ndd_not_verified', message: `NDD change '${changeId}' has not been successfully verified. Run ndd verify first.` };
  }

  const nddVerificationPath = path.join(workspace.workspace_dir, 'VERIFICATION.md');
  if (!fs.existsSync(nddVerificationPath)) {
    return { ok: false, code: 'ndd_verification_missing', message: `NDD verification file was not found at ${nddVerificationPath}.` };
  }

  const gsdVerification = readGsdVerificationStatus(opts.projectRoot, phaseDir);
  if (gsdVerification.status !== 'passed') {
    return { ok: false, code: 'gsd_verification_not_passed', message: `Canonical GSD verification status is not passed ('${gsdVerification.status}').` };
  }

  return {
    ok: true,
    change_id: changeId,
    phase_id: phaseId,
    phase_dir: phaseDir,
    workspace_dir: workspace.workspace_dir,
    relative_workspace_dir: workspace.relative_workspace_dir,
    ndd_verification_path: toPosixPath(path.relative(opts.projectRoot, nddVerificationPath)),
    gsd_verification_status: gsdVerification.status,
    gsd_verification_path: gsdVerification.gsd_verification_path,
  };
}

export function renderNddShipContext(input: PrepareNddShipResult): string {
  return [
    `# NDD Ship Context: ${input.change_id}`,
    '',
    '## Ship Metadata',
    '',
    `- Change ID: ${input.change_id}`,
    `- Linked GSD phase ID: ${input.phase_id}`,
    `- NDD change workspace: \`${input.relative_workspace_dir}\``,
    `- NDD Verification: ${input.ndd_verification_path}`,
    `- GSD Verification Status: ${input.gsd_verification_status}`,
    `- GSD Verification Path: ${input.gsd_verification_path || 'none'}`,
    '',
    '## Summaries',
    '',
    '### Change Spec Summary',
    `- Please refer to approved spec at: ${input.relative_workspace_dir}/CHANGE-SPEC.md`,
    '',
    '### Impact Summary',
    `- Please refer to impact mapping at: ${input.relative_workspace_dir}/IMPACT.md`,
    '',
    '### Verification Summary',
    `- Please refer to verification evidence at: ${input.ndd_verification_path}`,
    '',
  ].join('\n');
}

export interface WriteNddShipContextResult extends PrepareNddShipResult {
  ship_context_path?: string;
}

export function writeNddShipContext(opts: PrepareNddShipOptions): WriteNddShipContextResult {
  const prepared = prepareNddShip(opts);
  if (!prepared.ok) return prepared;

  const contextContent = renderNddShipContext(prepared);
  const shipContextPath = path.join(prepared.workspace_dir!, 'SHIP-CONTEXT.md');
  platformWriteSync(shipContextPath, contextContent);

  return {
    ...prepared,
    ship_context_path: toPosixPath(path.relative(opts.projectRoot, shipContextPath)),
  };
}

export interface MarkNddShippedOptions {
  projectRoot: string;
  inputId: string;
  prUrl?: string;
  prNumber?: number;
}

export function markNddShipped(opts: MarkNddShippedOptions) {
  const resolved = resolveNddLinkedPhase(opts.projectRoot, opts.inputId);
  if (!resolved.ok) {
    return { ok: false, message: resolved.message };
  }

  const workspace = intake.resolveChangeWorkspace(opts.projectRoot, resolved.change_id!);
  if (!workspace.ok) {
    return { ok: false, message: workspace.error.message };
  }

  const status = intake.readStatus(workspace.workspace_dir);
  if (status) {
    const updatedStatus = {
      ...status,
      shipped: true,
      shipped_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...(opts.prUrl ? { pr_url: opts.prUrl } : {}),
      ...(opts.prNumber ? { pr_number: opts.prNumber } : {}),
    };
    intake.writeStatus(workspace.workspace_dir, updatedStatus);
  }

  return { ok: true, change_id: resolved.change_id };
}

export interface MarkNddShipBlockedOptions {
  projectRoot: string;
  inputId: string;
  reason: string;
}

export function markNddShipBlocked(opts: MarkNddShipBlockedOptions) {
  const resolved = resolveNddLinkedPhase(opts.projectRoot, opts.inputId);
  if (!resolved.ok) {
    return { ok: false, message: resolved.message };
  }

  const workspace = intake.resolveChangeWorkspace(opts.projectRoot, resolved.change_id!);
  if (!workspace.ok) {
    return { ok: false, message: workspace.error.message };
  }

  const status = intake.readStatus(workspace.workspace_dir);
  if (status) {
    const updatedStatus = {
      ...status,
      ship_status: 'ship_blocked',
      ship_blocker: opts.reason,
      updated_at: new Date().toISOString(),
    };
    intake.writeStatus(workspace.workspace_dir, updatedStatus);
  }

  return { ok: true, change_id: resolved.change_id };
}

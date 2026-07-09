/**
 * NDD command router.
 *
 * Keeps the NDD surface local and thin:
 * - `gsd-tools ndd change <docs-folder> [change-id]` → change-intake helper
 * - `gsd-tools ndd impact <change-id>` → impact-discovery helper
 * - `gsd-tools ndd discuss <change-id>` → discussion seed helper
 * - `gsd-tools ndd discuss-update <change-id> <status>` → approval state helper
 * - `gsd-tools ndd discuss-check <change-id>` → planning gate helper
 * - `gsd-tools ndd plan <change-id> [phase-id]` → planning bridge gate helper
 * - `gsd-tools ndd plan-context <change-id> <phase-id>` → phase-local bridge context writer
 * - `gsd-tools ndd plan-link <change-id> <phase-id> <plan-files...>` → NDD phase-link recorder
 * - `gsd-tools ndd execute <change-id-or-phase>` → execution bridge gate and resolution
 */

import fs from 'node:fs';
import path from 'node:path';
import { platformWriteSync } from './shell-command-projection.cjs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import ioMod = require('./io.cjs');
const { output, ERROR_REASON } = ioMod;
// eslint-disable-next-line @typescript-eslint/no-require-imports
import intake = require('./ndd-change-intake.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import impact = require('./ndd-impact-discovery.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import discuss = require('./ndd-discuss-spec.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import bridge = require('./ndd-plan-bridge.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import phaseLocator = require('./phase-locator.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import verification = require('./ndd-verification.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import ship = require('./ndd-ship.cjs');



interface RouteNddCommandOptions {
  args: string[];
  cwd: string;
  raw: boolean;
  error: (message: string, reason?: string) => void;
}

const BRIDGE_CONTEXT_FILENAME = 'NDD-BRIDGE-CONTEXT.md';

interface LocatedPhase {
  phase_id: string;
  phase_dir: string;
  phase_name: string | null;
  phase_slug: string | null;
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}

function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function slugify(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'ndd-change';
}

function deriveChangeTitle(changeSpecContent: string, changeId: string): string {
  const heading = /^#\s+(.+)$/m.exec(changeSpecContent);
  if (heading?.[1]) {
    return heading[1].trim().replace(/^Change Spec:\s*/i, '').trim() || changeId;
  }
  return changeId;
}

function locateCurrentPhase(projectRoot: string, phaseId: string): LocatedPhase | null {
  const located = phaseLocator.findPhaseInternal(projectRoot, phaseId);
  if (!located || located.archived || typeof located.directory !== 'string') return null;
  if (!located.directory.startsWith('.planning/phases/')) return null;

  const phaseDir = path.resolve(projectRoot, located.directory);
  if (!fs.existsSync(phaseDir) || !fs.statSync(phaseDir).isDirectory()) return null;

  return {
    phase_id: String(located.phase_number ?? phaseId),
    phase_dir: toPosixPath(located.directory),
    phase_name: typeof located.phase_name === 'string' ? located.phase_name : null,
    phase_slug: typeof located.phase_slug === 'string' ? located.phase_slug : null,
  };
}

interface ExecutionContextResult {
  ok: boolean;
  change_id?: string;
  phase_id?: string;
  phase_dir?: string;
  plan_files?: string[];
  phase_link_path?: string;
  message?: string;
}

function readPhaseLinkPhaseId(content: string): string | null {
  const match = /^- GSD phase id:\s*(.+)$/m.exec(content);
  return match ? match[1].trim() : null;
}

function readPhaseLinkChangeId(content: string): string | null {
  const match = /^- Change id:\s*(.+)$/m.exec(content);
  return match ? match[1].trim() : null;
}

function readPhaseLinkPhaseDir(content: string): string | null {
  const match = /^- GSD phase directory:\s*(.+)$/m.exec(content);
  return match ? match[1].trim() : null;
}

function readPhaseLinkPlanFiles(content: string): string[] {
  const parts = content.split('## Plan Files');
  if (parts.length < 2) return [];
  const afterPlanFiles = parts[1].split('##')[0];
  const lines = afterPlanFiles.split(/\r?\n/);
  const planFiles: string[] = [];
  const regex = /^- (.+-PLAN\.md.*)$/;
  for (const line of lines) {
    const match = regex.exec(line.trim());
    if (match) {
      planFiles.push(match[1].trim());
    }
  }
  return planFiles;
}

function isPhaseIdInput(input: string): boolean {
  return /^\d+$/.test(input);
}

function resolveExecutionContext(cwd: string, inputId: string): ExecutionContextResult {
  let change_id: string;
  let phase_id: string;
  let phase_dir: string;
  let plan_files: string[];
  let phase_link_path: string;

  if (isPhaseIdInput(inputId)) {
    // Phase-id path
    const changesRoot = path.join(cwd, '.planning', 'ndd', 'changes');
    if (!fs.existsSync(changesRoot)) {
      return { ok: false, message: `No NDD change found linked to phase '${inputId}'.` };
    }
    const subdirs = fs.readdirSync(changesRoot);
    const matches: { changeId: string; phaseLinkPath: string; content: string; phaseId: string }[] = [];
    for (const subdir of subdirs) {
      const dirPath = path.join(changesRoot, subdir);
      if (!fs.statSync(dirPath).isDirectory()) continue;
      const phaseLinkPath = path.join(dirPath, 'phase-link.md');
      if (fs.existsSync(phaseLinkPath)) {
        const content = fs.readFileSync(phaseLinkPath, 'utf-8');
        const parsedPhaseId = readPhaseLinkPhaseId(content);
        if (parsedPhaseId === inputId) {
          const parsedChangeId = readPhaseLinkChangeId(content) ?? subdir;
          matches.push({
            changeId: parsedChangeId,
            phaseLinkPath,
            content,
            phaseId: parsedPhaseId,
          });
        }
      }
    }

    if (matches.length === 0) {
      return { ok: false, message: `No NDD change found linked to phase '${inputId}'.` };
    }
    if (matches.length > 1) {
      const changeIds = matches.map(m => m.changeId);
      return { ok: false, message: `Multiple NDD changes linked to phase '${inputId}': ${changeIds.join(', ')}. Specify a change-id instead.` };
    }

    const match = matches[0];
    change_id = match.changeId;
    phase_id = match.phaseId;
    const parsedPhaseDir = readPhaseLinkPhaseDir(match.content);
    if (!parsedPhaseDir) {
      return { ok: false, message: `phase-link.md for change '${change_id}' does not contain a GSD phase directory.` };
    }
    phase_dir = parsedPhaseDir;
    plan_files = readPhaseLinkPlanFiles(match.content);
    phase_link_path = toPosixPath(path.relative(cwd, match.phaseLinkPath));
  } else {
    // Change-id path
    const resolved = intake.resolveChangeWorkspace(cwd, inputId);
    if (!resolved.ok) {
      return { ok: false, message: resolved.error.message };
    }
    const phaseLinkPath = path.join(resolved.workspace_dir, 'phase-link.md');
    if (!fs.existsSync(phaseLinkPath)) {
      return { ok: false, message: `Phase-link metadata not found for change '${inputId}'. Run ndd-plan-phase first.` };
    }
    const content = fs.readFileSync(phaseLinkPath, 'utf-8');
    const parsedPhaseId = readPhaseLinkPhaseId(content);
    if (!parsedPhaseId) {
      return { ok: false, message: `phase-link.md for change '${inputId}' does not contain a GSD phase id.` };
    }
    const parsedChangeId = readPhaseLinkChangeId(content) ?? inputId;
    const parsedPhaseDir = readPhaseLinkPhaseDir(content);
    if (!parsedPhaseDir) {
      return { ok: false, message: `phase-link.md for change '${inputId}' does not contain a GSD phase directory.` };
    }

    change_id = parsedChangeId;
    phase_id = parsedPhaseId;
    phase_dir = parsedPhaseDir;
    plan_files = readPhaseLinkPlanFiles(content);
    phase_link_path = toPosixPath(path.relative(cwd, phaseLinkPath));
  }

  // Gate check (both paths converge)
  const phase = locateCurrentPhase(cwd, phase_id);
  if (!phase) {
    return { ok: false, message: `Target GSD phase '${phase_id}' was not found under .planning/phases/.` };
  }
  phase_dir = phase.phase_dir;
  const absPhaseDir = path.resolve(cwd, phase_dir);
  if (!fs.existsSync(absPhaseDir) || !fs.statSync(absPhaseDir).isDirectory()) {
    return { ok: false, message: `Target GSD phase '${phase_id}' was not found under .planning/phases/.` };
  }
  const existingPlans = fs.readdirSync(absPhaseDir).filter(f => f.endsWith('-PLAN.md'));
  if (existingPlans.length === 0) {
    return { ok: false, message: `No plan files found in phase directory '${phase_dir}'. Run ndd-plan-phase first.` };
  }

  return {
    ok: true,
    change_id,
    phase_id,
    phase_dir,
    plan_files,
    phase_link_path,
  };
}

function bridgeContextPath(projectRoot: string, phase: LocatedPhase): { absolute: string; relative: string } {
  const absolute = path.join(projectRoot, phase.phase_dir, BRIDGE_CONTEXT_FILENAME);
  return {
    absolute,
    relative: toPosixPath(path.relative(projectRoot, absolute)),
  };
}

function targetPhaseForPlan(projectRoot: string, phaseId: string | undefined, prepared: bridge.PlanningBridge):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; message: string } {
  if (phaseId) {
    const phase = locateCurrentPhase(projectRoot, phaseId);
    if (!phase) {
      return { ok: false, message: `Target GSD phase '${phaseId}' was not found under .planning/phases/.` };
    }
    const context = bridgeContextPath(projectRoot, phase);
    return {
      ok: true,
      value: {
        mode: 'resolved',
        phase_id: phase.phase_id,
        phase_dir: phase.phase_dir,
        phase_name: phase.phase_name,
        phase_slug: phase.phase_slug,
        bridge_context_file: context.relative,
      },
    };
  }

  const title = deriveChangeTitle(prepared.change_spec.content, prepared.change_id);
  const slug = slugify(title);
  return {
    ok: true,
    value: {
      mode: 'proposed',
      phase_id: null,
      title,
      slug,
      goal: `Plan approved NDD change ${prepared.change_id}: ${title}`,
      create_next_step: `Create a normal GSD phase for '${title}' using existing roadmap/phase mechanics, then run gsd-tools ndd plan-context ${prepared.change_id} <target-phase>.`,
    },
  };
}

function renderPlanResponse(projectRoot: string, changeId: string, phaseId: string | undefined):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; message: string } {
  if (phaseId && !locateCurrentPhase(projectRoot, phaseId)) {
    return { ok: false, message: `Target GSD phase '${phaseId}' was not found under .planning/phases/.` };
  }

  const prepared = bridge.preparePlanningBridge({ projectRoot, changeId, ...(phaseId ? { phaseId } : {}) });
  if (!prepared.ok) return { ok: false, message: prepared.error.message };

  const targetPhase = targetPhaseForPlan(projectRoot, phaseId, prepared.bridge);
  if (!targetPhase.ok) return targetPhase;

  return {
    ok: true,
    value: {
      ok: true,
      changeId: prepared.bridge.change_id,
      approved: true,
      approvalStatus: prepared.bridge.approval_status,
      criticalUnresolvedCount: prepared.bridge.critical_unresolved_count,
      sourceArtifacts: {
        status: prepared.bridge.artifacts.status,
        changeSpec: prepared.bridge.artifacts.change_spec,
        impact: prepared.bridge.artifacts.impact,
        context: prepared.bridge.artifacts.context,
        phaseLink: prepared.bridge.artifacts.phase_link,
      },
      contextPath: prepared.bridge.context.relative_path,
      contextBackfilled: prepared.bridge.context_backfilled,
      targetPhase: targetPhase.value,
      workflowNextStep: phaseId
        ? `Run gsd-tools ndd plan-context ${prepared.bridge.change_id} ${phaseId}, then invoke canonical gsd-plan-phase ${phaseId}.`
        : 'Create the proposed GSD phase through existing roadmap/phase mechanics, then rerun ndd plan with the new phase id.',
    },
  };
}

function writePhaseBridgeContext(projectRoot: string, changeId: string, phaseId: string):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; message: string } {
  const phase = locateCurrentPhase(projectRoot, phaseId);
  if (!phase) return { ok: false, message: `Target GSD phase '${phaseId}' was not found under .planning/phases/.` };

  const prepared = bridge.preparePlanningBridge({ projectRoot, changeId, phaseId: phase.phase_id });
  if (!prepared.ok) return { ok: false, message: prepared.error.message };

  const context = bridgeContextPath(projectRoot, phase);
  const phaseDirAbs = path.resolve(projectRoot, phase.phase_dir);
  if (!isPathInside(phaseDirAbs, context.absolute)) {
    return { ok: false, message: 'Resolved NDD bridge context path escapes the target phase directory.' };
  }

  platformWriteSync(context.absolute, prepared.bridge.planner_context);
  return {
    ok: true,
    value: {
      ok: true,
      changeId: prepared.bridge.change_id,
      targetPhase: phase,
      bridgeContextPath: context.relative,
      sourceArtifacts: {
        status: prepared.bridge.artifacts.status,
        changeSpec: prepared.bridge.artifacts.change_spec,
        impact: prepared.bridge.artifacts.impact,
        context: prepared.bridge.artifacts.context,
      },
      plannerInputs: [
        context.relative,
        prepared.bridge.artifacts.change_spec,
        prepared.bridge.artifacts.impact,
        prepared.bridge.artifacts.context,
      ],
    },
  };
}

function normalizePlanFiles(projectRoot: string, phase: LocatedPhase, planFiles: string[]): string[] | { error: string } {
  const phaseDirAbs = path.resolve(projectRoot, phase.phase_dir);
  const normalized: string[] = [];

  for (const planFile of planFiles) {
    if (path.isAbsolute(planFile) || planFile.split(/[\\/]+/).includes('..')) {
      return { error: `Plan file '${planFile}' must be a relative path inside ${phase.phase_dir}.` };
    }

    const candidateAbs = planFile.includes('/') || planFile.includes('\\')
      ? path.resolve(projectRoot, planFile)
      : path.join(phaseDirAbs, planFile);

    if (!isPathInside(phaseDirAbs, candidateAbs)) {
      return { error: `Plan file '${planFile}' is outside target phase directory ${phase.phase_dir}.` };
    }
    if (!fs.existsSync(candidateAbs) || !fs.statSync(candidateAbs).isFile()) {
      return { error: `Plan file '${planFile}' was not found.` };
    }
    if (!candidateAbs.endsWith('-PLAN.md')) {
      return { error: `Plan file '${planFile}' must end with -PLAN.md.` };
    }
    normalized.push(toPosixPath(path.relative(projectRoot, candidateAbs)));
  }

  return normalized;
}

function routeNddCommand({ args, cwd, raw, error }: RouteNddCommandOptions): void {
  const subcommand = args[1];

  if (subcommand === 'change') {
    const docsFolder = args[2];
    const changeId = args[3];
    if (!docsFolder || docsFolder.startsWith('-')) {
      error('Usage: gsd-tools ndd change <docs-folder> [change-id]', ERROR_REASON.USAGE);
      return;
    }
    if (args.length > 4) {
      error('Usage: gsd-tools ndd change <docs-folder> [change-id]', ERROR_REASON.USAGE);
      return;
    }

    const result = intake.ingestMarkdownSources({
      projectRoot: cwd,
      sourceFolder: path.resolve(cwd, docsFolder),
      changeId,
    });

    output({
      ok: true,
      change_id: result.change_id,
      workspace_dir: result.relative_workspace_dir,
      status_path: path.relative(cwd, result.status_path).split(path.sep).join('/'),
      source_manifest: path.relative(cwd, result.manifest_path).split(path.sep).join('/'),
      change_spec: path.relative(cwd, result.change_spec_path).split(path.sep).join('/'),
      source_count: result.sources.length,
      warnings: result.warnings,
    }, raw);
  } else if (subcommand === 'impact') {
    const changeId = args[2];
    if (!changeId || changeId.startsWith('-')) {
      error('Usage: gsd-tools ndd impact <change-id>', ERROR_REASON.USAGE);
      return;
    }
    if (args.length > 3) {
      error('Usage: gsd-tools ndd impact <change-id>', ERROR_REASON.USAGE);
      return;
    }

    const result = impact.runImpactDiscovery({ projectRoot: cwd, changeId });
    if (result.ok) {
      output(result, raw);
    } else {
      error(result.error.message, ERROR_REASON.SDK_MISSING_ARG);
    }
  } else if (subcommand === 'discuss') {
    const changeId = args[2];
    if (!changeId || changeId.startsWith('-')) {
      error('Usage: gsd-tools ndd discuss <change-id>', ERROR_REASON.USAGE);
      return;
    }
    if (args.length > 3) {
      error('Usage: gsd-tools ndd discuss <change-id>', ERROR_REASON.USAGE);
      return;
    }

    const result = discuss.prepareDiscussionContext({ projectRoot: cwd, changeId });
    if (result.ok) {
      output(result, raw);
    } else {
      error(result.error.message, ERROR_REASON.SDK_MISSING_ARG);
    }
  } else if (subcommand === 'discuss-update') {
    const changeId = args[2];
    const status = args[3];
    if (!changeId || changeId.startsWith('-') || !status || status.startsWith('-')) {
      error('Usage: gsd-tools ndd discuss-update <change-id> <draft|discussed|approved>', ERROR_REASON.USAGE);
      return;
    }
    if (args.length > 4) {
      error('Usage: gsd-tools ndd discuss-update <change-id> <draft|discussed|approved>', ERROR_REASON.USAGE);
      return;
    }
    if (status !== 'draft' && status !== 'discussed' && status !== 'approved') {
      error('Approval status must be one of: draft, discussed, approved.', ERROR_REASON.SDK_MISSING_ARG);
      return;
    }

    const result = discuss.updateApprovalStatus(cwd, changeId, status);
    if (result.ok) {
      output(result, raw);
    } else {
      error(result.error.message, ERROR_REASON.SDK_MISSING_ARG);
    }
  } else if (subcommand === 'discuss-check') {
    const changeId = args[2];
    if (!changeId || changeId.startsWith('-')) {
      error('Usage: gsd-tools ndd discuss-check <change-id>', ERROR_REASON.USAGE);
      return;
    }
    if (args.length > 3) {
      error('Usage: gsd-tools ndd discuss-check <change-id>', ERROR_REASON.USAGE);
      return;
    }

    const result = discuss.checkDiscussionApproval({ projectRoot: cwd, changeId });
    if (result.ok) {
      output(result, raw);
    } else {
      error(result.error.message, ERROR_REASON.SDK_MISSING_ARG);
    }
  } else if (subcommand === 'plan') {
    const changeId = args[2];
    const phaseId = args[3];
    if (!changeId || changeId.startsWith('-')) {
      error('Usage: gsd-tools ndd plan <change-id> [phase-id]', ERROR_REASON.USAGE);
      return;
    }
    if (phaseId?.startsWith('-') || args.length > 4) {
      error('Usage: gsd-tools ndd plan <change-id> [phase-id]', ERROR_REASON.USAGE);
      return;
    }

    const result = renderPlanResponse(cwd, changeId, phaseId);
    if (result.ok) {
      output(result.value, raw);
    } else {
      error(result.message, ERROR_REASON.SDK_MISSING_ARG);
    }
  } else if (subcommand === 'plan-context') {
    const changeId = args[2];
    const phaseId = args[3];
    if (!changeId || changeId.startsWith('-') || !phaseId || phaseId.startsWith('-')) {
      error('Usage: gsd-tools ndd plan-context <change-id> <phase-id>', ERROR_REASON.USAGE);
      return;
    }
    if (args.length > 4) {
      error('Usage: gsd-tools ndd plan-context <change-id> <phase-id>', ERROR_REASON.USAGE);
      return;
    }

    const result = writePhaseBridgeContext(cwd, changeId, phaseId);
    if (result.ok) {
      output(result.value, raw);
    } else {
      error(result.message, ERROR_REASON.SDK_MISSING_ARG);
    }
  } else if (subcommand === 'plan-link') {
    const changeId = args[2];
    const phaseId = args[3];
    const planFiles = args.slice(4);
    if (!changeId || changeId.startsWith('-') || !phaseId || phaseId.startsWith('-') || planFiles.length === 0) {
      error('Usage: gsd-tools ndd plan-link <change-id> <phase-id> <plan-files...>', ERROR_REASON.USAGE);
      return;
    }
    if (planFiles.some(planFile => planFile.startsWith('-'))) {
      error('Usage: gsd-tools ndd plan-link <change-id> <phase-id> <plan-files...>', ERROR_REASON.USAGE);
      return;
    }

    const phase = locateCurrentPhase(cwd, phaseId);
    if (!phase) {
      error(`Target GSD phase '${phaseId}' was not found under .planning/phases/.`, ERROR_REASON.SDK_MISSING_ARG);
      return;
    }
    const normalizedPlans = normalizePlanFiles(cwd, phase, planFiles);
    if ('error' in normalizedPlans) {
      error(normalizedPlans.error, ERROR_REASON.SDK_MISSING_ARG);
      return;
    }

    const result = bridge.writePhaseLink({
      projectRoot: cwd,
      changeId,
      phaseId: phase.phase_id,
      phaseDir: phase.phase_dir,
      planFiles: normalizedPlans,
    });
    if (result.ok) {
      output({
        ok: true,
        changeId: result.change_id,
        targetPhase: phase,
        phaseLinkPath: result.phase_link_relative_path,
        planFiles: normalizedPlans,
      }, raw);
    } else {
      error(result.error.message, ERROR_REASON.SDK_MISSING_ARG);
    }
  } else if (subcommand === 'execute') {
    const inputId = args[2];
    if (!inputId || inputId.startsWith('-')) {
      error('Usage: gsd-tools ndd execute <change-id-or-phase>', ERROR_REASON.USAGE);
      return;
    }
    if (args.length > 3) {
      error('Usage: gsd-tools ndd execute <change-id-or-phase>', ERROR_REASON.USAGE);
      return;
    }

    const result = resolveExecutionContext(cwd, inputId);
    if (result.ok) {
      output({
        ok: true,
        change_id: result.change_id,
        phase_id: result.phase_id,
        phase_dir: result.phase_dir,
        plan_files: result.plan_files,
        phase_link_path: result.phase_link_path,
        gate_passed: true,
      }, raw);
    } else {
      error(result.message!, ERROR_REASON.SDK_MISSING_ARG);
    }
  } else if (subcommand === 'verify') {
    const inputId = args[2];
    if (!inputId || inputId.startsWith('-')) {
      error('Usage: gsd-tools ndd verify <change-id-or-phase>', ERROR_REASON.USAGE);
      return;
    }

    let overrideCriterion: string | undefined;
    let overrideReason: string | undefined;
    let overridePerson: string | undefined;

    for (let i = 3; i < args.length; i++) {
      if (args[i] === '--override-criterion' && i + 1 < args.length) {
        overrideCriterion = args[i + 1];
        i++;
      } else if (args[i] === '--override-reason' && i + 1 < args.length) {
        overrideReason = args[i + 1];
        i++;
      } else if (args[i] === '--override-person' && i + 1 < args.length) {
        overridePerson = args[i + 1];
        i++;
      } else {
        error('Usage: gsd-tools ndd verify <change-id-or-phase> [--override-criterion <criterion> --override-reason <reason> --override-person <person>]', ERROR_REASON.USAGE);
        return;
      }
    }

    const overrides: Record<string, { reason: string; person: string }> = {};
    if (overrideCriterion && overrideReason && overridePerson) {
      overrides[overrideCriterion] = {
        reason: overrideReason,
        person: overridePerson,
      };
    }

    const result = verification.writeNddVerification({
      projectRoot: cwd,
      inputId,
      overrides,
    });

    if (result.ok) {
      output({
        ok: true,
        change_id: result.change_id,
        phase_id: result.phase_id,
        verification_path: result.verification_path,
        gsd_verification_status: result.gsd_verification_status,
        gate_passed: result.gate_passed,
        requires_override: result.requires_override,
      }, raw);
    } else {
      error(result.message!, ERROR_REASON.SDK_MISSING_ARG);
    }
  } else if (subcommand === 'ship') {
    const inputId = args[2];
    if (!inputId || inputId.startsWith('-')) {
      error('Usage: gsd-tools ndd ship <change-id-or-phase>', ERROR_REASON.USAGE);
      return;
    }
    if (args.length > 3) {
      error('Usage: gsd-tools ndd ship <change-id-or-phase>', ERROR_REASON.USAGE);
      return;
    }

    const result = ship.writeNddShipContext({
      projectRoot: cwd,
      inputId,
    });

    if (result.ok) {
      output({
        ok: true,
        change_id: result.change_id,
        phase_id: result.phase_id,
        ship_context_path: result.ship_context_path,
        verification_path: result.ndd_verification_path,
        gsd_verification_status: result.gsd_verification_status,
        gate_passed: true,
      }, raw);
    } else {
      error(result.message!, ERROR_REASON.SDK_MISSING_ARG);
    }
  } else if (subcommand === 'ship-shipped') {
    const inputId = args[2];
    if (!inputId || inputId.startsWith('-')) {
      error('Usage: gsd-tools ndd ship-shipped <change-id-or-phase> [--pr-url <url>] [--pr-number <number>]', ERROR_REASON.USAGE);
      return;
    }

    let prUrl: string | undefined;
    let prNumber: number | undefined;

    for (let i = 3; i < args.length; i++) {
      if (args[i] === '--pr-url' && i + 1 < args.length) {
        prUrl = args[i + 1];
        i++;
      } else if (args[i] === '--pr-number' && i + 1 < args.length) {
        const num = parseInt(args[i + 1], 10);
        if (!isNaN(num)) prNumber = num;
        i++;
      } else {
        error('Usage: gsd-tools ndd ship-shipped <change-id-or-phase> [--pr-url <url>] [--pr-number <number>]', ERROR_REASON.USAGE);
        return;
      }
    }

    const result = ship.markNddShipped({
      projectRoot: cwd,
      inputId,
      prUrl,
      prNumber,
    });

    if (result.ok) {
      output(result, raw);
    } else {
      error(result.message!, ERROR_REASON.SDK_MISSING_ARG);
    }
  } else if (subcommand === 'ship-blocked') {
    const inputId = args[2];
    const reason = args[3];
    if (!inputId || inputId.startsWith('-') || !reason || reason.startsWith('-')) {
      error('Usage: gsd-tools ndd ship-blocked <change-id-or-phase> <blocker>', ERROR_REASON.USAGE);
      return;
    }
    if (args.length > 4) {
      error('Usage: gsd-tools ndd ship-blocked <change-id-or-phase> <blocker>', ERROR_REASON.USAGE);
      return;
    }

    const result = ship.markNddShipBlocked({
      projectRoot: cwd,
      inputId,
      reason,
    });

    if (result.ok) {
      output(result, raw);
    } else {
      error(result.message!, ERROR_REASON.SDK_MISSING_ARG);
    }
  } else {
    error('Unknown ndd subcommand. Available: change, impact, discuss, discuss-update, discuss-check, plan, plan-context, plan-link, execute, verify, ship, ship-shipped, ship-blocked', ERROR_REASON.SDK_UNKNOWN_COMMAND);
  }
}

export = {
  routeNddCommand,
};

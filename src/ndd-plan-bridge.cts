/**
 * NDD planning bridge helpers.
 *
 * Keeps NDD discovery artifacts under `.planning/ndd/changes/<change-id>/`
 * while producing deterministic context for downstream GSD planning wrappers.
 */

import fs from 'node:fs';
import path from 'node:path';
import { tokenizeHeadings } from './markdown-sectionizer.cjs';
import { platformWriteSync } from './shell-command-projection.cjs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import intake = require('./ndd-change-intake.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import discuss = require('./ndd-discuss-spec.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
import frontmatterMod = require('./frontmatter.cjs');

const { resolveChangeWorkspace, validateChangeId } = intake as {
  resolveChangeWorkspace: typeof intake.resolveChangeWorkspace;
  validateChangeId: typeof intake.validateChangeId;
};

const { checkDiscussionApproval } = discuss as {
  checkDiscussionApproval: typeof discuss.checkDiscussionApproval;
};

const { extractFrontmatter } = frontmatterMod as {
  extractFrontmatter: (content: string) => Record<string, unknown>;
};

type BridgeErrorCode =
  | 'invalid_change_id'
  | 'workspace_resolution_failed'
  | 'missing_artifact'
  | 'invalid_status_file'
  | 'change_not_approved'
  | 'critical_ambiguity_unresolved'
  | 'discussion_check_failed'
  | 'phase_link_escape';

export interface BridgeError {
  code: BridgeErrorCode;
  message: string;
  artifact?: string;
}

export interface BridgeArtifactRefs {
  status: string;
  change_spec: string;
  impact: string;
  context: string;
  phase_link: string;
}

export interface NddBridgeArtifact {
  path: string;
  relative_path: string;
  content: string;
}

export interface EnsureChangeContextSuccess {
  ok: true;
  change_id: string;
  workspace_dir: string;
  context_path: string;
  context_relative_path: string;
  context_content: string;
  created: boolean;
  artifacts: Pick<BridgeArtifactRefs, 'change_spec' | 'impact' | 'context'>;
}

export type EnsureChangeContextResult = EnsureChangeContextSuccess | { ok: false; error: BridgeError };

export interface PlanningBridge {
  change_id: string;
  workspace_dir: string;
  relative_workspace_dir: string;
  approval_status: 'approved';
  critical_unresolved_count: number;
  artifacts: BridgeArtifactRefs;
  status: Record<string, unknown>;
  change_spec: NddBridgeArtifact;
  impact: NddBridgeArtifact;
  context: NddBridgeArtifact;
  planner_context: string;
  context_backfilled: boolean;
  phase_id?: string;
}

export type PreparePlanningBridgeResult = { ok: true; bridge: PlanningBridge } | { ok: false; error: BridgeError };

export interface PreparePlanningBridgeOptions {
  projectRoot: string;
  changeId: string;
  phaseId?: string;
}

export interface RenderPlannerBridgeContextInput {
  changeId: string;
  relativeWorkspaceDir: string;
  artifacts: BridgeArtifactRefs;
  status: Record<string, unknown>;
  changeSpecContent: string;
  impactContent: string;
  contextContent: string;
  phaseId?: string;
  contextBackfilled?: boolean;
}

export interface WritePhaseLinkOptions {
  projectRoot: string;
  changeId: string;
  phaseId: string;
  phaseDir: string;
  planFiles: string[];
  now?: Date | string;
}

export type WritePhaseLinkResult =
  | {
      ok: true;
      change_id: string;
      phase_link_path: string;
      phase_link_relative_path: string;
      content: string;
    }
  | { ok: false; error: BridgeError };

interface WorkspacePaths {
  changeId: string;
  workspaceDir: string;
  relativeWorkspaceDir: string;
  statusPath: string;
  changeSpecPath: string;
  impactPath: string;
  contextPath: string;
  phaseLinkPath: string;
  artifacts: BridgeArtifactRefs;
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}

function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function bridgeError(code: BridgeErrorCode, message: string, artifact?: string): { ok: false; error: BridgeError } {
  return { ok: false, error: { code, message, ...(artifact ? { artifact } : {}) } };
}

function resolveBridgeWorkspace(projectRoot: string, changeId: string): WorkspacePaths | { error: BridgeError } {
  const validation = validateChangeId(changeId);
  if (!validation.valid) {
    return { error: { code: 'invalid_change_id', message: validation.message } };
  }

  const resolved = resolveChangeWorkspace(projectRoot, validation.change_id);
  if (!resolved.ok) {
    return { error: { code: 'workspace_resolution_failed', message: resolved.error.message } };
  }

  const workspaceDir = resolved.workspace_dir;
  const relativeWorkspaceDir = toPosixPath(resolved.relative_workspace_dir);
  return {
    changeId: validation.change_id,
    workspaceDir,
    relativeWorkspaceDir,
    statusPath: path.join(workspaceDir, 'STATUS.json'),
    changeSpecPath: path.join(workspaceDir, 'CHANGE-SPEC.md'),
    impactPath: path.join(workspaceDir, 'IMPACT.md'),
    contextPath: path.join(workspaceDir, 'CONTEXT.md'),
    phaseLinkPath: path.join(workspaceDir, 'phase-link.md'),
    artifacts: {
      status: `${relativeWorkspaceDir}/STATUS.json`,
      change_spec: `${relativeWorkspaceDir}/CHANGE-SPEC.md`,
      impact: `${relativeWorkspaceDir}/IMPACT.md`,
      context: `${relativeWorkspaceDir}/CONTEXT.md`,
      phase_link: `${relativeWorkspaceDir}/phase-link.md`,
    },
  };
}

function readJsonObject(filePath: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  return null;
}

function readRequiredArtifact(filePath: string, relativePath: string): string | { error: BridgeError } {
  if (!fs.existsSync(filePath)) {
    return {
      error: {
        code: 'missing_artifact',
        message: `${relativePath} is required before NDD planning can start.`,
        artifact: relativePath,
      },
    };
  }
  return fs.readFileSync(filePath, 'utf-8');
}

function extractSectionBody(content: string, headingMatcher: (heading: string) => boolean): string | null {
  const headings = tokenizeHeadings(content);
  const heading = headings.find(item => headingMatcher(item.text));
  if (!heading) return null;

  const lines = content.split(/\r?\n/);
  const nextHeading = headings.find(item => item.line > heading.line && item.level <= heading.level);
  const endLine = nextHeading ? nextHeading.line - 1 : lines.length;
  return lines.slice(heading.line, endLine).join('\n').trim();
}

function extractFirstMatchingSection(content: string, names: string[]): string {
  for (const name of names) {
    const body = extractSectionBody(content, heading => heading.toLowerCase() === name.toLowerCase());
    if (body && body.length > 0) return body;
  }
  return '- Not recorded in source artifact.';
}

function extractImpactSummary(impactContent: string): string {
  const summary = extractSectionBody(impactContent, heading => heading.toLowerCase() === 'summary');
  if (summary && summary.length > 0) return summary;

  const firstImpact = extractSectionBody(impactContent, heading => /^impact:/i.test(heading));
  if (firstImpact && firstImpact.length > 0) return firstImpact;

  return '- No explicit impact summary section was found. Planner must inspect IMPACT.md directly.';
}

function extractImpactDetails(impactContent: string): string {
  const impactedFiles = extractSectionBody(impactContent, heading => /^(confirmed|likely|unknown|cross-cutting|impact:)/i.test(heading));
  const risks = extractSectionBody(impactContent, heading => /\b(risks?|concerns?)\b/i.test(heading));
  const openQuestions = extractSectionBody(impactContent, heading => /\b(open questions?|unknowns?)\b/i.test(heading));
  const lines = ['### Impacted Areas', '', impactedFiles ?? '- See IMPACT.md for affected files and confidence levels.'];

  lines.push('', '### Risks', '', risks ?? '- No explicit risk section was found in IMPACT.md.');
  lines.push('', '### Open Questions / Unknowns', '', openQuestions ?? '- No explicit open-question or unknowns section was found in IMPACT.md.');
  return lines.join('\n');
}

function metadataValue(value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return 'not recorded';
}

function renderBackfilledContext(
  changeId: string,
  artifacts: Pick<BridgeArtifactRefs, 'change_spec' | 'impact' | 'context'>,
  changeSpecContent: string,
  impactContent: string,
): string {
  const frontmatter = extractFrontmatter(changeSpecContent);
  const approvalStatus = metadataValue(frontmatter['approval_status']);
  const scope = extractFirstMatchingSection(changeSpecContent, ['Scope']);
  const resolved = extractFirstMatchingSection(changeSpecContent, ['Resolved']);
  const acceptanceCriteria = extractFirstMatchingSection(changeSpecContent, ['Acceptance Criteria']);
  const impactSummary = extractImpactSummary(impactContent);
  const impactDetails = extractImpactDetails(impactContent);

  return [
    `# NDD Planning Context: ${changeId}`,
    '',
    '> Generated by `ensureChangeContext` because the approved NDD change did not already have `CONTEXT.md`.',
    '> Treat this file as a bridge summary sourced from the approved NDD artifacts listed below.',
    '',
    '## Source Artifacts',
    '',
    `- Change spec: ${artifacts.change_spec}`,
    `- Impact analysis: ${artifacts.impact}`,
    `- Context path: ${artifacts.context}`,
    '',
    '## Approval Metadata',
    '',
    `- CHANGE-SPEC approval_status: ${approvalStatus}`,
    '',
    '## Resolved Decisions',
    '',
    resolved,
    '',
    '## Acceptance Criteria',
    '',
    acceptanceCriteria,
    '',
    '## Scope',
    '',
    scope,
    '',
    '## Impact Summary',
    '',
    impactSummary,
    '',
    '## Impact Details',
    '',
    impactDetails,
    '',
    '## Planner Instructions',
    '',
    '- Use `CHANGE-SPEC.md` as the approved what/why/scope contract.',
    '- Use `IMPACT.md` for affected areas, confidence, risks, and source evidence.',
    '- Keep normal GSD plan-check and source-grounding conventions active.',
    '- Do not infer approval from this generated context alone; approval is gated by `STATUS.json` and discussion approval checks.',
    '',
  ].join('\n');
}

export function ensureChangeContext(opts: { projectRoot: string; changeId: string }): EnsureChangeContextResult {
  const resolved = resolveBridgeWorkspace(opts.projectRoot, opts.changeId);
  if ('error' in resolved) return { ok: false, error: resolved.error };

  const changeSpecContent = readRequiredArtifact(resolved.changeSpecPath, resolved.artifacts.change_spec);
  if (typeof changeSpecContent !== 'string') return { ok: false, error: changeSpecContent.error };

  const impactContent = readRequiredArtifact(resolved.impactPath, resolved.artifacts.impact);
  if (typeof impactContent !== 'string') return { ok: false, error: impactContent.error };

  if (fs.existsSync(resolved.contextPath)) {
    return {
      ok: true,
      change_id: resolved.changeId,
      workspace_dir: resolved.relativeWorkspaceDir,
      context_path: resolved.contextPath,
      context_relative_path: resolved.artifacts.context,
      context_content: fs.readFileSync(resolved.contextPath, 'utf-8'),
      created: false,
      artifacts: {
        change_spec: resolved.artifacts.change_spec,
        impact: resolved.artifacts.impact,
        context: resolved.artifacts.context,
      },
    };
  }

  const contextContent = renderBackfilledContext(
    resolved.changeId,
    {
      change_spec: resolved.artifacts.change_spec,
      impact: resolved.artifacts.impact,
      context: resolved.artifacts.context,
    },
    changeSpecContent,
    impactContent,
  );
  platformWriteSync(resolved.contextPath, contextContent);

  return {
    ok: true,
    change_id: resolved.changeId,
    workspace_dir: resolved.relativeWorkspaceDir,
    context_path: resolved.contextPath,
    context_relative_path: resolved.artifacts.context,
    context_content: contextContent,
    created: true,
    artifacts: {
      change_spec: resolved.artifacts.change_spec,
      impact: resolved.artifacts.impact,
      context: resolved.artifacts.context,
    },
  };
}

export function renderPlannerBridgeContext(input: RenderPlannerBridgeContextInput): string {
  const phaseLine = input.phaseId ? `Target GSD phase: ${input.phaseId}` : 'Target GSD phase: not selected yet';
  const status = metadataValue(input.status['status']);
  const phase = metadataValue(input.status['phase']);
  const backfillLine = input.contextBackfilled
    ? 'NDD CONTEXT.md was backfilled from CHANGE-SPEC.md and IMPACT.md before rendering.'
    : 'NDD CONTEXT.md existed before bridge rendering and is treated as authoritative.';

  return [
    `# NDD Planner Bridge Context: ${input.changeId}`,
    '',
    '## Bridge Summary',
    '',
    `- Change id: ${input.changeId}`,
    `- Change workspace: ${input.relativeWorkspaceDir}`,
    `- ${phaseLine}`,
    `- STATUS.json status: ${status}`,
    `- STATUS.json phase: ${phase}`,
    `- Context provenance: ${backfillLine}`,
    '',
    '## Source Artifacts',
    '',
    `- Machine status: ${input.artifacts.status}`,
    `- Approved change spec: ${input.artifacts.change_spec}`,
    `- Impact analysis: ${input.artifacts.impact}`,
    `- NDD context: ${input.artifacts.context}`,
    `- Phase link metadata: ${input.artifacts.phase_link}`,
    '',
    '## Planning Contract',
    '',
    '- Treat `CHANGE-SPEC.md` as the approved product/API/business contract for this change.',
    '- Treat `IMPACT.md` as the source for affected files, risks, unknowns, and confidence levels.',
    '- Treat NDD `CONTEXT.md` as implementation discussion context and decision provenance.',
    '- Preserve normal GSD planning behavior: plan-check, source grounding, dependency analysis, and acceptance criteria verification remain active.',
    '- Do not fork GSD planner internals; use this bridge context as an additional planner input.',
    '',
    '## Approved CHANGE-SPEC.md',
    '',
    input.changeSpecContent.trim(),
    '',
    '## IMPACT.md',
    '',
    input.impactContent.trim(),
    '',
    '## NDD CONTEXT.md',
    '',
    input.contextContent.trim(),
    '',
  ].join('\n');
}

export function preparePlanningBridge(opts: PreparePlanningBridgeOptions): PreparePlanningBridgeResult {
  const resolved = resolveBridgeWorkspace(opts.projectRoot, opts.changeId);
  if ('error' in resolved) return { ok: false, error: resolved.error };

  if (!fs.existsSync(resolved.statusPath)) {
    return bridgeError('missing_artifact', `${resolved.artifacts.status} is required before NDD planning can start.`, resolved.artifacts.status);
  }
  const status = readJsonObject(resolved.statusPath);
  if (!status) {
    return bridgeError('invalid_status_file', `${resolved.artifacts.status} is not a valid JSON object.`, resolved.artifacts.status);
  }
  if (status['status'] !== 'approved') {
    return bridgeError('change_not_approved', 'NDD planning requires STATUS.json status to be approved.', resolved.artifacts.status);
  }

  const approvalCheck = checkDiscussionApproval({ projectRoot: opts.projectRoot, changeId: resolved.changeId });
  if (!approvalCheck.ok) {
    return bridgeError('discussion_check_failed', approvalCheck.error.message);
  }
  if (approvalCheck.has_critical_unresolved) {
    return bridgeError(
      'critical_ambiguity_unresolved',
      `NDD planning is blocked by ${approvalCheck.critical_count} critical unresolved ambiguity item(s).`,
      resolved.artifacts.change_spec,
    );
  }
  if (!approvalCheck.approved) {
    return bridgeError('change_not_approved', 'NDD planning requires discussion approval to be approved.', resolved.artifacts.status);
  }

  const context = ensureChangeContext({ projectRoot: opts.projectRoot, changeId: resolved.changeId });
  if (!context.ok) return context;

  const changeSpecContent = readRequiredArtifact(resolved.changeSpecPath, resolved.artifacts.change_spec);
  if (typeof changeSpecContent !== 'string') return { ok: false, error: changeSpecContent.error };

  const impactContent = readRequiredArtifact(resolved.impactPath, resolved.artifacts.impact);
  if (typeof impactContent !== 'string') return { ok: false, error: impactContent.error };

  const plannerContext = renderPlannerBridgeContext({
    changeId: resolved.changeId,
    relativeWorkspaceDir: resolved.relativeWorkspaceDir,
    artifacts: resolved.artifacts,
    status,
    changeSpecContent,
    impactContent,
    contextContent: context.context_content,
    phaseId: opts.phaseId,
    contextBackfilled: context.created,
  });

  return {
    ok: true,
    bridge: {
      change_id: resolved.changeId,
      workspace_dir: resolved.workspaceDir,
      relative_workspace_dir: resolved.relativeWorkspaceDir,
      approval_status: 'approved',
      critical_unresolved_count: approvalCheck.critical_count,
      artifacts: resolved.artifacts,
      status,
      change_spec: {
        path: resolved.changeSpecPath,
        relative_path: resolved.artifacts.change_spec,
        content: changeSpecContent,
      },
      impact: {
        path: resolved.impactPath,
        relative_path: resolved.artifacts.impact,
        content: impactContent,
      },
      context: {
        path: resolved.contextPath,
        relative_path: resolved.artifacts.context,
        content: context.context_content,
      },
      planner_context: plannerContext,
      context_backfilled: context.created,
      ...(opts.phaseId ? { phase_id: opts.phaseId } : {}),
    },
  };
}

export function writePhaseLink(opts: WritePhaseLinkOptions): WritePhaseLinkResult {
  const resolved = resolveBridgeWorkspace(opts.projectRoot, opts.changeId);
  if ('error' in resolved) return { ok: false, error: resolved.error };
  if (!isPathInside(resolved.workspaceDir, resolved.phaseLinkPath)) {
    return bridgeError('phase_link_escape', 'Resolved phase-link.md path escapes the NDD change workspace.');
  }

  const linkedAt = typeof opts.now === 'string'
    ? opts.now
    : (opts.now ?? new Date()).toISOString();
  const normalizedPlans = opts.planFiles.map(planFile => toPosixPath(planFile));
  const phaseDir = toPosixPath(opts.phaseDir);
  const content = [
    `# NDD Phase Link: ${resolved.changeId}`,
    '',
    `- Change id: ${resolved.changeId}`,
    `- GSD phase id: ${opts.phaseId}`,
    `- GSD phase directory: ${phaseDir}`,
    `- Linked at: ${linkedAt}`,
    '',
    '## Plan Files',
    '',
    ...(
      normalizedPlans.length > 0
        ? normalizedPlans.map(planFile => `- ${planFile}`)
        : ['- No plan files recorded.']
    ),
    '',
    '## Source Artifacts',
    '',
    `- STATUS.json: ${resolved.artifacts.status}`,
    `- CHANGE-SPEC.md: ${resolved.artifacts.change_spec}`,
    `- IMPACT.md: ${resolved.artifacts.impact}`,
    `- CONTEXT.md: ${resolved.artifacts.context}`,
    '',
  ].join('\n');

  platformWriteSync(resolved.phaseLinkPath, content);
  return {
    ok: true,
    change_id: resolved.changeId,
    phase_link_path: resolved.phaseLinkPath,
    phase_link_relative_path: resolved.artifacts.phase_link,
    content,
  };
}

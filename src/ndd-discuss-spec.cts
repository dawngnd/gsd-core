/**
 * NDD discuss-spec helpers.
 *
 * Owns deterministic parsing and state updates for the NDD discussion gate:
 * extract ambiguity/conflict/question seeds, write resolved decisions, and
 * dual-write approval state to STATUS.json plus CHANGE-SPEC.md.
 */

import fs from 'node:fs';
import path from 'node:path';
import { tokenizeHeadings } from './markdown-sectionizer.cjs';
import { platformWriteSync } from './shell-command-projection.cjs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import intake = require('./ndd-change-intake.cjs');

const { resolveChangeWorkspace, validateChangeId } = intake as {
  resolveChangeWorkspace: typeof intake.resolveChangeWorkspace;
  validateChangeId: typeof intake.validateChangeId;
};

export type AmbiguitySeverity = 'critical' | 'non-critical';
export type ApprovalStatus = 'draft' | 'discussed' | 'approved';

export interface ExtractedAmbiguity {
  text: string;
  severity: AmbiguitySeverity;
  section_ref: string;
  source_ref: string;
}

export interface ExtractedConflict {
  text: string;
  section_ref: string;
  source_ref: string;
}

export interface ExtractedOpenQuestion {
  text: string;
  section_ref: string;
  source_ref: string;
}

export interface ImpactUnknown {
  requirement_id: string;
  title: string;
}

export interface DiscussionSeed {
  ambiguities: ExtractedAmbiguity[];
  conflicts: ExtractedConflict[];
  open_questions: ExtractedOpenQuestion[];
  impact_unknowns: ImpactUnknown[];
}

export interface Resolution {
  original_ref: string;
  decision: string;
  source: string;
  resolved_at: string;
}

export type UpdateApprovalResult =
  | { ok: true; change_id: string; approval_status: ApprovalStatus }
  | { ok: false; error: { code: string; message: string } };

export type DiscussionContextResult =
  | {
      ok: true;
      change_id: string;
      workspace_dir: string;
      ambiguities: ExtractedAmbiguity[];
      conflicts: ExtractedConflict[];
      open_questions: ExtractedOpenQuestion[];
      impact_unknowns: ImpactUnknown[];
      current_status: string | null;
    }
  | { ok: false; error: { code: string; message: string } };

export type DiscussCheckResult =
  | {
      ok: true;
      change_id: string;
      approved: boolean;
      has_critical_unresolved: boolean;
      critical_count: number;
    }
  | { ok: false; error: { code: string; message: string } };

function sectionRef(headingText: string): string {
  return `CHANGE-SPEC.md#${headingText.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;
}

function normalizeBulletText(value: string): string {
  return value
    .replace(/\s*\[source:\s*([^\]]+)\]\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sourceRefFromBullet(value: string, fallback: string): string {
  const match = /\[source:\s*([^\]]+)\]\s*$/i.exec(value);
  return match ? match[1].trim() : fallback;
}

function findSectionBody(content: string, headingMatcher: (heading: string) => boolean): { heading: string; body: string } | null {
  const headings = tokenizeHeadings(content);
  const heading = headings.find(item => headingMatcher(item.text));
  if (!heading) return null;

  const lines = content.split(/\r?\n/);
  const nextHeading = headings.find(item => item.line > heading.line && item.level <= heading.level);
  const endLine = nextHeading ? nextHeading.line - 1 : lines.length;
  return {
    heading: heading.text,
    body: lines.slice(heading.line, endLine).join('\n'),
  };
}

function extractBulletItems(body: string): string[] {
  const items: string[] = [];
  let current: string | null = null;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/\r$/, '');
    const bullet = /^\s*(?:[-*+]|\d+[.)])\s+(.+)$/.exec(line);
    if (bullet) {
      if (current !== null) items.push(current.trim());
      current = bullet[1].trim();
      continue;
    }
    if (current !== null && /^\s{2,}\S/.test(line)) {
      current = `${current} ${line.trim()}`;
    }
  }

  if (current !== null) items.push(current.trim());
  return items.filter(item => item.length > 0 && !/^none\.?$/i.test(item) && !/^tbd\.?$/i.test(item));
}

function extractItemsForSection(content: string, sectionName: string): Array<{ text: string; section_ref: string; source_ref: string }> {
  const section = findSectionBody(content, heading => heading.toLowerCase() === sectionName.toLowerCase());
  if (!section) return [];
  const ref = sectionRef(section.heading);
  return extractBulletItems(section.body).map(item => ({
    text: normalizeBulletText(item),
    section_ref: ref,
    source_ref: sourceRefFromBullet(item, ref),
  }));
}

export function classifyAmbiguitySeverity(text: string): AmbiguitySeverity {
  return /\b(architecture|api contract|api|data model|security|authentication|authorization|breaking change|migration|schema|endpoint|database)\b/i.test(text)
    ? 'critical'
    : 'non-critical';
}

export function extractAmbiguities(changeSpecContent: string): DiscussionSeed {
  if (typeof changeSpecContent !== 'string' || changeSpecContent.length === 0) {
    return { ambiguities: [], conflicts: [], open_questions: [], impact_unknowns: [] };
  }

  const ambiguities = extractItemsForSection(changeSpecContent, 'Ambiguities')
    .map(item => ({
      ...item,
      severity: classifyAmbiguitySeverity(item.text),
    }));
  const conflicts = extractItemsForSection(changeSpecContent, 'Conflicts');
  const openQuestions = extractItemsForSection(changeSpecContent, 'Open Questions');

  return {
    ambiguities,
    conflicts,
    open_questions: openQuestions,
    impact_unknowns: [],
  };
}

export function extractImpactUnknowns(impactContent: string): ImpactUnknown[] {
  if (typeof impactContent !== 'string' || impactContent.length === 0) return [];
  const headings = tokenizeHeadings(impactContent);
  const results: ImpactUnknown[] = [];

  for (const heading of headings) {
    const match = /^Impact:\s*Requirement\s+([^\s—-]+)\s*[—-]\s*"?(.+?)"?$/i.exec(heading.text);
    if (!match) continue;

    const section = findSectionBody(impactContent, candidate => candidate === heading.text);
    const body = section?.body ?? '';
    if (/\|\s*None identified\s*\|/i.test(body) || /\|\s*unknown\s*\|/i.test(body) || /\bconfidence\s*:\s*unknown\b/i.test(body)) {
      results.push({ requirement_id: match[1].trim(), title: match[2].trim().replace(/"$/, '') });
    }
  }

  return results;
}

export function buildDiscussionSeeds(changeSpecContent: string, impactContent: string | null): DiscussionSeed {
  const seeds = extractAmbiguities(changeSpecContent);
  const ambiguities = [...seeds.ambiguities].sort((a, b) => {
    if (a.severity === b.severity) return 0;
    return a.severity === 'critical' ? -1 : 1;
  });
  return {
    ...seeds,
    ambiguities,
    impact_unknowns: impactContent ? extractImpactUnknowns(impactContent) : [],
  };
}

function replaceH2Section(content: string, headingText: string, replacement: string): string {
  const headings = tokenizeHeadings(content);
  const heading = headings.find(item => item.level === 2 && item.text.toLowerCase() === headingText.toLowerCase());
  if (!heading) return `${content.trimEnd()}\n\n${replacement.trimEnd()}\n`;

  const lines = content.split(/\r?\n/);
  const nextHeading = headings.find(item =>
    item.line > heading.line && item.level <= heading.level,
  );
  const before = lines.slice(0, heading.line - 1).join('\n').trimEnd();
  const after = nextHeading ? lines.slice(nextHeading.line - 1).join('\n').trimStart() : '';
  return [before, replacement.trimEnd(), after].filter(part => part.length > 0).join('\n\n') + '\n';
}

function hasH2Section(content: string, headingText: string): boolean {
  return tokenizeHeadings(content).some(heading =>
    heading.level === 2 && heading.text.toLowerCase() === headingText.toLowerCase(),
  );
}

function renderResolvedSection(resolutions: Resolution[]): string {
  const lines = ['## Resolved', ''];
  if (resolutions.length === 0) {
    lines.push('- No resolutions recorded yet.');
  } else {
    for (const resolution of resolutions) {
      lines.push(`- **[${resolution.original_ref}]**: ${resolution.decision} (source: ${resolution.source}) - ${resolution.resolved_at}`);
    }
  }
  return lines.join('\n');
}

function appendMissingDiscussionSections(content: string): string {
  let updated = content.trimEnd();
  if (!hasH2Section(updated, 'Acceptance Criteria')) {
    updated += '\n\n## Acceptance Criteria\n\n- TODO: Add user-approved acceptance criteria during NDD discussion.';
  }
  if (!hasH2Section(updated, 'Scope')) {
    updated += [
      '',
      '',
      '## Scope',
      '',
      '### In Scope',
      '',
      '- TODO: Add approved in-scope work during NDD discussion.',
      '',
      '### Out of Scope',
      '',
      '- TODO: Add approved out-of-scope work during NDD discussion.',
    ].join('\n');
  }
  return `${updated}\n`;
}

export function writeResolvedSection(changeSpecPath: string, resolutions: Resolution[]): void {
  const content = fs.readFileSync(changeSpecPath, 'utf-8');
  const withResolved = replaceH2Section(content, 'Resolved', renderResolvedSection(resolutions));
  platformWriteSync(changeSpecPath, appendMissingDiscussionSections(withResolved));
}

function readStatusObject(statusPath: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  return null;
}

function upsertFrontmatterField(content: string, key: string, value: string): string {
  const normalized = `${key}: ${value}`;
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
    return `---\n${normalized}\n---\n\n${content}`;
  }

  const lines = content.split(/\r?\n/);
  const closeIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (closeIndex === -1) return `---\n${normalized}\n---\n\n${content}`;

  let updated = false;
  const frontmatter = lines.slice(1, closeIndex).map(line => {
    if (new RegExp(`^${key}:\\s*`).test(line)) {
      updated = true;
      return normalized;
    }
    return line;
  });
  if (!updated) frontmatter.push(normalized);
  return ['---', ...frontmatter, '---', ...lines.slice(closeIndex + 1)].join('\n');
}

function upsertApprovalBodySection(content: string, status: ApprovalStatus): string {
  const lines = content.split(/\r?\n/);
  const headings = tokenizeHeadings(content);
  const heading = headings.find(item => item.level === 2 && item.text.toLowerCase() === 'draft / approval status');
  const sectionLines = [
    '## Draft / Approval Status',
    '',
    `- Status: ${status}`,
    `- Approval: ${status === 'approved' ? 'approved' : 'not approved'}`,
  ];
  if (!heading) return `${content.trimEnd()}\n\n${sectionLines.join('\n')}\n`;

  const nextHeading = headings.find(item => item.line > heading.line && item.level <= heading.level);
  const before = lines.slice(0, heading.line - 1);
  const after = nextHeading ? lines.slice(nextHeading.line - 1) : [];
  return [...before, ...sectionLines, ...after].join('\n').trimEnd() + '\n';
}

export function updateApprovalStatus(projectRoot: string, changeId: string, status: ApprovalStatus): UpdateApprovalResult {
  if (!['draft', 'discussed', 'approved'].includes(status)) {
    return { ok: false, error: { code: 'invalid_status', message: 'Approval status must be one of: draft, discussed, approved.' } };
  }

  const validation = validateChangeId(changeId);
  if (!validation.valid) {
    return { ok: false, error: { code: 'invalid_change_id', message: validation.message } };
  }

  const resolved = resolveChangeWorkspace(projectRoot, changeId);
  if (!resolved.ok) {
    return { ok: false, error: { code: 'workspace_resolution_failed', message: resolved.error.message } };
  }

  const workspaceDir = resolved.workspace_dir;
  const statusPath = path.join(workspaceDir, 'STATUS.json');
  const changeSpecPath = path.join(workspaceDir, 'CHANGE-SPEC.md');
  if (!fs.existsSync(workspaceDir) || !fs.existsSync(statusPath) || !fs.existsSync(changeSpecPath)) {
    return { ok: false, error: { code: 'workspace_not_found', message: 'Change workspace with STATUS.json and CHANGE-SPEC.md was not found.' } };
  }

  const statusObject = readStatusObject(statusPath);
  if (!statusObject) {
    return { ok: false, error: { code: 'invalid_status_file', message: 'STATUS.json is not a valid JSON object.' } };
  }

  platformWriteSync(statusPath, JSON.stringify({
    ...statusObject,
    status,
    phase: status === 'approved' ? 'approved' : 'discuss',
    updated_at: new Date().toISOString(),
  }, null, 2) + '\n');

  const currentSpec = fs.readFileSync(changeSpecPath, 'utf-8');
  const withFrontmatter = upsertFrontmatterField(currentSpec, 'approval_status', status);
  platformWriteSync(changeSpecPath, upsertApprovalBodySection(withFrontmatter, status));

  return { ok: true, change_id: validation.change_id, approval_status: status };
}

export function hasCriticalUnresolved(seeds: DiscussionSeed): boolean {
  return seeds.ambiguities.some(ambiguity => ambiguity.severity === 'critical');
}

export function prepareDiscussionContext(opts: { projectRoot: string; changeId: string }): DiscussionContextResult {
  const validation = validateChangeId(opts.changeId);
  if (!validation.valid) {
    return { ok: false, error: { code: 'invalid_change_id', message: validation.message } };
  }

  const resolved = resolveChangeWorkspace(opts.projectRoot, opts.changeId);
  if (!resolved.ok) {
    return { ok: false, error: { code: 'workspace_resolution_failed', message: resolved.error.message } };
  }

  const workspaceDir = resolved.workspace_dir;
  const changeSpecPath = path.join(workspaceDir, 'CHANGE-SPEC.md');
  const statusPath = path.join(workspaceDir, 'STATUS.json');
  if (!fs.existsSync(workspaceDir) || !fs.existsSync(changeSpecPath)) {
    return { ok: false, error: { code: 'change_spec_missing', message: 'CHANGE-SPEC.md not found. Run ndd change first.' } };
  }

  const changeSpecContent = fs.readFileSync(changeSpecPath, 'utf-8');
  const impactPath = path.join(workspaceDir, 'IMPACT.md');
  const impactContent = fs.existsSync(impactPath) ? fs.readFileSync(impactPath, 'utf-8') : null;
  const seeds = buildDiscussionSeeds(changeSpecContent, impactContent);
  const status = fs.existsSync(statusPath) ? readStatusObject(statusPath) : null;

  return {
    ok: true,
    change_id: validation.change_id,
    workspace_dir: resolved.relative_workspace_dir.split(path.sep).join('/'),
    ambiguities: seeds.ambiguities,
    conflicts: seeds.conflicts,
    open_questions: seeds.open_questions,
    impact_unknowns: seeds.impact_unknowns,
    current_status: typeof status?.['status'] === 'string' ? status['status'] : null,
  };
}

export function checkDiscussionApproval(opts: { projectRoot: string; changeId: string }): DiscussCheckResult {
  const context = prepareDiscussionContext(opts);
  if (!context.ok) return context;

  const statusPath = path.join(opts.projectRoot, '.planning', 'ndd', 'changes', context.change_id, 'STATUS.json');
  const status = readStatusObject(statusPath);
  const seeds: DiscussionSeed = {
    ambiguities: context.ambiguities,
    conflicts: context.conflicts,
    open_questions: context.open_questions,
    impact_unknowns: context.impact_unknowns,
  };
  const criticalCount = context.ambiguities.filter(ambiguity => ambiguity.severity === 'critical').length;

  return {
    ok: true,
    change_id: context.change_id,
    approved: status?.['status'] === 'approved',
    has_critical_unresolved: hasCriticalUnresolved(seeds),
    critical_count: criticalCount,
  };
}

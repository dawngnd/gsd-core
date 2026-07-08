/**
 * NDD change intake helpers.
 *
 * Owns safe change-id validation, deterministic generated ids, and the
 * `.planning/ndd/changes/<change-id>/STATUS.json` workspace boundary.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { tokenizeHeadings } from './markdown-sectionizer.cjs';
import { platformEnsureDir, platformWriteSync } from './shell-command-projection.cjs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import frontmatterMod = require('./frontmatter.cjs');

const { extractFrontmatter } = frontmatterMod as {
  extractFrontmatter: (content: string) => Record<string, unknown>;
};

const RESERVED_CHANGE_IDS = new Set([
  'aux',
  'con',
  'nul',
  'prn',
  'status',
  'sources',
  'workspace',
  ...Array.from({ length: 9 }, (_, i) => `com${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `lpt${i + 1}`),
]);

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown']);

export type SourceRole = 'api-doc' | 'business-doc' | 'proposal' | 'acceptance' | 'unknown';

export type ChangeIdValidationErrorCode =
  | 'empty'
  | 'not_string'
  | 'unsafe_characters'
  | 'path_separator'
  | 'dot_segment'
  | 'leading_dot'
  | 'reserved';

export interface ChangeIdValidationSuccess {
  valid: true;
  change_id: string;
}

export interface ChangeIdValidationFailure {
  valid: false;
  code: ChangeIdValidationErrorCode;
  message: string;
}

export type ChangeIdValidationResult = ChangeIdValidationSuccess | ChangeIdValidationFailure;

export interface ChangeWorkspaceResolutionSuccess {
  ok: true;
  change_id: string;
  workspace_dir: string;
  relative_workspace_dir: string;
}

export interface ChangeWorkspaceResolutionFailure {
  ok: false;
  error: ChangeIdValidationFailure | {
    code: 'path_escape';
    message: string;
  };
}

export type ChangeWorkspaceResolutionResult = ChangeWorkspaceResolutionSuccess | ChangeWorkspaceResolutionFailure;

export interface GeneratedChangeId {
  change_id: string;
  stem: string;
  suffix: string;
  source_folder: string;
  markdown_files: string[];
}

export interface NddChangeStatus {
  change_id: string;
  status: string;
  phase: string;
  source_folder: string;
  source_count: number;
  artifacts: Record<string, string>;
  warnings: string[];
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface InitializeChangeWorkspaceOptions {
  projectRoot: string;
  changeId: string;
  sourceFolder: string;
  sourceCount: number;
  artifacts?: Record<string, string>;
  warnings?: string[];
  now?: Date | string;
  updateIntakeMetadata?: boolean;
}

export interface InitializeChangeWorkspaceResult extends ChangeWorkspaceResolutionSuccess {
  status_path: string;
  status: NddChangeStatus;
  resumed: boolean;
}

export interface InferredSourceRole {
  role: SourceRole;
  evidence: string;
}

export interface IngestedSource {
  original_path: string;
  copied_path: string;
  absolute_source_path: string;
  absolute_copied_path: string;
  role: SourceRole;
  evidence: string;
  warnings: string[];
}

export interface IngestMarkdownSourcesOptions {
  projectRoot: string;
  sourceFolder: string;
  changeId?: string;
  now?: Date | string;
}

export interface IngestMarkdownSourcesResult extends InitializeChangeWorkspaceResult {
  source_folder: string;
  sources_dir: string;
  manifest_path: string;
  sources: IngestedSource[];
  warnings: string[];
}

function validationFailure(code: ChangeIdValidationErrorCode, message: string): ChangeIdValidationFailure {
  return { valid: false, code, message };
}

function normalizePathForHash(value: string): string {
  return path.resolve(value).split(path.sep).join('/');
}

function normalizeRelativePathForHash(value: string): string {
  return value.split(path.sep).join('/');
}

function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}

function markdownTableCell(value: string): string {
  return value
    .replace(/\r?\n/g, '<br>')
    .replace(/\|/g, '\\|')
    .trim();
}

function canonicalExistingPath(inputPath: string): string {
  try {
    return fs.realpathSync(inputPath);
  } catch {
    return path.resolve(inputPath);
  }
}

export function validateChangeId(changeId: unknown): ChangeIdValidationResult {
  if (typeof changeId !== 'string') {
    return validationFailure('not_string', 'Change id must be a string.');
  }
  if (changeId.length === 0) {
    return validationFailure('empty', 'Change id cannot be empty.');
  }
  if (changeId.includes('/') || changeId.includes('\\')) {
    return validationFailure('path_separator', 'Change id cannot contain path separators.');
  }
  if (changeId === '.' || changeId === '..' || changeId.includes('..')) {
    return validationFailure('dot_segment', 'Change id cannot contain dot segments.');
  }
  if (changeId.startsWith('.')) {
    return validationFailure('leading_dot', 'Change id cannot start with a dot.');
  }
  if (!/^[a-z0-9-]+$/.test(changeId)) {
    return validationFailure('unsafe_characters', 'Change id may contain only lowercase letters, numbers, and hyphens.');
  }
  if (RESERVED_CHANGE_IDS.has(changeId)) {
    return validationFailure('reserved', `Change id "${changeId}" is reserved.`);
  }
  return { valid: true, change_id: changeId };
}

export function resolveChangeWorkspace(projectRoot: string, changeId: string): ChangeWorkspaceResolutionResult {
  const validation = validateChangeId(changeId);
  if (!validation.valid) return { ok: false, error: validation };

  const root = path.resolve(projectRoot);
  const changesRoot = path.resolve(root, '.planning', 'ndd', 'changes');
  const workspaceDir = path.resolve(changesRoot, validation.change_id);
  if (!isPathInside(changesRoot, workspaceDir) || !isPathInside(root, workspaceDir)) {
    return {
      ok: false,
      error: {
        code: 'path_escape',
        message: 'Resolved NDD change workspace escapes the project root.',
      },
    };
  }

  return {
    ok: true,
    change_id: validation.change_id,
    workspace_dir: workspaceDir,
    relative_workspace_dir: path.join('.planning', 'ndd', 'changes', validation.change_id),
  };
}

export function slugifyChangeStem(value: string): string {
  const stem = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return stem || 'change';
}

export function discoverMarkdownFiles(sourceFolder: string): string[] {
  const root = path.resolve(sourceFolder);
  let rootStat: fs.Stats;
  try {
    rootStat = fs.statSync(root);
  } catch {
    throw new Error(`Source folder does not exist: ${sourceFolder}`);
  }
  if (!rootStat.isDirectory()) {
    throw new Error(`Source folder is not a directory: ${sourceFolder}`);
  }

  const realRoot = fs.realpathSync(root);
  const files: string[] = [];

  function walk(dir: string): void {
    const realDir = fs.realpathSync(dir);
    if (!isPathInside(realRoot, realDir)) {
      throw new Error(`Source folder traversal detected while reading: ${dir}`);
    }
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.isFile() && MARKDOWN_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push(fullPath);
      }
    }
  }

  walk(root);
  return files;
}

export function generateChangeId(sourceFolder: string, markdownFiles?: string[]): GeneratedChangeId {
  const canonicalFolder = canonicalExistingPath(sourceFolder);
  const folderRoot = path.resolve(sourceFolder);
  const discoveredFiles = markdownFiles ?? discoverMarkdownFiles(folderRoot);
  const relativeFiles = discoveredFiles
    .map(file => normalizeRelativePathForHash(path.relative(folderRoot, path.resolve(file))))
    .sort();
  const stem = slugifyChangeStem(path.basename(folderRoot));
  const hashInput = [
    normalizePathForHash(canonicalFolder),
    ...relativeFiles,
  ].join('\n');
  const suffix = crypto.createHash('sha256').update(hashInput).digest('hex').slice(0, 10);
  return {
    change_id: `${stem}-${suffix}`,
    stem,
    suffix,
    source_folder: canonicalFolder,
    markdown_files: relativeFiles,
  };
}

function roleSignals(content: string, fileName: string): { frontmatter: string[]; headings: string[]; text: string } {
  const frontmatter = extractFrontmatter(content);
  const frontmatterSignals = Object.entries(frontmatter)
    .flatMap(([key, value]) => Array.isArray(value) ? [key, ...value.map(String)] : [key, String(value)])
    .map(value => value.toLowerCase());
  const headings = tokenizeHeadings(content).map(heading => heading.text.toLowerCase());
  const text = [
    fileName,
    ...frontmatterSignals,
    ...headings,
    content.slice(0, 4000),
  ].join('\n').toLowerCase();
  return { frontmatter: frontmatterSignals, headings, text };
}

function evidenceFrom(label: string, match: string): string {
  return `${label}: ${match}`;
}

export function inferSourceRole(filePath: string, content: string): InferredSourceRole {
  const fileName = path.basename(filePath).toLowerCase();
  const signals = roleSignals(content, fileName);

  const frontmatterRole = signals.frontmatter.find(value => /^(api-doc|business-doc|proposal|acceptance)$/.test(value));
  if (frontmatterRole) {
    return { role: frontmatterRole as SourceRole, evidence: evidenceFrom('frontmatter', frontmatterRole) };
  }

  const candidates: Array<{ role: Exclude<SourceRole, 'unknown'>; label: string; pattern: RegExp }> = [
    { role: 'acceptance', label: 'acceptance criteria', pattern: /\b(acceptance criteria|acceptance test|given\s+when\s+then|definition of done|uat)\b/ },
    { role: 'api-doc', label: 'api contract', pattern: /\b(api|endpoint|openapi|swagger|request|response|graphql|rest)\b/ },
    { role: 'business-doc', label: 'business process', pattern: /\b(business process|workflow|process|policy|rule|customer journey|operational)\b/ },
    { role: 'proposal', label: 'proposal', pattern: /\b(proposal|rfc|request for comments|approach|recommendation|option)\b/ },
  ];

  for (const heading of signals.headings) {
    for (const candidate of candidates) {
      if (candidate.pattern.test(heading)) {
        return { role: candidate.role, evidence: evidenceFrom('heading', heading) };
      }
    }
  }

  for (const candidate of candidates) {
    const fileMatch = candidate.pattern.exec(fileName);
    if (fileMatch) {
      return { role: candidate.role, evidence: evidenceFrom('filename', fileMatch[0]) };
    }
  }

  for (const candidate of candidates) {
    const textMatch = candidate.pattern.exec(signals.text);
    if (textMatch) {
      return { role: candidate.role, evidence: evidenceFrom('content', textMatch[0]) };
    }
  }

  return { role: 'unknown', evidence: '' };
}

function copySourceFile(sourceRoot: string, workspaceDir: string, sourceFile: string): IngestedSource {
  const relativePath = toPosixPath(path.relative(sourceRoot, sourceFile));
  if (relativePath.startsWith('../') || relativePath === '..' || path.isAbsolute(relativePath)) {
    throw new Error(`Markdown source escapes source folder: ${sourceFile}`);
  }

  const sourcesDir = path.join(workspaceDir, 'sources');
  const destination = path.resolve(sourcesDir, ...relativePath.split('/'));
  if (!isPathInside(sourcesDir, destination) || !isPathInside(workspaceDir, destination)) {
    throw new Error(`Copied source path escapes change workspace: ${relativePath}`);
  }

  platformEnsureDir(path.dirname(destination));
  fs.copyFileSync(sourceFile, destination);
  const content = fs.readFileSync(sourceFile, 'utf-8');
  const inference = inferSourceRole(relativePath, content);

  return {
    original_path: relativePath,
    copied_path: toPosixPath(path.relative(workspaceDir, destination)),
    absolute_source_path: sourceFile,
    absolute_copied_path: destination,
    role: inference.role,
    evidence: inference.evidence,
    warnings: [],
  };
}

function duplicateBasenameWarnings(sources: IngestedSource[]): string[] {
  const byBasename = new Map<string, string[]>();
  for (const source of sources) {
    const key = path.basename(source.original_path).toLowerCase();
    byBasename.set(key, [...(byBasename.get(key) ?? []), source.original_path]);
  }

  const warnings: string[] = [];
  for (const [basename, paths] of byBasename) {
    if (paths.length <= 1) continue;
    const warning = `Duplicate basename "${basename}" preserved by relative source paths: ${paths.join(', ')}`;
    warnings.push(warning);
    for (const source of sources) {
      if (paths.includes(source.original_path)) source.warnings.push('duplicate basename');
    }
  }
  return warnings;
}

function renderSourceManifest(changeId: string, sourceFolder: string, sources: IngestedSource[], warnings: string[]): string {
  const lines = [
    `# Source Manifest: ${changeId}`,
    '',
    `Source folder: \`${sourceFolder}\``,
    '',
    '| Original relative path | Workspace copied path | Inferred role | Evidence | Warnings |',
    '| --- | --- | --- | --- | --- |',
  ];

  for (const source of sources) {
    lines.push(`| ${[
      `\`${markdownTableCell(source.original_path)}\``,
      `\`${markdownTableCell(source.copied_path)}\``,
      markdownTableCell(source.role),
      markdownTableCell(source.evidence || ''),
      markdownTableCell(source.warnings.join('; ')),
    ].join(' | ')} |`);
  }

  lines.push('', '## Warnings', '');
  if (warnings.length === 0) {
    lines.push('None.');
  } else {
    for (const warning of warnings) {
      lines.push(`- ${warning}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

export function ingestMarkdownSources(opts: IngestMarkdownSourcesOptions): IngestMarkdownSourcesResult {
  if (!opts.sourceFolder || typeof opts.sourceFolder !== 'string') {
    throw new Error('Source folder is required for NDD change intake.');
  }

  const requestedSourceRoot = path.resolve(opts.sourceFolder);
  const markdownFiles = discoverMarkdownFiles(requestedSourceRoot);
  if (markdownFiles.length === 0) {
    throw new Error(`Source folder contains no Markdown files: ${opts.sourceFolder}`);
  }
  const sourceRoot = fs.realpathSync(requestedSourceRoot);

  const generated = opts.changeId ? null : generateChangeId(sourceRoot, markdownFiles);
  const changeId = opts.changeId ?? generated?.change_id ?? '';
  const workspace = initializeChangeWorkspace({
    projectRoot: opts.projectRoot,
    changeId,
    sourceFolder: sourceRoot,
    sourceCount: markdownFiles.length,
    artifacts: defaultArtifacts(),
    warnings: [],
    now: opts.now,
    updateIntakeMetadata: true,
  });

  const sourcesDir = path.join(workspace.workspace_dir, 'sources');
  platformEnsureDir(sourcesDir);
  const sources = markdownFiles.map(file => copySourceFile(sourceRoot, workspace.workspace_dir, fs.realpathSync(file)));
  const warnings = duplicateBasenameWarnings(sources);
  const manifestPath = path.join(workspace.workspace_dir, 'SOURCE-MANIFEST.md');
  platformWriteSync(manifestPath, renderSourceManifest(workspace.change_id, sourceRoot, sources, warnings));

  const updatedStatus = statusWithDefaults(readExistingStatus(workspace.status_path), {
    projectRoot: opts.projectRoot,
    changeId: workspace.change_id,
    sourceFolder: sourceRoot,
    sourceCount: sources.length,
    artifacts: defaultArtifacts(),
    warnings,
    now: opts.now,
    updateIntakeMetadata: true,
  });
  platformWriteSync(workspace.status_path, JSON.stringify(updatedStatus, null, 2) + '\n');

  return {
    ...workspace,
    status: updatedStatus,
    source_folder: sourceRoot,
    sources_dir: sourcesDir,
    manifest_path: manifestPath,
    sources,
    warnings,
  };
}

function nowIso(now?: Date | string): string {
  if (typeof now === 'string') return now;
  return (now ?? new Date()).toISOString();
}

function defaultArtifacts(): Record<string, string> {
  return {
    source_manifest: 'SOURCE-MANIFEST.md',
    change_spec: 'CHANGE-SPEC.md',
  };
}

function readExistingStatus(statusPath: string): NddChangeStatus | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record['change_id'] !== 'string') return null;
    return record as NddChangeStatus;
  } catch {
    return null;
  }
}

function statusWithDefaults(existing: NddChangeStatus | null, opts: InitializeChangeWorkspaceOptions): NddChangeStatus {
  const timestamp = nowIso(opts.now);
  const shouldUpdateIntake = !existing || opts.updateIntakeMetadata === true;
  const base: NddChangeStatus = {
    ...(existing ?? {}),
    change_id: opts.changeId,
    status: typeof existing?.status === 'string' ? existing.status : 'draft',
    phase: typeof existing?.phase === 'string' ? existing.phase : 'intake',
    source_folder: shouldUpdateIntake ? opts.sourceFolder : existing.source_folder,
    source_count: shouldUpdateIntake ? opts.sourceCount : existing.source_count,
    artifacts: shouldUpdateIntake ? (opts.artifacts ?? defaultArtifacts()) : existing.artifacts,
    warnings: shouldUpdateIntake ? (opts.warnings ?? []) : existing.warnings,
    created_at: typeof existing?.created_at === 'string' ? existing.created_at : timestamp,
    updated_at: timestamp,
  };
  if (!base.source_folder) base.source_folder = opts.sourceFolder;
  if (typeof base.source_count !== 'number') base.source_count = opts.sourceCount;
  if (!base.artifacts || typeof base.artifacts !== 'object' || Array.isArray(base.artifacts)) {
    base.artifacts = opts.artifacts ?? defaultArtifacts();
  }
  if (!Array.isArray(base.warnings)) base.warnings = opts.warnings ?? [];
  return base;
}

export function initializeChangeWorkspace(opts: InitializeChangeWorkspaceOptions): InitializeChangeWorkspaceResult {
  const resolved = resolveChangeWorkspace(opts.projectRoot, opts.changeId);
  if (!resolved.ok) {
    throw new Error(resolved.error.message);
  }

  platformEnsureDir(resolved.workspace_dir);
  const statusPath = path.join(resolved.workspace_dir, 'STATUS.json');
  const existing = readExistingStatus(statusPath);
  const status = statusWithDefaults(existing, opts);
  platformWriteSync(statusPath, JSON.stringify(status, null, 2) + '\n');

  return {
    ...resolved,
    status_path: statusPath,
    status,
    resumed: existing !== null,
  };
}

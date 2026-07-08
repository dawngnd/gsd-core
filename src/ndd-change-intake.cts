/**
 * NDD change intake helpers.
 *
 * Owns safe change-id validation, deterministic generated ids, and the
 * `.planning/ndd/changes/<change-id>/STATUS.json` workspace boundary.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { platformEnsureDir, platformWriteSync } from './shell-command-projection.cjs';

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
  const files: string[] = [];

  function walk(dir: string): void {
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


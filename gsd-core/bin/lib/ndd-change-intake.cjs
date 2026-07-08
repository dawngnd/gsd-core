"use strict";
/**
 * NDD change intake helpers.
 *
 * Owns safe change-id validation, deterministic generated ids, and the
 * `.planning/ndd/changes/<change-id>/STATUS.json` workspace boundary.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateChangeId = validateChangeId;
exports.resolveChangeWorkspace = resolveChangeWorkspace;
exports.slugifyChangeStem = slugifyChangeStem;
exports.discoverMarkdownFiles = discoverMarkdownFiles;
exports.generateChangeId = generateChangeId;
exports.inferSourceRole = inferSourceRole;
exports.ingestMarkdownSources = ingestMarkdownSources;
exports.initializeChangeWorkspace = initializeChangeWorkspace;
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const markdown_sectionizer_cjs_1 = require("./markdown-sectionizer.cjs");
const shell_command_projection_cjs_1 = require("./shell-command-projection.cjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const frontmatterMod = require("./frontmatter.cjs");
const { extractFrontmatter } = frontmatterMod;
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
function validationFailure(code, message) {
    return { valid: false, code, message };
}
function normalizePathForHash(value) {
    return node_path_1.default.resolve(value).split(node_path_1.default.sep).join('/');
}
function normalizeRelativePathForHash(value) {
    return value.split(node_path_1.default.sep).join('/');
}
function isPathInside(parent, child) {
    const relative = node_path_1.default.relative(parent, child);
    return relative === '' || (!!relative && !relative.startsWith('..') && !node_path_1.default.isAbsolute(relative));
}
function toPosixPath(value) {
    return value.split(node_path_1.default.sep).join('/');
}
function markdownTableCell(value) {
    return value
        .replace(/\r?\n/g, '<br>')
        .replace(/\|/g, '\\|')
        .trim();
}
function canonicalExistingPath(inputPath) {
    try {
        return node_fs_1.default.realpathSync(inputPath);
    }
    catch {
        return node_path_1.default.resolve(inputPath);
    }
}
function validateChangeId(changeId) {
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
function resolveChangeWorkspace(projectRoot, changeId) {
    const validation = validateChangeId(changeId);
    if (!validation.valid)
        return { ok: false, error: validation };
    const root = node_path_1.default.resolve(projectRoot);
    const changesRoot = node_path_1.default.resolve(root, '.planning', 'ndd', 'changes');
    const workspaceDir = node_path_1.default.resolve(changesRoot, validation.change_id);
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
        relative_workspace_dir: node_path_1.default.join('.planning', 'ndd', 'changes', validation.change_id),
    };
}
function slugifyChangeStem(value) {
    const stem = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-');
    return stem || 'change';
}
function discoverMarkdownFiles(sourceFolder) {
    const root = node_path_1.default.resolve(sourceFolder);
    let rootStat;
    try {
        rootStat = node_fs_1.default.statSync(root);
    }
    catch {
        throw new Error(`Source folder does not exist: ${sourceFolder}`);
    }
    if (!rootStat.isDirectory()) {
        throw new Error(`Source folder is not a directory: ${sourceFolder}`);
    }
    const realRoot = node_fs_1.default.realpathSync(root);
    const files = [];
    function walk(dir) {
        const realDir = node_fs_1.default.realpathSync(dir);
        if (!isPathInside(realRoot, realDir)) {
            throw new Error(`Source folder traversal detected while reading: ${dir}`);
        }
        const entries = node_fs_1.default.readdirSync(dir, { withFileTypes: true })
            .sort((a, b) => a.name.localeCompare(b.name));
        for (const entry of entries) {
            const fullPath = node_path_1.default.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
                continue;
            }
            if (entry.isFile() && MARKDOWN_EXTENSIONS.has(node_path_1.default.extname(entry.name).toLowerCase())) {
                files.push(fullPath);
            }
        }
    }
    walk(root);
    return files;
}
function generateChangeId(sourceFolder, markdownFiles) {
    const canonicalFolder = canonicalExistingPath(sourceFolder);
    const folderRoot = node_path_1.default.resolve(sourceFolder);
    const discoveredFiles = markdownFiles ?? discoverMarkdownFiles(folderRoot);
    const relativeFiles = discoveredFiles
        .map(file => normalizeRelativePathForHash(node_path_1.default.relative(folderRoot, node_path_1.default.resolve(file))))
        .sort();
    const stem = slugifyChangeStem(node_path_1.default.basename(folderRoot));
    const hashInput = [
        normalizePathForHash(canonicalFolder),
        ...relativeFiles,
    ].join('\n');
    const suffix = node_crypto_1.default.createHash('sha256').update(hashInput).digest('hex').slice(0, 10);
    return {
        change_id: `${stem}-${suffix}`,
        stem,
        suffix,
        source_folder: canonicalFolder,
        markdown_files: relativeFiles,
    };
}
function roleSignals(content, fileName) {
    const frontmatter = extractFrontmatter(content);
    const frontmatterSignals = Object.entries(frontmatter)
        .flatMap(([key, value]) => Array.isArray(value) ? [key, ...value.map(String)] : [key, String(value)])
        .map(value => value.toLowerCase());
    const headings = (0, markdown_sectionizer_cjs_1.tokenizeHeadings)(content).map(heading => heading.text.toLowerCase());
    const text = [
        fileName,
        ...frontmatterSignals,
        ...headings,
        content.slice(0, 4000),
    ].join('\n').toLowerCase();
    return { frontmatter: frontmatterSignals, headings, text };
}
function evidenceFrom(label, match) {
    return `${label}: ${match}`;
}
function inferSourceRole(filePath, content) {
    const fileName = node_path_1.default.basename(filePath).toLowerCase();
    const signals = roleSignals(content, fileName);
    const frontmatterRole = signals.frontmatter.find(value => /^(api-doc|business-doc|proposal|acceptance)$/.test(value));
    if (frontmatterRole) {
        return { role: frontmatterRole, evidence: evidenceFrom('frontmatter', frontmatterRole) };
    }
    const candidates = [
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
function copySourceFile(sourceRoot, workspaceDir, sourceFile) {
    const relativePath = toPosixPath(node_path_1.default.relative(sourceRoot, sourceFile));
    if (relativePath.startsWith('../') || relativePath === '..' || node_path_1.default.isAbsolute(relativePath)) {
        throw new Error(`Markdown source escapes source folder: ${sourceFile}`);
    }
    const sourcesDir = node_path_1.default.join(workspaceDir, 'sources');
    const destination = node_path_1.default.resolve(sourcesDir, ...relativePath.split('/'));
    if (!isPathInside(sourcesDir, destination) || !isPathInside(workspaceDir, destination)) {
        throw new Error(`Copied source path escapes change workspace: ${relativePath}`);
    }
    (0, shell_command_projection_cjs_1.platformEnsureDir)(node_path_1.default.dirname(destination));
    node_fs_1.default.copyFileSync(sourceFile, destination);
    const content = node_fs_1.default.readFileSync(sourceFile, 'utf-8');
    const inference = inferSourceRole(relativePath, content);
    return {
        original_path: relativePath,
        copied_path: toPosixPath(node_path_1.default.relative(workspaceDir, destination)),
        absolute_source_path: sourceFile,
        absolute_copied_path: destination,
        role: inference.role,
        evidence: inference.evidence,
        warnings: [],
    };
}
function duplicateBasenameWarnings(sources) {
    const byBasename = new Map();
    for (const source of sources) {
        const key = node_path_1.default.basename(source.original_path).toLowerCase();
        byBasename.set(key, [...(byBasename.get(key) ?? []), source.original_path]);
    }
    const warnings = [];
    for (const [basename, paths] of byBasename) {
        if (paths.length <= 1)
            continue;
        const warning = `Duplicate basename "${basename}" preserved by relative source paths: ${paths.join(', ')}`;
        warnings.push(warning);
        for (const source of sources) {
            if (paths.includes(source.original_path))
                source.warnings.push('duplicate basename');
        }
    }
    return warnings;
}
function renderSourceManifest(changeId, sourceFolder, sources, warnings) {
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
    }
    else {
        for (const warning of warnings) {
            lines.push(`- ${warning}`);
        }
    }
    lines.push('');
    return lines.join('\n');
}
function ingestMarkdownSources(opts) {
    if (!opts.sourceFolder || typeof opts.sourceFolder !== 'string') {
        throw new Error('Source folder is required for NDD change intake.');
    }
    const requestedSourceRoot = node_path_1.default.resolve(opts.sourceFolder);
    const markdownFiles = discoverMarkdownFiles(requestedSourceRoot);
    if (markdownFiles.length === 0) {
        throw new Error(`Source folder contains no Markdown files: ${opts.sourceFolder}`);
    }
    const sourceRoot = node_fs_1.default.realpathSync(requestedSourceRoot);
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
    const sourcesDir = node_path_1.default.join(workspace.workspace_dir, 'sources');
    (0, shell_command_projection_cjs_1.platformEnsureDir)(sourcesDir);
    const sources = markdownFiles.map(file => copySourceFile(sourceRoot, workspace.workspace_dir, node_fs_1.default.realpathSync(file)));
    const warnings = duplicateBasenameWarnings(sources);
    const manifestPath = node_path_1.default.join(workspace.workspace_dir, 'SOURCE-MANIFEST.md');
    (0, shell_command_projection_cjs_1.platformWriteSync)(manifestPath, renderSourceManifest(workspace.change_id, sourceRoot, sources, warnings));
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
    (0, shell_command_projection_cjs_1.platformWriteSync)(workspace.status_path, JSON.stringify(updatedStatus, null, 2) + '\n');
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
function nowIso(now) {
    if (typeof now === 'string')
        return now;
    return (now ?? new Date()).toISOString();
}
function defaultArtifacts() {
    return {
        source_manifest: 'SOURCE-MANIFEST.md',
        change_spec: 'CHANGE-SPEC.md',
    };
}
function readExistingStatus(statusPath) {
    try {
        const parsed = JSON.parse(node_fs_1.default.readFileSync(statusPath, 'utf-8'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
            return null;
        const record = parsed;
        if (typeof record['change_id'] !== 'string')
            return null;
        return record;
    }
    catch {
        return null;
    }
}
function statusWithDefaults(existing, opts) {
    const timestamp = nowIso(opts.now);
    const shouldUpdateIntake = !existing || opts.updateIntakeMetadata === true;
    const base = {
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
    if (!base.source_folder)
        base.source_folder = opts.sourceFolder;
    if (typeof base.source_count !== 'number')
        base.source_count = opts.sourceCount;
    if (!base.artifacts || typeof base.artifacts !== 'object' || Array.isArray(base.artifacts)) {
        base.artifacts = opts.artifacts ?? defaultArtifacts();
    }
    if (!Array.isArray(base.warnings))
        base.warnings = opts.warnings ?? [];
    return base;
}
function initializeChangeWorkspace(opts) {
    const resolved = resolveChangeWorkspace(opts.projectRoot, opts.changeId);
    if (!resolved.ok) {
        throw new Error(resolved.error.message);
    }
    (0, shell_command_projection_cjs_1.platformEnsureDir)(resolved.workspace_dir);
    const statusPath = node_path_1.default.join(resolved.workspace_dir, 'STATUS.json');
    const existing = readExistingStatus(statusPath);
    const status = statusWithDefaults(existing, opts);
    (0, shell_command_projection_cjs_1.platformWriteSync)(statusPath, JSON.stringify(status, null, 2) + '\n');
    return {
        ...resolved,
        status_path: statusPath,
        status,
        resumed: existing !== null,
    };
}

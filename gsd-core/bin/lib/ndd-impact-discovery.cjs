"use strict";
/**
 * NDD impact discovery helpers.
 *
 * Owns impact analysis types, capability config loading, codebase map
 * availability checking, CHANGE-SPEC requirement extraction, and
 * IMPACT.md rendering.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadCodebaseCapabilityConfig = loadCodebaseCapabilityConfig;
exports.checkCodebaseMapAvailability = checkCodebaseMapAvailability;
exports.extractRequirementSections = extractRequirementSections;
exports.renderImpactMarkdown = renderImpactMarkdown;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const markdown_sectionizer_cjs_1 = require("./markdown-sectionizer.cjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const intake = require("./ndd-change-intake.cjs");
const { resolveChangeWorkspace, validateChangeId } = intake;
// ─── Default Capability Config ────────────────────────────────────────────────
const DEFAULT_CAPABILITY_CONFIG = Object.freeze({
    tools: Object.freeze({
        codegraph: Object.freeze({
            available: false,
            config: Object.freeze({}),
            capabilities: Object.freeze({
                callers: true,
                callees: true,
                impact_analysis: true,
                symbol_lookup: true,
                semantic: false,
                knowledge: false,
            }),
        }),
        grep_search: Object.freeze({
            available: true,
            config: Object.freeze({}),
            capabilities: Object.freeze({
                callers: false,
                callees: false,
                impact_analysis: false,
                symbol_lookup: false,
                semantic: true,
                knowledge: false,
            }),
        }),
        wiki: Object.freeze({
            available: false,
            config: Object.freeze({ wiki_path: '', query_tool: '' }),
            capabilities: Object.freeze({
                callers: false,
                callees: false,
                impact_analysis: false,
                symbol_lookup: false,
                semantic: true,
                knowledge: true,
            }),
        }),
    }),
});
// ─── Config Loader ────────────────────────────────────────────────────────────
function loadCodebaseCapabilityConfig(packageRoot) {
    const configPath = node_path_1.default.join(packageRoot, 'gsd-core', 'ndd', 'codebase_capability.json');
    try {
        const raw = node_fs_1.default.readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed !== null &&
            typeof parsed === 'object' &&
            'tools' in parsed &&
            parsed.tools !== null &&
            typeof parsed.tools === 'object') {
            return parsed;
        }
        return DEFAULT_CAPABILITY_CONFIG;
    }
    catch {
        return DEFAULT_CAPABILITY_CONFIG;
    }
}
// ─── Codebase Map Availability ────────────────────────────────────────────────
function checkCodebaseMapAvailability(projectRoot) {
    const directory = node_path_1.default.join(projectRoot, '.planning', 'codebase');
    try {
        const stat = node_fs_1.default.statSync(directory);
        if (!stat.isDirectory()) {
            return { available: false, files: [], directory };
        }
        const entries = node_fs_1.default.readdirSync(directory);
        const mdFiles = entries.filter(entry => entry.endsWith('.md'));
        return { available: mdFiles.length > 0, files: mdFiles, directory };
    }
    catch {
        return { available: false, files: [], directory };
    }
}
// ─── CHANGE-SPEC Requirement Extractor ────────────────────────────────────────
function extractRequirementSections(changeSpecContent) {
    const headings = (0, markdown_sectionizer_cjs_1.tokenizeHeadings)(changeSpecContent);
    // Find the heading matching "Confirmed Source-Backed Requirements" (case-insensitive substring)
    const targetHeading = headings.find(h => h.text.toLowerCase().includes('confirmed source-backed requirements'));
    if (!targetHeading)
        return [];
    // Get the body between this heading and the next heading at the same or higher level
    const lines = changeSpecContent.split('\n');
    const startLine = targetHeading.line; // 1-based, heading itself
    const nextHeadingIdx = headings.findIndex(h => h.line > targetHeading.line && h.level <= targetHeading.level);
    const endLine = nextHeadingIdx !== -1 ? headings[nextHeadingIdx].line - 1 : lines.length;
    const bodyLines = lines.slice(startLine, endLine); // startLine is 1-based, so slice(startLine) = lines after heading
    const bulletPattern = /^[-*]\s+(.+)$/;
    const results = [];
    for (const line of bodyLines) {
        const match = bulletPattern.exec(line.trim());
        if (match) {
            results.push({ id: `R${results.length + 1}`, title: match[1].trim() });
        }
    }
    return results;
}
// ─── Private Helpers ──────────────────────────────────────────────────────────
function markdownTableCell(value) {
    return value
        .replace(/\r?\n/g, '<br>')
        .replace(/\|/g, '\\|')
        .trim();
}
// ─── IMPACT.md Renderer ──────────────────────────────────────────────────────
function renderImpactMarkdown(data) {
    const lines = [];
    // Compute summary counts
    const allEntries = [
        ...data.groups.flatMap(g => g.entries),
        ...data.cross_cutting,
    ];
    const confirmed = allEntries.filter(e => e.confidence === 'confirmed').length;
    const likely = allEntries.filter(e => e.confidence === 'likely').length;
    const unknown = allEntries.filter(e => e.confidence === 'unknown').length;
    // YAML frontmatter
    lines.push('---');
    lines.push(`change_id: ${data.change_id}`);
    lines.push('phase: impact-discovery');
    lines.push('status: draft');
    lines.push(`created: ${new Date().toISOString()}`);
    lines.push(`tools_used: [${data.tools_used.join(', ')}]`);
    lines.push('---');
    lines.push('');
    // Title
    lines.push(`# Impact Analysis: ${data.change_id}`);
    lines.push('');
    // Summary table
    lines.push('## Summary');
    lines.push('');
    lines.push('| Confidence | Count |');
    lines.push('|-----------|-------|');
    lines.push(`| Confirmed | ${confirmed} |`);
    lines.push(`| Likely | ${likely} |`);
    lines.push(`| Unknown | ${unknown} |`);
    lines.push('');
    // Per-requirement sections
    for (const group of data.groups) {
        lines.push(`## Impact: Requirement ${group.requirement_id} — "${group.requirement_title}"`);
        lines.push('');
        lines.push('| File | Evidence | Source Ref | Discovered By |');
        lines.push('|------|----------|------------|---------------|');
        if (group.entries.length === 0) {
            lines.push('| None identified | — | — | — |');
        }
        else {
            for (const entry of group.entries) {
                lines.push(`| ${[
                    markdownTableCell(entry.file),
                    markdownTableCell(entry.evidence),
                    markdownTableCell(entry.source_ref),
                    markdownTableCell(entry.discovered_by),
                ].join(' | ')} |`);
            }
        }
        lines.push('');
    }
    // Cross-cutting section
    lines.push('## Cross-cutting Impact');
    lines.push('');
    lines.push('| File | Evidence | Source Ref | Discovered By |');
    lines.push('|------|----------|------------|---------------|');
    if (data.cross_cutting.length === 0) {
        lines.push('| None identified | — | — | — |');
    }
    else {
        for (const entry of data.cross_cutting) {
            lines.push(`| ${[
                markdownTableCell(entry.file),
                markdownTableCell(entry.evidence),
                markdownTableCell(entry.source_ref),
                markdownTableCell(entry.discovered_by),
            ].join(' | ')} |`);
        }
    }
    lines.push('');
    return lines.join('\n');
}

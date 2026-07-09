"use strict";
/**
 * NDD verification helpers.
 *
 * Handles CHANGE-SPEC.md acceptance criteria extraction, evidence matching
 * against GSD verification artifacts, user overrides, and NDD STATUS.json updates.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveNddLinkedPhase = resolveNddLinkedPhase;
exports.parseAcceptanceCriteria = parseAcceptanceCriteria;
exports.readGsdVerificationStatus = readGsdVerificationStatus;
exports.prepareNddVerification = prepareNddVerification;
exports.renderNddVerificationMarkdown = renderNddVerificationMarkdown;
exports.writeNddVerification = writeNddVerification;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const markdown_sectionizer_cjs_1 = require("./markdown-sectionizer.cjs");
const shell_command_projection_cjs_1 = require("./shell-command-projection.cjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const intake = require("./ndd-change-intake.cjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const phaseLocator = require("./phase-locator.cjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const verificationMod = require("./verification.cjs");
const { readVerificationStatus } = verificationMod;
function toPosixPath(value) {
    return value.split(node_path_1.default.sep).join('/');
}
function locateCurrentPhase(projectRoot, phaseId) {
    const located = phaseLocator.findPhaseInternal(projectRoot, phaseId);
    if (!located || located.archived || typeof located.directory !== 'string')
        return null;
    if (!located.directory.startsWith('.planning/phases/'))
        return null;
    const phaseDir = node_path_1.default.resolve(projectRoot, located.directory);
    if (!node_fs_1.default.existsSync(phaseDir) || !node_fs_1.default.statSync(phaseDir).isDirectory())
        return null;
    return {
        phase_id: String(located.phase_number ?? phaseId),
        phase_dir: toPosixPath(located.directory),
        phase_name: typeof located.phase_name === 'string' ? located.phase_name : null,
        phase_slug: typeof located.phase_slug === 'string' ? located.phase_slug : null,
    };
}
function readPhaseLinkPhaseId(content) {
    const match = /^- GSD phase id:\s*(.+)$/m.exec(content);
    return match ? match[1].trim() : null;
}
function readPhaseLinkChangeId(content) {
    const match = /^- Change id:\s*(.+)$/m.exec(content);
    return match ? match[1].trim() : null;
}
function readPhaseLinkPhaseDir(content) {
    const match = /^- GSD phase directory:\s*(.+)$/m.exec(content);
    return match ? match[1].trim() : null;
}
function readPhaseLinkPlanFiles(content) {
    const parts = content.split('## Plan Files');
    if (parts.length < 2)
        return [];
    const afterPlanFiles = parts[1].split('##')[0];
    const lines = afterPlanFiles.split(/\r?\n/);
    const planFiles = [];
    const regex = /^- (.+-PLAN\.md.*)$/;
    for (const line of lines) {
        const match = regex.exec(line.trim());
        if (match) {
            planFiles.push(match[1].trim());
        }
    }
    return planFiles;
}
function isPhaseIdInput(input) {
    return /^\d+$/.test(input);
}
function resolveNddLinkedPhase(projectRoot, inputId) {
    let change_id;
    let phase_id;
    let phase_dir;
    let plan_files;
    let phase_link_path;
    if (isPhaseIdInput(inputId)) {
        const changesRoot = node_path_1.default.join(projectRoot, '.planning', 'ndd', 'changes');
        if (!node_fs_1.default.existsSync(changesRoot)) {
            return { ok: false, message: `No NDD change found linked to phase '${inputId}'.` };
        }
        const subdirs = node_fs_1.default.readdirSync(changesRoot);
        const matches = [];
        for (const subdir of subdirs) {
            const dirPath = node_path_1.default.join(changesRoot, subdir);
            if (!node_fs_1.default.statSync(dirPath).isDirectory())
                continue;
            const phaseLinkPath = node_path_1.default.join(dirPath, 'phase-link.md');
            if (node_fs_1.default.existsSync(phaseLinkPath)) {
                const content = node_fs_1.default.readFileSync(phaseLinkPath, 'utf-8');
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
        phase_link_path = toPosixPath(node_path_1.default.relative(projectRoot, match.phaseLinkPath));
    }
    else {
        const resolved = intake.resolveChangeWorkspace(projectRoot, inputId);
        if (!resolved.ok) {
            return { ok: false, message: resolved.error.message };
        }
        const phaseLinkPath = node_path_1.default.join(resolved.workspace_dir, 'phase-link.md');
        if (!node_fs_1.default.existsSync(phaseLinkPath)) {
            return { ok: false, message: `Phase-link metadata not found for change '${inputId}'. Run ndd-plan-phase first.` };
        }
        const content = node_fs_1.default.readFileSync(phaseLinkPath, 'utf-8');
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
        phase_link_path = toPosixPath(node_path_1.default.relative(projectRoot, phaseLinkPath));
    }
    const phase = locateCurrentPhase(projectRoot, phase_id);
    if (!phase) {
        return { ok: false, message: `Target GSD phase '${phase_id}' was not found under .planning/phases/.` };
    }
    phase_dir = phase.phase_dir;
    const absPhaseDir = node_path_1.default.resolve(projectRoot, phase_dir);
    if (!node_fs_1.default.existsSync(absPhaseDir) || !node_fs_1.default.statSync(absPhaseDir).isDirectory()) {
        return { ok: false, message: `Target GSD phase '${phase_id}' was not found under .planning/phases/.` };
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
function extractSectionBody(content, headingMatcher) {
    const headings = (0, markdown_sectionizer_cjs_1.tokenizeHeadings)(content);
    const heading = headings.find(item => headingMatcher(item.text));
    if (!heading)
        return null;
    const lines = content.split(/\r?\n/);
    const nextHeading = headings.find(item => item.line > heading.line && item.level <= heading.level);
    const endLine = nextHeading ? nextHeading.line - 1 : lines.length;
    return lines.slice(heading.line, endLine).join('\n').trim();
}
function parseAcceptanceCriteria(content) {
    const body = extractSectionBody(content, heading => heading.toLowerCase() === 'acceptance criteria');
    if (body === null) {
        return { ok: false, error: { code: 'missing_acceptance_criteria', message: 'No "## Acceptance Criteria" section was found in CHANGE-SPEC.md.' } };
    }
    const lines = body.split(/\r?\n/).map(line => line.trim());
    const criteria = [];
    for (const line of lines) {
        if (line.startsWith('-') || line.startsWith('*') || line.startsWith('+')) {
            const criterion = line.replace(/^[-*+]\s+/, '').trim();
            if (criterion.length > 0) {
                criteria.push(criterion);
            }
        }
        else {
            const match = /^\d+[.)]\s+(.+)$/.exec(line);
            if (match) {
                const criterion = match[1].trim();
                if (criterion.length > 0) {
                    criteria.push(criterion);
                }
            }
        }
    }
    if (criteria.length === 0) {
        return { ok: false, error: { code: 'missing_acceptance_criteria', message: 'The "## Acceptance Criteria" section in CHANGE-SPEC.md is empty.' } };
    }
    return { ok: true, criteria };
}
function readGsdVerificationStatus(projectRoot, phaseDir) {
    const absPhaseDir = node_path_1.default.resolve(projectRoot, phaseDir);
    const result = readVerificationStatus(absPhaseDir);
    // Also try to resolve the actual path to VERIFICATION.md inside phaseDir
    let gsd_verification_path;
    try {
        const entries = node_fs_1.default.readdirSync(absPhaseDir);
        const candidates = entries.filter((f) => f.endsWith('-VERIFICATION.md')).sort();
        if (candidates.length > 0) {
            gsd_verification_path = toPosixPath(node_path_1.default.relative(projectRoot, node_path_1.default.join(absPhaseDir, candidates[0])));
        }
    }
    catch {
        // ignore
    }
    return {
        status: result.status,
        message: result.next_action,
        next_command: result.next_command,
        gsd_verification_path,
    };
}
function cleanString(str) {
    return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}
function prepareNddVerification(opts) {
    const resolved = resolveNddLinkedPhase(opts.projectRoot, opts.inputId);
    if (!resolved.ok) {
        return { ok: false, code: 'resolution_failed', message: resolved.message };
    }
    const changeId = resolved.change_id;
    const phaseId = resolved.phase_id;
    const phaseDir = resolved.phase_dir;
    const workspace = intake.resolveChangeWorkspace(opts.projectRoot, changeId);
    if (!workspace.ok) {
        return { ok: false, code: 'workspace_failed', message: workspace.error.message };
    }
    const changeSpecPath = node_path_1.default.join(workspace.workspace_dir, 'CHANGE-SPEC.md');
    if (!node_fs_1.default.existsSync(changeSpecPath)) {
        return { ok: false, code: 'missing_change_spec', message: `CHANGE-SPEC.md not found in change folder for '${changeId}'.` };
    }
    const changeSpecContent = node_fs_1.default.readFileSync(changeSpecPath, 'utf-8');
    const criteriaResult = parseAcceptanceCriteria(changeSpecContent);
    if (!criteriaResult.ok) {
        return { ok: false, code: criteriaResult.error.code, message: criteriaResult.error.message };
    }
    const gsdVerification = readGsdVerificationStatus(opts.projectRoot, phaseDir);
    if (gsdVerification.status !== 'passed') {
        return {
            ok: false,
            code: 'gsd_verification_not_passed',
            message: `Canonical GSD verification is not passed. Status: '${gsdVerification.status}'.`,
            gsd_verification_status: gsdVerification.status,
        };
    }
    // Find GSD UAT.md or similar inside phase directory for reference
    let uat_path;
    const absPhaseDir = node_path_1.default.resolve(opts.projectRoot, phaseDir);
    try {
        const entries = node_fs_1.default.readdirSync(absPhaseDir);
        const uatCandidates = entries.filter(f => f.endsWith('-UAT.md') || f === 'UAT.md').sort();
        if (uatCandidates.length > 0) {
            uat_path = toPosixPath(node_path_1.default.relative(opts.projectRoot, node_path_1.default.join(absPhaseDir, uatCandidates[0])));
        }
    }
    catch {
        // ignore
    }
    // Scan phase files for evidence matching
    const evidenceFilesContent = [];
    try {
        for (const file of node_fs_1.default.readdirSync(absPhaseDir)) {
            if (file.endsWith('-VERIFICATION.md') || file.endsWith('-UAT.md') || file.endsWith('-SUMMARY.md') || file === 'VERIFICATION.md' || file === 'UAT.md') {
                const filePath = node_path_1.default.join(absPhaseDir, file);
                evidenceFilesContent.push({
                    name: file,
                    content: node_fs_1.default.readFileSync(filePath, 'utf-8'),
                });
            }
        }
    }
    catch {
        // ignore
    }
    const criteria = [];
    let requires_override = false;
    for (const criterionText of criteriaResult.criteria) {
        let evidence;
        // Check for evidence in files
        for (const fileObj of evidenceFilesContent) {
            if (cleanString(fileObj.content).includes(cleanString(criterionText))) {
                evidence = `Verified in phase artifact: ${fileObj.name}`;
                break;
            }
        }
        if (evidence) {
            criteria.push({
                text: criterionText,
                status: 'passed_with_evidence',
                evidence,
            });
        }
        else {
            // Check if user provided an override for this criterion
            const matchedOverrideKey = Object.keys(opts.overrides || {}).find(key => cleanString(key) === cleanString(criterionText));
            const overrideVal = matchedOverrideKey ? opts.overrides[matchedOverrideKey] : undefined;
            if (overrideVal && overrideVal.reason && overrideVal.person) {
                criteria.push({
                    text: criterionText,
                    status: 'requires_override', // keep status as requires_override or passed? Must-haves: "Unmapped criteria require explicit override records"
                    override: {
                        reason: overrideVal.reason,
                        person: overrideVal.person,
                        timestamp: overrideVal.timestamp || new Date().toISOString(),
                    },
                });
            }
            else {
                criteria.push({
                    text: criterionText,
                    status: 'requires_override',
                });
                requires_override = true;
            }
        }
    }
    return {
        ok: true,
        change_id: changeId,
        phase_id: phaseId,
        phase_dir: phaseDir,
        verification_path: toPosixPath(node_path_1.default.join(workspace.relative_workspace_dir, 'VERIFICATION.md')),
        gsd_verification_status: gsdVerification.status,
        gsd_verification_path: gsdVerification.gsd_verification_path,
        uat_path,
        gate_passed: !requires_override,
        requires_override,
        criteria,
    };
}
function renderNddVerificationMarkdown(input) {
    const lines = [
        `# NDD Verification: ${input.change_id}`,
        '',
        '## Verification Metadata',
        '',
        `- Change ID: ${input.change_id}`,
        `- Linked GSD phase ID: ${input.phase_id}`,
        `- Linked GSD phase directory: \`${input.phase_dir}\``,
        `- GSD verification status: ${input.gsd_verification_status}`,
        `- GSD verification path: \`${input.gsd_verification_path || 'none'}\``,
        `- GSD UAT path: \`${input.uat_path || 'none'}\``,
        `- NDD verification status: ${input.gate_passed ? 'passed' : 'pending_overrides'}`,
        `- Verified at: ${input.gate_passed ? new Date().toISOString() : 'pending'}`,
        '',
        '## Acceptance Criteria Verification',
        '',
        '| Acceptance Criterion | Status | Evidence / Override Reference |',
        '| --- | --- | --- |',
    ];
    for (const criterion of input.criteria || []) {
        let ref = '';
        let statusText = '';
        if (criterion.status === 'passed_with_evidence') {
            statusText = 'Passed (Evidence)';
            ref = criterion.evidence || '';
        }
        else if (criterion.override) {
            statusText = 'Passed (Override)';
            ref = `Override by ${criterion.override.person}: ${criterion.override.reason} (${criterion.override.timestamp})`;
        }
        else {
            statusText = 'Requires Override';
            ref = 'No evidence found. Needs manual override.';
        }
        lines.push(`| ${criterion.text} | ${statusText} | ${ref} |`);
    }
    const overridesList = (input.criteria || []).filter(c => c.override);
    if (overridesList.length > 0) {
        lines.push('', '## Override Records', '');
        for (const c of overridesList) {
            lines.push(`### Criterion: ${c.text}`);
            lines.push(`- **Person**: ${c.override.person}`);
            lines.push(`- **Reason**: ${c.override.reason}`);
            lines.push(`- **Timestamp**: ${c.override.timestamp}`);
            lines.push('');
        }
    }
    lines.push('');
    return lines.join('\n');
}
function writeNddVerification(opts) {
    const prepared = prepareNddVerification(opts);
    if (!prepared.ok)
        return prepared;
    const workspace = intake.resolveChangeWorkspace(opts.projectRoot, prepared.change_id);
    if (!workspace.ok) {
        return { ok: false, code: 'workspace_failed', message: workspace.error.message };
    }
    const mdContent = renderNddVerificationMarkdown(prepared);
    const verificationFilePath = node_path_1.default.join(workspace.workspace_dir, 'VERIFICATION.md');
    (0, shell_command_projection_cjs_1.platformWriteSync)(verificationFilePath, mdContent);
    if (prepared.gate_passed) {
        const status = intake.readStatus(workspace.workspace_dir);
        if (status) {
            const updatedStatus = {
                ...status,
                verified: true,
                verification_path: toPosixPath(node_path_1.default.relative(opts.projectRoot, verificationFilePath)),
                verified_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            intake.writeStatus(workspace.workspace_dir, updatedStatus);
        }
    }
    return prepared;
}

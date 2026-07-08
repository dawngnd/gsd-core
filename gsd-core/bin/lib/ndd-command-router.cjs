"use strict";
/**
 * NDD command router.
 *
 * Keeps the NDD surface local and thin:
 * - `gsd-tools ndd change <docs-folder> [change-id]` → change-intake helper
 * - `gsd-tools ndd impact <change-id>` → impact-discovery helper
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const node_path_1 = __importDefault(require("node:path"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ioMod = require("./io.cjs");
const { output, ERROR_REASON } = ioMod;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const intake = require("./ndd-change-intake.cjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const impact = require("./ndd-impact-discovery.cjs");
function routeNddCommand({ args, cwd, raw, error }) {
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
            sourceFolder: node_path_1.default.resolve(cwd, docsFolder),
            changeId,
        });
        output({
            ok: true,
            change_id: result.change_id,
            workspace_dir: result.relative_workspace_dir,
            status_path: node_path_1.default.relative(cwd, result.status_path).split(node_path_1.default.sep).join('/'),
            source_manifest: node_path_1.default.relative(cwd, result.manifest_path).split(node_path_1.default.sep).join('/'),
            change_spec: node_path_1.default.relative(cwd, result.change_spec_path).split(node_path_1.default.sep).join('/'),
            source_count: result.sources.length,
            warnings: result.warnings,
        }, raw);
    }
    else if (subcommand === 'impact') {
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
        }
        else {
            error(result.error.message, ERROR_REASON.SDK_MISSING_ARG);
        }
    }
    else {
        error('Unknown ndd subcommand. Available: change, impact', ERROR_REASON.SDK_UNKNOWN_COMMAND);
    }
}
module.exports = {
    routeNddCommand,
};

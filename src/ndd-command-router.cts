/**
 * NDD command router.
 *
 * Keeps the NDD surface local and thin: `gsd-tools ndd change <docs-folder>
 * [change-id]` delegates to the deterministic change-intake helper.
 */

import path from 'node:path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import ioMod = require('./io.cjs');
const { output, ERROR_REASON } = ioMod;
// eslint-disable-next-line @typescript-eslint/no-require-imports
import intake = require('./ndd-change-intake.cjs');

interface RouteNddCommandOptions {
  args: string[];
  cwd: string;
  raw: boolean;
  error: (message: string, reason?: string) => void;
}

function routeNddCommand({ args, cwd, raw, error }: RouteNddCommandOptions): void {
  const subcommand = args[1];
  if (subcommand !== 'change') {
    error('Unknown ndd subcommand. Available: change', ERROR_REASON.SDK_UNKNOWN_COMMAND);
    return;
  }

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
}

export = {
  routeNddCommand,
};

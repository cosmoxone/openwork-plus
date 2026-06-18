/**
 * GUI 操作 NDJSON 审计日志（P2-3）。
 * 路径：<OPENWORK_DATA_DIR>/logs/gui-operate/operations.ndjson
 * 每行一条 JSON：时间戳、工具名、应用、坐标摘要等。
 */
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';

export type GuiOperationLogEntry = {
  ts: string;
  tool: string;
  appName?: string;
  operation?: string;
  x?: number;
  y?: number;
  xNormalized?: number;
  yNormalized?: number;
  displayIndex?: number;
  meta?: Record<string, unknown>;
};

function resolveDataDir(): string {
  if (process.env.OPENWORK_DATA_DIR) {
    return process.env.OPENWORK_DATA_DIR;
  }
  const platform = os.platform();
  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'openwork');
  }
  if (platform === 'win32') {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
      'openwork'
    );
  }
  return path.join(os.homedir(), '.config', 'openwork');
}

export function guiOperationsNdjsonPath(dataDir?: string): string {
  const root = dataDir ?? resolveDataDir();
  return path.join(root, 'logs', 'gui-operate', 'operations.ndjson');
}

export async function appendGuiOperationLog(
  entry: GuiOperationLogEntry,
  dataDir?: string
): Promise<void> {
  const filePath = guiOperationsNdjsonPath(dataDir);
  const dir = path.dirname(filePath);
  if (!fsSync.existsSync(dir)) {
    await fs.mkdir(dir, { recursive: true });
  }
  const row = {
    ...entry,
    ts: entry.ts || new Date().toISOString(),
  };
  await fs.appendFile(filePath, `${JSON.stringify(row)}\n`, 'utf8');
}

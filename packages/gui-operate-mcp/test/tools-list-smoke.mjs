// gui-operate-mcp 冒烟测试：启动编译后的 server，走 MCP 生命周期，断言 tools/list 非空。
// 前置：先 `npm install && npm run build`（或 pnpm 等价）。
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(here, '..', 'dist', 'server.js');

const env = { ...process.env, OPENWORK_DATA_DIR: path.join(os.tmpdir(), 'openwork-mcp-smoke') };
const child = spawn(process.execPath, [serverPath], { env, stdio: ['pipe', 'pipe', 'ignore'] });

const requests = [
  { jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } } },
  { jsonrpc: '2.0', method: 'notifications/initialized' },
  { jsonrpc: '2.0', id: 1, method: 'tools/list' },
];
child.stdin.write(requests.map((r) => JSON.stringify(r)).join('\n') + '\n');

let buf = '';
const timer = setTimeout(() => { console.error('FAIL: 超时未收到 tools/list 响应'); child.kill(); process.exit(1); }, 15000);

child.stdout.on('data', (chunk) => {
  buf += chunk.toString();
  for (const line of buf.split('\n')) {
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id === 1 && msg.result?.tools) {
      const n = msg.result.tools.length;
      clearTimeout(timer);
      child.kill();
      if (n > 0) { console.log(`PASS: tools/list 返回 ${n} 个工具`); process.exit(0); }
      console.error('FAIL: tools 为空'); process.exit(1);
    }
  }
});

child.on('exit', (code) => { clearTimeout(timer); console.error(`FAIL: server 提前退出 code=${code}`); process.exit(1); });

/**
 * App-Server stdio 宿主：委托 @openwork-plus/host-api-adapter 共享核心。
 */
import readline from "node:readline";
import process from "node:process";
import { ErrorCode, makeError } from "../../appserver-contract/src/runtime.mjs";
import { handleJsonRpcMessage } from "../../host-api-adapter/src/jsonrpc-adapter.mjs";

function writeMessage(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

async function handleLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return;

  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    writeMessage(makeError(null, ErrorCode.ParseError, "Parse error"));
    return;
  }

  const resp = await handleJsonRpcMessage(msg);
  if (resp) writeMessage(resp);
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on("line", (line) => {
  void handleLine(line);
});
rl.on("close", () => process.exit(0));

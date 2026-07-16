/**
 * HTTP Host API → JSON-RPC 方法映射（P0-ARC-2 最小集）。
 */
import { Methods } from "../../appserver-contract/src/runtime.mjs";
import { dispatchAppServerMethod, CONTRACT_VERSION } from "./core-handlers.mjs";
import { dispatchRpaMethod } from "./rpa-handlers.mjs";

/** @type {Record<string, { method: string, id: number }>} */
export const HTTP_ROUTE_MAP = {
  "GET /api/health": { method: Methods.health.check, id: 1001 },
  "GET /api/convergence/contract": { method: Methods.capabilities.probe, id: 1002 },
  "POST /api/metering/usage": { method: Methods.metering.usage, id: 1003 },
  "GET /api/metering/balance": { method: Methods.metering.balance, id: 1004 },
  "POST /api/exec/run": { method: Methods.exec.run, id: 1005 },
  "POST /api/session/start": { method: Methods.session.start, id: 1006 },
  "GET /api/session/list": { method: Methods.session.list, id: 1007 },
  "POST /api/turn/start": { method: Methods.turn.start, id: 1008 },
  "POST /api/turn/interrupt": { method: Methods.turn.interrupt, id: 1009 },
  "POST /api/turn/steer": { method: Methods.turn.steer, id: 1010 },
};

/** 场景 E：RPA 控制面板 HTTP 路由 */
const RPA_HTTP_ROUTES = {
  "GET /api/rpa/status": "rpa/status",
  "GET /api/rpa/screenshots": "rpa/screenshots/list",
  "GET /api/rpa/history": "rpa/history/list",
  "GET /api/rpa/ndjson": "rpa/ndjson/list",
  "GET /api/rpa/logs": "rpa/logs/list",
  "POST /api/rpa/capture": "rpa/screenshot/capture",
  "POST /api/rpa/automation": "rpa/automation/set",
};

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {string} body
 */
export async function handleHttpRequest(req, body) {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const key = `${req.method} ${url.pathname}`;
  const route = HTTP_ROUTE_MAP[key];

  if (key === "GET /api/convergence/contract") {
    return {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Convergence-Contract-Version": String(CONTRACT_VERSION) },
      body: JSON.stringify({ contractVersion: CONTRACT_VERSION, transport: "http" }),
    };
  }

  const rpaMethod = RPA_HTTP_ROUTES[key];
  if (rpaMethod) {
    let params = {};
    if (req.method === "GET") {
      url.searchParams.forEach((v, k) => {
        if (k === "limit" || k === "displayIndex") params[k] = Number(v);
        else if (k === "dataDir") params[k] = v;
      });
    } else if (body) {
      try {
        params = JSON.parse(body);
      } catch {
        return { status: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "invalid_json" }) };
      }
    }
    try {
      const result = await dispatchRpaMethod(rpaMethod, params);
      return {
        status: 200,
        headers: { "Content-Type": "application/json", "X-Convergence-Contract-Version": String(CONTRACT_VERSION) },
        body: JSON.stringify({ result, contractVersion: CONTRACT_VERSION }),
      };
    } catch (error) {
      return {
        status: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: { message: error instanceof Error ? error.message : String(error) } }),
      };
    }
  }

  if (!route) {
    return {
      status: 404,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "not_found", path: url.pathname }),
    };
  }

  let params = undefined;
  if (req.method === "GET" && route.method === Methods.session.list) {
    params = {};
  } else if (body && (req.method === "POST" || req.method === "PUT")) {
    try {
      params = JSON.parse(body);
    } catch {
      return { status: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "invalid_json" }) };
    }
  }

  const rpc = await dispatchAppServerMethod(route.method, params, route.id);
  const status = rpc.error ? (rpc.error.code === -32601 ? 404 : 400) : 200;
  return {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Convergence-Contract-Version": String(CONTRACT_VERSION),
    },
    body: JSON.stringify(rpc.error ? { error: rpc.error } : { result: rpc.result, contractVersion: CONTRACT_VERSION }),
  };
}

/**
 * 启动最小 HTTP Host API（测试/本地 sidecar 用）。
 * @param {{ port?: number, host?: string }} [opts]
 */
export async function startHttpServer(opts = {}) {
  const http = await import("node:http");
  const port = opts.port ?? 13210;
  const host = opts.host ?? "127.0.0.1";

  const server = http.createServer((req, res) => {
    /** @type {Buffer[]} */
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      void (async () => {
        const body = Buffer.concat(chunks).toString("utf8");
        const out = await handleHttpRequest(req, body);
        res.writeHead(out.status, out.headers);
        res.end(out.body);
      })();
    });
  });

  await new Promise((resolve) => server.listen(port, host, resolve));
  return { server, port, host, url: `http://${host}:${port}` };
}

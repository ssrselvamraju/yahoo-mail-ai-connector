import { createServer } from "node:http";
import type { IncomingMessage, Server as HttpServer, ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { FakeMailProvider } from "../../../packages/mail-core/src/fake-provider.js";
import { createMailMcpServer } from "../../../packages/mcp-contract/src/server.js";

const MAX_REQUEST_BYTES = 256 * 1024;

export interface SyntheticHttpServerOptions {
  allowedHostnames?: string[];
  allowedOriginHostnames?: string[];
}

function reject(response: ServerResponse, status: number, error: string): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify({ error }));
}

function hostnameFromHostHeader(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(`http://${value}`).hostname.toLocaleLowerCase();
  } catch {
    return undefined;
  }
}

function requestPassesNetworkGuards(
  request: IncomingMessage,
  response: ServerResponse,
  allowedHostnames: Set<string>,
  allowedOriginHostnames: Set<string>,
): boolean {
  const host = hostnameFromHostHeader(request.headers.host);
  if (!host || !allowedHostnames.has(host)) {
    reject(response, 403, "invalid_host");
    return false;
  }
  const origin = request.headers.origin;
  if (origin) {
    let originHostname: string | undefined;
    try {
      originHostname = new URL(origin).hostname.toLocaleLowerCase();
    } catch {
      originHostname = undefined;
    }
    if (!originHostname || !allowedOriginHostnames.has(originHostname)) {
      reject(response, 403, "invalid_origin");
      return false;
    }
  }
  return true;
}

async function readBoundedBody(request: IncomingMessage): Promise<Buffer> {
  const declaredLength = Number.parseInt(request.headers["content-length"] ?? "0", 10);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) throw new Error("request_too_large");
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buffer.length;
    if (total > MAX_REQUEST_BYTES) throw new Error("request_too_large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function toWebRequest(request: IncomingMessage): Promise<Request> {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) for (const item of value) headers.append(name, item);
    else if (value !== undefined) headers.set(name, value);
  }
  const method = request.method ?? "GET";
  const protocol = request.headers["x-forwarded-proto"] === "https" ? "https" : "http";
  const url = `${protocol}://${request.headers.host ?? "localhost"}${request.url ?? "/"}`;
  if (method === "GET" || method === "HEAD") return new Request(url, { method, headers });
  const body = await readBoundedBody(request);
  return new Request(url, { method, headers, body });
}

async function writeWebResponse(webResponse: Response, response: ServerResponse): Promise<void> {
  const headers: Record<string, string> = {};
  webResponse.headers.forEach((value, name) => {
    headers[name] = value;
  });
  response.writeHead(webResponse.status, headers);
  if (!webResponse.body) {
    response.end();
    return;
  }
  const reader = webResponse.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    response.write(Buffer.from(value));
  }
  response.end();
}

export function createSyntheticHttpServer(options: SyntheticHttpServerOptions = {}): HttpServer {
  const allowedHostnames = new Set((options.allowedHostnames ?? ["localhost", "127.0.0.1", "[::1]"]).map((value) => value.toLocaleLowerCase()));
  const allowedOriginHostnames = new Set((options.allowedOriginHostnames ?? [...allowedHostnames]).map((value) => value.toLocaleLowerCase()));
  const handler = createMcpHandler(() => createMailMcpServer(new FakeMailProvider()), {
    legacy: "stateless",
    maxRequestBodySize: MAX_REQUEST_BYTES,
    onerror: (error) => console.error(`Synthetic HTTP MCP handler error: ${error.message}`),
  });
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (pathname === "/health" && request.method === "GET") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      response.end(JSON.stringify({ ok: true, provider: "synthetic" }));
      return;
    }
    if (pathname !== "/mcp") {
      response.writeHead(404, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      response.end(JSON.stringify({ error: "not_found" }));
      return;
    }
    if (!requestPassesNetworkGuards(request, response, allowedHostnames, allowedOriginHostnames)) return;
    void (async () => {
      try {
        await writeWebResponse(await handler.fetch(await toWebRequest(request)), response);
      } catch (error) {
        if (response.headersSent) {
          response.destroy();
          return;
        }
        if (error instanceof Error && error.message === "request_too_large") reject(response, 413, "request_too_large");
        else {
          console.error(`Synthetic HTTP MCP adapter error: ${error instanceof Error ? error.message : "unknown error"}`);
          reject(response, 500, "internal_error");
        }
      }
    })();
  });

  server.on("close", () => void handler.close());
  return server;
}

function environmentHostnames(): string[] {
  const configured = process.env.MCP_ALLOWED_HOSTS?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
  return [...new Set(["localhost", "127.0.0.1", "[::1]", ...configured])];
}

async function main(): Promise<void> {
  const host = process.env.MCP_BIND_HOST ?? "127.0.0.1";
  const port = Number.parseInt(process.env.PORT ?? "8787", 10);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) throw new Error("PORT must be an integer from 0 through 65535.");
  const allowedHostnames = environmentHostnames();
  const server = createSyntheticHttpServer({ allowedHostnames, allowedOriginHostnames: allowedHostnames });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });
  const address = server.address();
  const actualPort = typeof address === "object" && address !== null ? address.port : port;
  console.error(`Synthetic Yahoo Mail MCP is listening on http://${host}:${actualPort}/mcp.`);
  console.error("This endpoint contains fixtures only. It cannot access Yahoo Mail.");
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Synthetic HTTP MCP startup failed.");
    process.exitCode = 1;
  });
}

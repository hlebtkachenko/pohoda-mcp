// Validates the XML every tool sends against Stormware's official XSD.
// Calls each tool twice (all fields filled, required fields only) against a fake mServer,
// captures the request and runs `xmllint --schema data.xsd` on it.
// Usage: npm run check:xsd   (needs xmllint; schemas are cached in .xsd-cache/)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import iconv from "iconv-lite";

const CACHE = path.resolve(".xsd-cache");
const SCHEMA_BASE = "https://www.stormware.cz/schema/version_2/";
const SKIP = new Set(["pohoda_status", "pohoda_company_info", "pohoda_download_file", "pohoda_raw_xml"]);

async function fetchSchemas() {
  fs.mkdirSync(CACHE, { recursive: true });
  const queue = ["data.xsd"];
  const seen = new Set();
  while (queue.length) {
    const name = queue.pop();
    if (seen.has(name)) continue;
    seen.add(name);
    const file = path.join(CACHE, name);
    if (!fs.existsSync(file)) {
      const resp = await fetch(SCHEMA_BASE + name);
      if (!resp.ok) throw new Error(`Cannot download ${name}: HTTP ${resp.status}`);
      fs.writeFileSync(file, Buffer.from(await resp.arrayBuffer()));
    }
    for (const [, loc] of fs.readFileSync(file, "latin1").matchAll(/schemaLocation="([^"]+)"/g)) queue.push(path.basename(loc));
  }
}

function sample(schema, key = "") {
  if (/date|lastChanges/i.test(key)) return "2026-01-15";
  if (schema.enum) return schema.enum[0];
  if (schema.anyOf) return sample(schema.anyOf[0], key);
  switch (schema.type) {
    case "string": return "X1";
    case "number": case "integer": return Math.max(1, schema.minimum ?? 1);
    case "boolean": return true;
    case "array": return [sample(schema.items)];
    case "object": return Object.fromEntries(Object.entries(schema.properties ?? {}).map(([k, v]) => [k, sample(v, k)]));
    default: return "X1";
  }
}

await fetchSchemas();

let lastRequest = "";
const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    lastRequest = iconv.decode(Buffer.concat(chunks), "win1250");
    res.end('<rsp:responsePack xmlns:rsp="http://www.stormware.cz/schema/version_2/response.xsd" version="2.0" state="ok"/>');
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));

const client = new Client({ name: "check-xsd", version: "0" });
await client.connect(new StdioClientTransport({
  command: process.execPath,
  args: ["dist/index.js"],
  env: { POHODA_URL: `http://127.0.0.1:${server.address().port}`, POHODA_USERNAME: "u", POHODA_PASSWORD: "p", POHODA_ICO: "12345678" },
}));

const tmp = fs.mkdtempSync(path.join(CACHE, "run-"));
let failed = 0;
const { tools } = await client.listTools();
for (const tool of tools) {
  if (SKIP.has(tool.name)) continue;
  // A required enum (e.g. settingsType) selects different XML, so try each value.
  const full = sample(tool.inputSchema);
  const required = Object.fromEntries(Object.entries(full).filter(([k]) => tool.inputSchema.required?.includes(k)));
  const [variantKey, variantSchema] = Object.entries(tool.inputSchema.properties ?? {})
    .find(([k, v]) => v.enum && tool.inputSchema.required?.includes(k)) ?? [];
  const variants = [];
  for (const [kind, base] of [["full", full], ["required", required]]) {
    for (const v of variantKey ? variantSchema.enum : [undefined]) {
      variants.push({ kind, args: variantKey ? { ...base, [variantKey]: v } : base });
    }
  }
  for (const { kind, args } of variants) {
    const label = `${tool.name}${variantKey ? ` ${variantKey}=${args[variantKey]}` : ""} (${kind})`;
    lastRequest = "";
    await client.callTool({ name: tool.name, arguments: args });
    if (!lastRequest) {
      console.log(`SKIP ${label}: no request sent`);
      continue;
    }
    const file = path.join(tmp, "request.xml");
    fs.writeFileSync(file, lastRequest);
    try {
      execFileSync("xmllint", ["--noout", "--schema", path.join(CACHE, "data.xsd"), file], { stdio: "pipe" });
      console.log(`ok   ${label}`);
    } catch (e) {
      failed++;
      const lines = e.stderr.toString().split("\n").filter((l) => l.includes("error"));
      console.log(`FAIL ${label}\n     ${lines.map((l) => l.replace(/^.*?error : /, "")).join("\n     ")}`);
    }
  }
}

await client.close();
server.close();
fs.rmSync(tmp, { recursive: true });
console.log(failed ? `\n${failed} tool(s) send schema-invalid XML.` : "\nAll tools send schema-valid XML.");
process.exit(failed ? 1 : 0);

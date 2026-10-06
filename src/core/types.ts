export type ToolContent =
  | { type: "text"; text: string }
  | { type: "resource"; resource: { uri: string; mimeType: string; blob: string } };

export interface ToolResult {
  [key: string]: unknown;
  content: ToolContent[];
  isError?: boolean;
}

export function ok(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

export function err(text: string): ToolResult {
  return { content: [{ type: "text", text: `Error: ${text}` }], isError: true };
}

const DEFAULT_LIST_LIMIT = 100;

function listLimit(): number {
  const n = Number(process.env.POHODA_LIST_LIMIT);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_LIST_LIMIT;
}

export function jsonResult(label: string, data: unknown, count?: number): ToolResult {
  const limit = listLimit();
  if (Array.isArray(data) && data.length > limit) {
    const header = `${label} (showing first ${limit} of ${data.length} records; narrow the filters to see the rest)`;
    return ok(`${header}\n\n${JSON.stringify(data.slice(0, limit), null, 2)}`);
  }
  const header = count != null ? `${label} (${count} records)` : label;
  return ok(`${header}\n\n${JSON.stringify(data, null, 2)}`);
}

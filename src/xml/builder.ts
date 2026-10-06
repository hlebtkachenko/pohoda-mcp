import { create } from "xmlbuilder2";

type XMLBuilder = ReturnType<typeof create>;
import { NS, POHODA_VERSION, POHODA_APP_NAME } from "./namespaces.js";

let requestCounter = 0;

function nextId(prefix: string): string {
  return `${prefix}_${++requestCounter}`;
}

export interface DataPackOptions {
  ico: string;
  note?: string;
}

export function createDataPack(opts: DataPackOptions): XMLBuilder {
  return create({ version: "1.0", encoding: "Windows-1250" })
    .ele(NS.dat, "dat:dataPack")
    .att("id", nextId("dp"))
    .att("ico", opts.ico)
    .att("application", POHODA_APP_NAME)
    .att("version", POHODA_VERSION)
    .att("note", opts.note ?? "MCP request");
}

export function addDataPackItem(dataPack: XMLBuilder): XMLBuilder {
  return dataPack
    .ele(NS.dat, "dat:dataPackItem")
    .att("id", nextId("di"))
    .att("version", POHODA_VERSION);
}

// Legacy list requests (lst:listRequestType): only `version`, no agenda version, no request child.
const LEGACY_LISTS = new Set(["listStorageRequest", "listAccountingUnitRequest"]);

/**
 * Builds a list (export) request. The outer element gets `version` plus the
 * agenda version attribute the schema requires (listInvoiceRequest -> invoiceVersion);
 * listAttrs carries agenda type attributes such as invoiceType or orderType.
 */
export function buildExportRequest(
  opts: DataPackOptions,
  listTag: string,
  listNs: string,
  requestTag: string,
  filterContent?: (req: XMLBuilder) => void,
  listAttrs: Record<string, string | undefined> = {},
): string {
  const dp = createDataPack(opts);
  const item = addDataPackItem(dp);
  const listReq = item.ele(listNs, listTag);
  const local = listTag.slice(listTag.indexOf(":") + 1);
  listReq.att("version", POHODA_VERSION);
  if (LEGACY_LISTS.has(local)) return dp.end({ prettyPrint: false });

  const agenda = local.replace(/^list/, "").replace(/Request$/, "");
  listReq.att(`${agenda[0].toLowerCase()}${agenda.slice(1)}Version`, POHODA_VERSION);
  for (const [name, value] of Object.entries(listAttrs)) if (value) listReq.att(name, value);
  const req = listReq.ele(listNs, requestTag);
  if (filterContent) filterContent(req);
  return dp.end({ prettyPrint: false });
}

export function buildImportDoc(
  opts: DataPackOptions,
  docBuilder: (item: XMLBuilder) => void,
): string {
  const dp = createDataPack(opts);
  const item = addDataPackItem(dp);
  docBuilder(item);
  return dp.end({ prettyPrint: false });
}

/**
 * Wraps caller-supplied XML in a dataPack/dataPackItem envelope. Every POHODA
 * namespace prefix (inv:, typ:, ftr:, lst:, ...) is declared on the envelope,
 * so the inner XML may use them without its own xmlns declarations.
 */
export function buildRawDoc(opts: DataPackOptions, innerXml: string): string {
  const xmlns = Object.entries(NS).map(([prefix, uri]) => ` xmlns:${prefix}="${uri}"`).join("");
  return `<?xml version="1.0" encoding="Windows-1250"?>`
    + `<dat:dataPack${xmlns} id="${nextId("dp")}" ico="${escapeAttr(opts.ico)}"`
    + ` application="${POHODA_APP_NAME}" version="${POHODA_VERSION}" note="${escapeAttr(opts.note ?? "MCP raw request")}">`
    + `<dat:dataPackItem id="${nextId("di")}" version="${POHODA_VERSION}">${innerXml.replace(/^\s*<\?xml[^>]*\?>/, "")}</dat:dataPackItem>`
    + `</dat:dataPack>`;
}

function escapeAttr(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export { create, type XMLBuilder };

// End-to-end tests: the built server (dist/) talks to a fake mServer over HTTP.
// Run with `npm test` (builds first). All data here is synthetic.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import iconv from "iconv-lite";
import { buildRawDoc } from "../dist/xml/builder.js";
import { buildPrintRequest, extractPrintAttachments } from "../dist/tools/print.js";
import { parseResponse, extractListData } from "../dist/xml/parser.js";

const PDF_B64 = Buffer.from("%PDF-1.4 synthetic").toString("base64");
const RSP = 'xmlns:rsp="http://www.stormware.cz/schema/version_2/response.xsd"';
const pack = (inner, state = "ok") =>
  `<?xml version="1.0" encoding="UTF-8"?><rsp:responsePack ${RSP} version="2.0" state="${state}">${inner}</rsp:responsePack>`;

const invoices = (n) =>
  pack(`<rsp:responsePackItem version="2.0" state="ok"><lst:listInvoice xmlns:lst="http://www.stormware.cz/schema/version_2/list.xsd" version="2.0" state="ok">${
    Array.from({ length: n }, (_, i) => `<lst:invoice version="2.0"><id>${i + 1}</id></lst:invoice>`).join("")
  }</lst:listInvoice></rsp:responsePackItem>`);

const printOk = pack(
  `<rsp:responsePackItem version="2.0" state="ok"><prn:printResponse xmlns:prn="http://www.stormware.cz/schema/version_2/print.xsd" xmlns:rdc="http://www.stormware.cz/schema/version_2/documentresponse.xsd" version="1.0" state="ok">` +
  `<rdc:printDetails><rdc:attachments><rdc:attachment><rdc:idReport>1</rdc:idReport><rdc:data code="base64">${PDF_B64}</rdc:data></rdc:attachment></rdc:attachments></rdc:printDetails>` +
  `</prn:printResponse></rsp:responsePackItem>`,
);

const errorItem = pack(`<rsp:responsePackItem version="2.0" state="error" note="Synthetic failure"/>`, "error");

let lastRequest = "";
let server;
let client;

before(async () => {
  server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      lastRequest = iconv.decode(Buffer.concat(chunks), "win1250");
      let body = pack("");
      if (req.url.startsWith("/status")) body = "<response><status>idle</status></response>";
      else if (lastRequest.includes("prn:print")) body = printOk;
      else if (lastRequest.includes("BROKEN")) body = errorItem;
      else if (lastRequest.includes("listInvoiceRequest")) body = invoices(5);
      res.writeHead(200, { "Content-Type": "text/xml; charset=UTF-8" }).end(body);
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));

  client = new Client({ name: "test", version: "0" });
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: ["dist/index.js"],
    env: {
      POHODA_URL: `http://127.0.0.1:${server.address().port}`,
      POHODA_USERNAME: "user",
      POHODA_PASSWORD: "pass",
      POHODA_ICO: "12345678",
      POHODA_LIST_LIMIT: "3",
    },
  }));
});

after(async () => {
  await client?.close();
  server?.close();
});

const call = (name, args = {}) => client.callTool({ name, arguments: args });

test("registers the new tools and enum resources", async () => {
  const names = (await client.listTools()).tools.map((t) => t.name);
  for (const n of ["pohoda_print", "pohoda_raw_xml", "pohoda_list_invoices"]) assert.ok(names.includes(n), n);
  const uris = (await client.listResources()).resources.map((r) => r.uri);
  assert.ok(uris.includes("pohoda://enums/print-agendas"));
  const vat = await client.readResource({ uri: "pohoda://enums/vat-rates" });
  assert.match(vat.contents[0].text, /"high"/);
});

test("list output is capped at POHODA_LIST_LIMIT", async () => {
  const r = await call("pohoda_list_invoices", { invoiceType: "issuedInvoice" });
  assert.ok(!r.isError);
  assert.match(r.content[0].text, /showing first 3 of 5 records/);
  assert.equal(JSON.parse(r.content[0].text.split("\n\n")[1]).length, 3);
});

test("print returns the PDF as an embedded resource", async () => {
  const r = await call("pohoda_print", { agenda: "vydane_faktury", recordId: 7, reportId: 42, pdfPath: "C:\\Export\\a.pdf", returnPdf: true, copies: 2 });
  assert.ok(!r.isError, JSON.stringify(r));
  assert.match(lastRequest, /<prn:record agenda="vydane_faktury"><ftr:filter[^>]*><ftr:id>7<\/ftr:id>/);
  assert.match(lastRequest, /<prn:copy>2<\/prn:copy>/);
  const pdf = r.content.find((c) => c.type === "resource");
  assert.equal(pdf.resource.mimeType, "application/pdf");
  assert.equal(pdf.resource.blob, PDF_B64);
});

test("print rejects network and non-PDF paths", async () => {
  for (const pdfPath of ["\\\\attacker\\share\\a.pdf", "//attacker/share/a.pdf", "C:\\Windows\\a.exe"]) {
    const r = await call("pohoda_print", { agenda: "banka", recordId: 1, reportId: 1, pdfPath });
    assert.ok(r.isError, pdfPath);
  }
});

test("print rejects returnPdf without pdfPath", async () => {
  const r = await call("pohoda_print", { agenda: "banka", recordId: 1, reportId: 1, returnPdf: true });
  assert.ok(r.isError);
});

test("raw_xml wraps inner XML and flags POHODA errors", async () => {
  const ok = await call("pohoda_raw_xml", { xml: '<lst:listInvoiceRequest version="2.0"/>' });
  assert.ok(!ok.isError);
  assert.match(lastRequest, /xmlns:lst="http:\/\/www\.stormware\.cz\/schema\/version_2\/list\.xsd"/);
  assert.match(lastRequest, /<dat:dataPackItem [^>]+><lst:listInvoiceRequest/);

  const bad = await call("pohoda_raw_xml", { xml: "<BROKEN/>" });
  assert.ok(bad.isError);
  assert.match(bad.content[0].text, /Synthetic failure/);
});

test("list tools surface POHODA error state instead of an empty list", () => {
  assert.throws(() => extractListData(parseResponse(errorItem)), /Synthetic failure/);
});

test("buildRawDoc strips an inner XML declaration and escapes attributes", () => {
  const xml = buildRawDoc({ ico: "1\"2", note: "a<b" }, '<?xml version="1.0"?><inv:invoice/>');
  assert.equal((xml.match(/<\?xml/g) ?? []).length, 1);
  assert.match(xml, /ico="1&quot;2"/);
  assert.match(xml, /note="a&lt;b"/);
});

test("print request omits optional settings when not given", () => {
  const xml = buildPrintRequest("12345678", { agenda: "banka", recordId: 1, reportId: 2 });
  assert.match(xml, /<prn:print [^>]*version="1.0">/);
  assert.doesNotMatch(xml, /<prn:pdf>|<prn:printer>|<prn:copy>/);
  assert.deepEqual(extractPrintAttachments(undefined), []);
});

test("parser keeps line items as arrays but not their fields or response details", () => {
  const LST = 'xmlns:lst="http://www.stormware.cz/schema/version_2/list.xsd"';
  const list = parseResponse(pack(`<rsp:responsePackItem version="2.0" state="ok"><lst:listInvoice ${LST} version="2.0" state="ok"><lst:invoice version="2.0"><invoiceDetail><invoiceItem><text>Synthetic</text></invoiceItem></invoiceDetail></lst:invoice></lst:listInvoice></rsp:responsePackItem>`));
  const [inv] = extractListData(list);
  assert.equal(inv.invoiceDetail.invoiceItem.length, 1);
  assert.equal(inv.invoiceDetail.invoiceItem[0].text, "Synthetic");

  const created = parseResponse(pack(`<rsp:responsePackItem version="2.0" state="ok"><inv:invoiceResponse xmlns:inv="i" version="2.0" state="ok"><producedDetails><id>99</id></producedDetails></inv:invoiceResponse></rsp:responsePackItem>`));
  assert.equal(created.items[0].data.producedDetails.id, 99);
});

test("list extraction takes only the first document array", () => {
  const parsed = { state: "ok", items: [{ state: "ok", data: { listStock: { stock: [{ id: 1 }, { id: 2 }], other: [{ id: 99 }] } } }] };
  assert.deepEqual(extractListData(parsed).map((r) => r.id), [1, 2]);
});

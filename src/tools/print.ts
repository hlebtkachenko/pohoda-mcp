import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PohodaClient } from "../client.js";
import { buildImportDoc } from "../xml/builder.js";
import { NS } from "../xml/namespaces.js";
import { parseResponse, extractImportResult } from "../xml/parser.js";
import { err, type ToolContent, type ToolResult } from "../core/types.js";

// printAgendaType from filter.xsd (POHODA XML schema version 2).
export const PRINT_AGENDAS = [
  "adresar", "banka", "cenove_akce", "cenove_skupiny", "cleneni_skladu", "evidencni_cisla",
  "interni_doklady", "inventura", "inventurni_seznamy", "ostatni_pohledavky", "ostatni_zavazky",
  "pohyby", "pokladna", "prevod", "prijate_faktury", "prijate_nabidky", "prijate_objednavky",
  "prijate_poptavky", "prijate_zalohove_faktury", "prijemky", "prodejky", "prodejni_ceny",
  "reklamace", "servis", "sklady", "uzivatelska_agenda", "vydane_faktury", "vydane_nabidky",
  "vydane_objednavky", "vydane_poptavky", "vydane_zalohove_faktury", "vydejky", "vyroba",
  "vyrobni_pozadavky", "zakazky", "zasoby",
] as const;

export interface PrintParams {
  agenda: string;
  recordId: number;
  reportId: number;
  pdfPath?: string;
  returnPdf?: boolean;
  printer?: string;
  copies?: number;
}

export function buildPrintRequest(ico: string, p: PrintParams): string {
  return buildImportDoc({ ico, note: `Print ${p.agenda}` }, (item) => {
    const print = item.ele(NS.prn, "prn:print").att("version", "1.0");
    print.ele(NS.prn, "prn:record").att("agenda", p.agenda)
      .ele(NS.ftr, "ftr:filter").ele(NS.ftr, "ftr:id").txt(String(p.recordId));
    const settings = print.ele(NS.prn, "prn:printerSettings");
    settings.ele(NS.prn, "prn:report").ele(NS.prn, "prn:id").txt(String(p.reportId));
    if (p.printer) settings.ele(NS.prn, "prn:printer").txt(p.printer);
    if (p.pdfPath) {
      const pdf = settings.ele(NS.prn, "prn:pdf");
      pdf.ele(NS.prn, "prn:fileName").txt(p.pdfPath);
      if (p.returnPdf) pdf.ele(NS.prn, "prn:binaryData").ele(NS.prn, "prn:responseXml").txt("true");
    }
    if (p.copies && p.copies > 1) settings.ele(NS.prn, "prn:parameters").ele(NS.prn, "prn:copy").txt(String(p.copies));
  });
}

/** Base64 PDFs from printResponse > printDetails > attachments > attachment > data. */
export function extractPrintAttachments(data: unknown): string[] {
  const details = (data as Record<string, Record<string, Record<string, unknown>>>)?.printDetails;
  const raw = details?.attachments?.attachment;
  const list = raw == null ? [] : Array.isArray(raw) ? raw : [raw];
  return list
    .map((a) => (a as Record<string, unknown>).data)
    .map((d) => (d && typeof d === "object" ? (d as Record<string, unknown>)["#text"] : d))
    .filter((d): d is string => typeof d === "string" && d.length > 0);
}

export function registerPrintTools(server: McpServer, client: PohodaClient): void {
  server.registerTool(
    "pohoda_print",
    {
      title: "Print or export a record to PDF",
      description:
        "Print one POHODA record with a given print report. Without pdfPath and printer it goes to the default printer. " +
        "With pdfPath it saves a PDF on the POHODA machine (Windows path); add returnPdf=true to also get the PDF back in the response. " +
        "reportId is the report ID from POHODA's print report editor. Agenda names are Czech (see resource pohoda://enums/print-agendas).",
      inputSchema: {
        agenda: z.enum(PRINT_AGENDAS).describe("Agenda of the record, e.g. vydane_faktury, prijate_faktury, banka, pokladna"),
        recordId: z.number().int().positive().describe("Record ID (from a list tool)"),
        reportId: z.number().int().positive().describe("Print report ID"),
        pdfPath: z.string().optional().describe("Target PDF path on the POHODA machine, e.g. C:\\Export\\invoice.pdf"),
        returnPdf: z.boolean().optional().describe("Return the PDF as an embedded resource (requires pdfPath)"),
        printer: z.string().optional().describe("Printer name; omit for the default printer"),
        copies: z.number().int().min(1).max(20).optional().describe("Number of copies (1-20)"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (params): Promise<ToolResult> => {
      try {
        if (params.returnPdf && !params.pdfPath) return err("returnPdf requires pdfPath.");
        const parsed = parseResponse(await client.sendXml(buildPrintRequest(client.ico, params)));
        const result = extractImportResult(parsed);
        if (!result.success) return err(result.message);

        const target = params.pdfPath ? `PDF saved to ${params.pdfPath}` : `Sent to ${params.printer ?? "default printer"}`;
        const content: ToolContent[] = [{ type: "text", text: `${target}. ${result.message}` }];
        if (params.returnPdf) {
          const pdfs = extractPrintAttachments(parsed.items[0]?.data);
          if (pdfs.length === 0) content.push({ type: "text", text: "POHODA returned no PDF data." });
          pdfs.forEach((blob, i) => content.push({
            type: "resource",
            resource: { uri: `pohoda://print/${params.agenda}/${params.recordId}/${i + 1}.pdf`, mimeType: "application/pdf", blob },
          }));
        }
        return { content };
      } catch (e) {
        return err((e as Error).message);
      }
    },
  );
}

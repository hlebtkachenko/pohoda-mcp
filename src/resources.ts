import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { INVOICE_TYPES } from "./tools/invoices.js";
import { PRINT_AGENDAS } from "./tools/print.js";

const ENUMS: Record<string, { description: string; values: unknown }> = {
  "vat-rates": {
    description: "Allowed rateVAT values for document items and stock cards",
    values: {
      none: "No VAT (exempt or outside the scope)",
      low: "Reduced Czech VAT rate (12 % since 2024)",
      high: "Standard Czech VAT rate (21 %)",
    },
  },
  "invoice-types": {
    description: "invoiceType values for pohoda_list_invoices and pohoda_create_invoice",
    values: INVOICE_TYPES,
  },
  "print-agendas": {
    description: "Czech agenda names accepted by pohoda_print",
    values: PRINT_AGENDAS,
  },
  "date-formats": {
    description: "Date inputs accepted by every tool",
    values: ["DD.MM.YYYY", "YYYY-MM-DD"],
  },
};

export function registerResources(server: McpServer): void {
  for (const [name, { description, values }] of Object.entries(ENUMS)) {
    const uri = `pohoda://enums/${name}`;
    server.registerResource(name, uri, { description, mimeType: "application/json" }, async () => ({
      contents: [{ uri, mimeType: "application/json", text: JSON.stringify(values, null, 2) }],
    }));
  }
}

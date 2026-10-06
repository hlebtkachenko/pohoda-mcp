import { type XMLBuilder } from "../xml/builder.js";
import { NS } from "../xml/namespaces.js";
import { toIsoDate, toIsoDateTime } from "./shared.js";

export interface ListFilterParams {
  id?: number;
  dateFrom?: string;
  dateTill?: string;
  lastChanges?: string;
  /** Document number (selectedNumbers) for documents, `number` for address book. */
  number?: string;
  companyName?: string;
  ico?: string;
}

/**
 * Adds an ftr:filter with only the elements the schema allows:
 * "docs" = ftr:filterDocsType (invoices, orders, bank, ...), "addressbook" = ftr:filterAdbsType.
 */
// fallow-ignore-next-line complexity -- one branch per optional schema field
export function applyFilter(parent: XMLBuilder, params: ListFilterParams, kind: "docs" | "addressbook" = "docs"): void {
  const hasAny = Object.values(params).some((v) => v != null && v !== "");
  if (!hasAny) return;

  const ftr = parent.ele(NS.ftr, "ftr:filter");
  if (params.id != null) ftr.ele(NS.ftr, "ftr:id").txt(String(params.id));

  if (kind === "addressbook") {
    if (params.companyName) ftr.ele(NS.ftr, "ftr:company").txt(params.companyName);
    if (params.ico) ftr.ele(NS.ftr, "ftr:ico").txt(params.ico);
    if (params.number) ftr.ele(NS.ftr, "ftr:number").ele(NS.typ, "typ:numberRequested").txt(params.number);
  } else {
    if (params.dateFrom) ftr.ele(NS.ftr, "ftr:dateFrom").txt(toIsoDate(params.dateFrom));
    if (params.dateTill) ftr.ele(NS.ftr, "ftr:dateTill").txt(toIsoDate(params.dateTill));
    if (params.number) ftr.ele(NS.ftr, "ftr:selectedNumbers").ele(NS.ftr, "ftr:number").ele(NS.typ, "typ:numberRequested").txt(params.number);
    if (params.companyName) ftr.ele(NS.ftr, "ftr:selectedCompanys").ele(NS.ftr, "ftr:company").txt(params.companyName);
    if (params.ico) ftr.ele(NS.ftr, "ftr:selectedIco").ele(NS.ftr, "ftr:ico").txt(params.ico);
  }

  if (params.lastChanges) ftr.ele(NS.ftr, "ftr:lastChanges").txt(toIsoDateTime(params.lastChanges));
}

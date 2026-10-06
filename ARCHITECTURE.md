# Architecture

## Structure

```
src/
  index.ts              Entry point: env config, server instructions, tool and resource registration, shutdown
  client.ts             mServer HTTP client (STW-Authorization, Windows-1250, gzip/deflate, retries, autostart hook)
  mserver.ts            Starts/stops mServer via `Pohoda.exe /HTTP start|stop` (Windows)
  resources.ts          pohoda://enums/* resources
  xml/
    builder.ts          dataPack envelope, list (export) requests, raw XML envelope
    parser.ts           responsePack parser, error detection, list and import result extraction
    namespaces.ts       POHODA XML namespace URIs
  core/
    types.ts            Tool result helpers, list size cap
    shared.ts           Date conversion, env helpers
    filters.ts          ftr:filter builder (document and address book filters)
  tools/                One file per agenda; each registers its MCP tools
test/                   node:test suite, runs dist/ against a fake mServer
scripts/check-xsd.mjs   Validates every tool's request XML against Stormware's XSD
```

## Flow

```
MCP client --stdio--> tool handler --> xml/builder --> client.sendXml --HTTP POST /xml--> mServer (POHODA)
                           ^                                                                 |
                           +---------- xml/parser (responsePack -> JSON) <--------------------+
```

## Design notes

- **Schema is the contract.** mServer rejects requests that do not validate against the version 2 XSD. `npm run check:xsd` calls every tool twice (all fields, required fields only) and runs `xmllint` on the captured request. Run it after any change to a tool's XML.
- **List requests** need `version` plus the agenda version attribute (`listInvoiceRequest` -> `invoiceVersion`) on the outer element; `buildExportRequest` derives it from the tag. Type attributes (`invoiceType`, `orderType`, ...) go on the outer element too, through `listAttrs`. Legacy requests (`listStorageRequest`, `listAccountingUnitRequest`) carry only `version`.
- **Filters** differ per agenda: documents use `ftr:filterDocsType` (no free-text company or variable symbol filter), the address book uses `ftr:filterAdbsType`. `applyFilter` emits only what each allows.
- **Errors**: `extractListData` throws when the responsePack or an item has `state="error"`, so a rejected request never looks like an empty list.
- **Output size**: list results are capped at `POHODA_LIST_LIMIT` (default 100) with a truncation note.
- **Not supported by the XML API**: deleting invoices and contracts.
- **Encoding**: requests are sent as Windows-1250; responses are decoded by their declared charset.

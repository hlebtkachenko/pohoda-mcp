# AGENTS.md

MCP server for POHODA (Stormware) accounting via the mServer XML API. TypeScript, Node 22+, stdio transport. Layout and design: [ARCHITECTURE.md](ARCHITECTURE.md).

## Commands

```bash
npm ci
npm run build       # tsc -> dist/
npm test            # build + node:test suite (fake mServer, no POHODA needed)
npm run check:xsd   # validate every tool's XML against the official XSD (needs xmllint)
```

## Rules

- Any change to the XML a tool sends must pass `npm run check:xsd`. Look up element names and order in the XSD (`.xsd-cache/` after the first run), not in memory.
- New tools: one agenda per file in `src/tools/`, register in `src/index.ts`, list them in the README tools table.
- Synthetic data only in tests and docs: no real company names, IČO, account numbers or documents. Use `12345678` as a placeholder IČO.
- Never commit credentials; configuration is env-only (`.env.example` lists the variables).
- Keep the README tool tables, env table and resource list in sync with the code.

# Claude context — `pykeko/PyKekoMCP`

MCP server (Model Context Protocol) that lets Claude drive a running [PyKeko](https://github.com/pykeko/PyKeko) app — load coords/maps, navigate, refine, screenshot.

See [`pykeko/PyKeko/CLAUDE.md`](https://github.com/pykeko/PyKeko/blob/main/CLAUDE.md) for the full project family overview, naming conventions, and the wire-protocol identifier list (do-not-rename rules apply here too).

## Build & install for Claude Code

```bash
npm install
npm run build           # tsc → dist/server.js
claude mcp add pykeko -- node ~/PyKekoMCP/dist/server.js
# Or target the dev variant:
claude mcp add pykeko-dev -e MOORHEN_VITE_PORT=5174 -- node ~/PyKekoMCP/dist/server.js
```

The MCP server name in `~/.claude.json` is currently still `"moorhen"` (rather than `"pykeko"`) to avoid disconnecting existing chats. Rename via `claude mcp remove moorhen && claude mcp add pykeko ...` whenever you're ready.

## Naming

- Package name: `pykeko-mcp` (in `package.json`)
- Tool names: keep the `moorhen_*` prefix (wire-level identifiers shared with the in-page bridge — see do-not-rename rules above)

## Current state

- Version: `0.1.0`
- Default branch: `main`
- Last meaningful change: rebrand from `MoorhenMCP` to `PyKekoMCP` (README + comments + package name + dist rebuilt)

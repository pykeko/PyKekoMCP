<p align="center">
  <img src="https://raw.githubusercontent.com/pykeko/PyKeko/main/PyKeko_avatar.png" alt="PyKeko" width="120" height="120" />
</p>

# PyKekoMCP

An [MCP](https://modelcontextprotocol.io) server that lets Claude drive a **running**
[PyKeko](https://github.com/pykeko/PyKeko) (Moorhen-based Coot) desktop app — load
structures and maps, navigate, run Coot edits (refine, rotamer fit, peptide flip,
add waters, delete, mutate-via-CID), undo/redo, and capture screenshots of the 3D
view.

> 🐦 **Part of the [PyKeko project](https://github.com/pykeko)** — see the org page for what PyKeko is, the Coot→Moorhen→PyKeko heritage, and install instructions. This README covers the **MCP server's internals**.

## How it works

```
Claude ──stdio(MCP)──▶ PyKekoMCP (this) ──HTTP(127.0.0.1, token)──▶ PyKeko main
       └─ tools                                                       │ (control server)
                                                                      ▼ IPC
                                            MoorhenControlBridge ──▶ window.MoorhenControlApi
                                                                      ▼
                                            commandCentre.cootCommand ──▶ CootWorker (WASM)
```

The `PyKeko`/`PyKekoDev` Electron apps run a local, token-authenticated HTTP control
server and write their `{port, token}` to `~/.moorhen-mcp/control-<vitePort>.json`. Each
tool POSTs `{token, verb, args}` there; the wrapper forwards to the in-page control
bridge (which calls `window.MoorhenControlApi`). `screenshot` is served by the wrapper
via `capturePage`.

## Requirements

- A running PyKeko app (`PyKeko.app` = self-contained dist, dynamic port; `PyKekoDev.app`
  = vite port 5174) built from [pykeko/PyKeko](https://github.com/pykeko/PyKeko) against
  [pykeko/Moorhen-PyKeko](https://github.com/pykeko/Moorhen-PyKeko) (control bridge +
  preload baked in).
- Node.js 18+ (uses global `fetch`).

## Build

```bash
npm install
npm run build
```

## Use with Claude Code

```bash
claude mcp add pykeko -- node /Users/hilgersmt/PyKekoMCP/dist/server.js
```

To target PyKekoDev instead, set `MOORHEN_VITE_PORT=5174`:

```bash
claude mcp add pykeko-dev -e MOORHEN_VITE_PORT=5174 -- node /Users/hilgersmt/PyKekoMCP/dist/server.js
```

## Tools

| Tool | Purpose |
|------|---------|
| `moorhen_get_state` | list molecules/maps + active map |
| `moorhen_load_coordinates` | load a structure (local path or PDB id) |
| `moorhen_load_map` | load .mtz / .ccp4 / .map / .mrc, set active |
| `moorhen_go_to_residue` | recenter on a CID |
| `moorhen_refine` | real-space refine (SINGLE/TRIPLE/SPHERE/CHAIN/ALL) |
| `moorhen_auto_fit_rotamer` | fit rotamer to density |
| `moorhen_flip_peptide` | flip peptide bond |
| `moorhen_add_terminal_residue` | extend a chain terminus |
| `moorhen_add_waters` | auto-add waters into density |
| `moorhen_delete` | delete atoms by literal CID |
| `moorhen_set_active_map` | choose the refinement map |
| `moorhen_undo` / `moorhen_redo` | undo/redo edits |
| `moorhen_screenshot` | PNG of the 3D view |

(Tool names keep the `moorhen_` prefix because they're wire-level identifiers shared
with the in-page control bridge — renaming would break compatibility with the wrapper.)

CID selections follow Coot/mmdb syntax, e.g. `//A/45` (residue), `/1/A/45/CA` (atom),
`/1/A/45/*` (all atoms of a residue, for delete).

## Env

- `MOORHEN_VITE_PORT` — which app to target (default 5173 — dist picks dynamically;
  5174 = PyKekoDev)
- `MOORHEN_CONTROL_FILE` — override the control file path

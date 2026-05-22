# MoorhenMCP

An [MCP](https://modelcontextprotocol.io) server that lets Claude drive a **running**
[MoorhenMH](https://github.com/3viil/MoorHenMH) (Coot) desktop app — load structures and
maps, navigate, run Coot edits (refine, rotamer fit, peptide flip, add waters, delete,
mutate-via-CID), undo/redo, and capture screenshots of the 3D view.

## How it works

```
Claude ──stdio(MCP)──▶ MoorhenMCP (this) ──HTTP(127.0.0.1, token)──▶ MoorhenWrapper main
       └─ tools                                                       │ (control server)
                                                                      ▼ IPC
                                            MoorhenControlBridge ──▶ window.MoorhenControlApi
                                                                      ▼
                                            commandCentre.cootCommand ──▶ CootWorker (WASM)
```

The `MoorhenLocal`/`MoorhenDev` Electron apps run a local, token-authenticated HTTP control
server and write their `{port, token}` to `~/.moorhen-mcp/control-<vitePort>.json`. Each tool
POSTs `{token, verb, args}` there; the wrapper forwards to the in-page control bridge (which
calls `window.MoorhenControlApi`). `screenshot` is served by the wrapper via `capturePage`.

## Requirements

- A running Moorhen app (`MoorhenLocal.app` = vite port 5173, default; `MoorhenDev.app` = 5174)
  built from [3viil/MoorhenWrapper](https://github.com/3viil/MoorhenWrapper) against
  [3viil/MoorHenMH](https://github.com/3viil/MoorHenMH) (control bridge + preload baked in).
- Node.js 18+ (uses global `fetch`).

## Build

```bash
npm install
npm run build
```

## Use with Claude Code

```bash
claude mcp add moorhen -- node /Users/hilgersmt/MoorhenMCP/dist/server.js
```

To target MoorhenDev instead of MoorhenLocal, set `MOORHEN_VITE_PORT=5174`:

```bash
claude mcp add moorhen-dev -e MOORHEN_VITE_PORT=5174 -- node /Users/hilgersmt/MoorhenMCP/dist/server.js
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

CID selections follow Coot/mmdb syntax, e.g. `//A/45` (residue), `/1/A/45/CA` (atom),
`/1/A/45/*` (all atoms of a residue, for delete).

## Env

- `MOORHEN_VITE_PORT` — which app to target (5173 = MoorhenLocal default, 5174 = MoorhenDev)
- `MOORHEN_CONTROL_FILE` — override the control file path

#!/usr/bin/env node
// PyKekoMCP — an MCP server that drives a running PyKeko (Moorhen-based Coot) desktop app.
//
// Transport: the PyKeko Electron app runs a localhost HTTP control server
// (token-auth) and writes its {port, token} to ~/.moorhen-mcp/control-<vitePort>.json.
// Each tool here POSTs {token, verb, args} to that endpoint; the wrapper forwards to the
// in-page MoorhenControlBridge (which calls window.MoorhenControlApi) and returns the result.
// "screenshot" is served by the wrapper itself via webContents.capturePage.
//
// Target which app: MOORHEN_VITE_PORT (default 5173; 5174 = PyKekoDev).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const VITE_PORT = process.env.MOORHEN_VITE_PORT || "5173";
const CONTROL_FILE =
  process.env.MOORHEN_CONTROL_FILE ||
  path.join(os.homedir(), ".moorhen-mcp", `control-${VITE_PORT}.json`);

function loadCfg(): { port: number; token: string; title?: string } {
  try {
    return JSON.parse(fs.readFileSync(CONTROL_FILE, "utf8"));
  } catch (e) {
    throw new Error(
      `Moorhen control file not found at ${CONTROL_FILE}. Is the Moorhen app (vite port ${VITE_PORT}) running with control enabled?`
    );
  }
}

async function invoke(verb: string, args: any[] = []): Promise<any> {
  const cfg = loadCfg();
  let r: Response;
  try {
    r = await fetch(`http://127.0.0.1:${cfg.port}/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: cfg.token, verb, args }),
    });
  } catch (e: any) {
    throw new Error(`Cannot reach the Moorhen control server on 127.0.0.1:${cfg.port} — is the app running? (${e?.message || e})`);
  }
  const j: any = await r.json();
  if (!j.ok) throw new Error(j.error || "Moorhen control error");
  return j.result;
}

const ok = (data: any) => ({
  content: [{ type: "text" as const, text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }],
});

const server = new McpServer({ name: "moorhen-mcp", version: "0.1.0" });

server.tool("moorhen_get_state", "List loaded molecules and maps (with atom counts) and the active map.", {}, async () => ok(await invoke("getState")));

server.tool(
  "moorhen_load_coordinates",
  "Load a structure into Moorhen from a local file path or a PDB accession id.",
  {
    path: z.string().optional().describe("Local path to a .pdb/.cif/.ent file"),
    pdbId: z.string().optional().describe("4-character PDB id, e.g. 1crn (fetched from RCSB)"),
    name: z.string().optional().describe("Display name for the molecule"),
  },
  async ({ path: p, pdbId, name }) => {
    let content: string;
    let nm = name;
    if (p) {
      content = fs.readFileSync(p, "utf8");
      nm = nm || path.basename(p);
    } else if (pdbId) {
      const res = await fetch(`https://files.rcsb.org/download/${pdbId}.pdb`);
      if (!res.ok) throw new Error(`Fetching PDB ${pdbId} failed: HTTP ${res.status}`);
      content = await res.text();
      nm = nm || pdbId;
    } else {
      throw new Error("Provide either 'path' or 'pdbId'.");
    }
    return ok(await invoke("loadCoordsFromString", [content, nm]));
  }
);

server.tool(
  "moorhen_load_map",
  "Load a map from a local .mtz (reflections; auto structure factors) or .ccp4/.map/.mrc file, and set it as the active (refinement) map.",
  {
    path: z.string().describe("Local path to a .mtz/.ccp4/.map/.mrc file"),
    name: z.string().optional(),
    isDifference: z.boolean().optional().describe("For .ccp4/.map/.mrc: treat as a difference map"),
    columns: z
      .object({ F: z.string().optional(), PHI: z.string().optional(), isDifference: z.boolean().optional() })
      .optional()
      .describe("For .mtz: column labels (default FWT/PHWT)"),
  },
  async ({ path: p, name, isDifference, columns }) => {
    const b64 = fs.readFileSync(p).toString("base64");
    const nm = name || path.basename(p);
    if (p.toLowerCase().endsWith(".mtz")) return ok(await invoke("loadMapFromMtz", [b64, nm, columns]));
    return ok(await invoke("loadMapFromCcp4", [b64, nm, !!isDifference]));
  }
);

server.tool("moorhen_go_to_residue", "Recenter the 3D view on a residue/atom CID (e.g. //A/45 or /1/A/45/CA).", { cid: z.string(), molNo: z.number().optional() }, async ({ cid, molNo }) => ok(await invoke("goToResidue", [cid, molNo])));

server.tool(
  "moorhen_refine",
  "Real-space refine around a residue CID. mode: SINGLE | TRIPLE | SPHERE | CHAIN | ALL. Requires an active map.",
  { cid: z.string(), mode: z.enum(["SINGLE", "TRIPLE", "SPHERE", "CHAIN", "ALL"]).optional(), molNo: z.number().optional() },
  async ({ cid, mode, molNo }) => ok(await invoke("refine", [cid, mode || "TRIPLE", molNo]))
);

server.tool("moorhen_auto_fit_rotamer", "Auto-fit a residue's rotamer to density (CID e.g. //A/45). Requires an active map.", { cid: z.string(), molNo: z.number().optional() }, async ({ cid, molNo }) => ok(await invoke("autoFitRotamer", [cid, molNo])));

server.tool("moorhen_flip_peptide", "Flip the peptide bond at an atom CID (e.g. //A/45/CA).", { cid: z.string(), molNo: z.number().optional() }, async ({ cid, molNo }) => ok(await invoke("flipPeptide", [cid, molNo])));

server.tool("moorhen_add_terminal_residue", "Add a terminal residue at a residue CID. Requires an active map.", { cid: z.string(), molNo: z.number().optional() }, async ({ cid, molNo }) => ok(await invoke("addTerminalResidue", [cid, molNo])));

server.tool("moorhen_add_waters", "Auto-add waters into positive density peaks. Requires an active map.", { molNo: z.number().optional() }, async ({ molNo }) => ok(await invoke("addWaters", [molNo])));

server.tool("moorhen_delete", "Delete atoms matching a literal CID (e.g. /1/A/45/* deletes residue 45 of chain A).", { cid: z.string(), molNo: z.number().optional() }, async ({ cid, molNo }) => ok(await invoke("deleteCid", [cid, molNo])));

server.tool("moorhen_set_active_map", "Set which loaded map (by molNo) is active for refinement.", { mapMolNo: z.number() }, async ({ mapMolNo }) => ok(await invoke("setActiveMap", [mapMolNo])));

server.tool("moorhen_undo", "Undo the last edit on a molecule.", { molNo: z.number().optional() }, async ({ molNo }) => ok(await invoke("undo", [molNo])));
server.tool("moorhen_redo", "Redo the last undone edit on a molecule.", { molNo: z.number().optional() }, async ({ molNo }) => ok(await invoke("redo", [molNo])));

server.tool("moorhen_screenshot", "Capture a PNG screenshot of the current Moorhen 3D view.", {}, async () => {
  const r = await invoke("screenshot");
  return { content: [{ type: "image" as const, data: r.png, mimeType: "image/png" }] };
});

server.tool(
  "moorhen_run_dimple",
  "Spawn CCP4's dimple auto-pipeline (rigid-body / MR + restrained refinement + optional ligand fit) end-to-end. Inputs: model PDB path, MTZ path, optional ligand CIF path or SMILES. Refined model lands at <outDir>/final.pdb and is loaded back into PyKeko automatically. Typical runtime 2-10 minutes; progress streams to the in-app log console. Requires CCP4 installed locally.",
  {
    modelPath: z.string().describe("Absolute path to the input PDB (or mmCIF) model."),
    mtzPath: z.string().describe("Absolute path to the MTZ with observed structure factors."),
    ligandCifPath: z.string().optional().describe("Absolute path to a ligand chem_comp CIF; dimple will fit it into the strongest Fo-Fc blob."),
    smiles: z.string().optional().describe("Alternative to ligandCifPath — dimple generates the dict from this SMILES."),
    outDir: z.string().optional().describe("Output directory (default: <mtz_dir>/dimple_<model_basename>)."),
    restrCycles: z.number().optional().describe("Restrained refinement cycles (default 8)."),
    mrThreshold: z.number().optional().describe("R-factor threshold above which dimple switches to molecular replacement (default 0.4)."),
  },
  async (a) => {
    const r: any = await invoke("runDimple", [{
      modelPath: a.modelPath, mtzPath: a.mtzPath,
      ligandCifPath: a.ligandCifPath ?? null,
      smiles: a.smiles ?? null,
      outDir: a.outDir ?? null,
      restrCycles: a.restrCycles,
      mrThreshold: a.mrThreshold,
    }]);
    // Strip the giant PDB text from the returned blob — the caller can read the file.
    if (r?.finalPdbText) r.finalPdbText = `(${r.finalPdbText.length} chars — read from ${r.finalPdb})`;
    return ok(r);
  }
);

server.tool(
  "moorhen_eval",
  "Evaluate JavaScript inside the PyKeko renderer's global scope and return a printable summary of the result. " +
    "Scope is the renderer (window, document, MoorhenControlApi, all loaded React/Redux state) — same access as Chrome DevTools, " +
    "NO main-process / Node / fs access. Use this to introspect live state, test hypotheses, drive the bridge directly. " +
    "Single expressions (e.g. `MoorhenControlApi.listMolecules?.()`) and statement blocks (e.g. `const m = ...; m.atomCount`) " +
    "both work; `await` is supported. The returned `repr` is a JSON-stringified, depth- and length-capped summary " +
    "(`undefined` for void, the value itself for primitives, type-tagged + key-listed object skeleton for objects). " +
    "Errors come back as `kind: 'error'` with the stack in `error`.",
  { src: z.string().describe("JS source to evaluate") },
  async ({ src }) => {
    const r: any = await invoke("evalJs", [src]);
    if (!r?.ok) return ok({ kind: "error", error: r?.error || "unknown error" });
    return ok({ kind: r.kind, repr: r.repr });
  }
);

server.tool(
  "moorhen_set_cwd",
  "Change PyKeko's active working directory. Files saved by PyKeko's in-app save handlers (covalent link, save-text-file, save-augmented-cif, native save-dialog defaults) all route to this directory after the change. Accepts ~, $VAR, and relative paths.",
  { path: z.string().describe("Target directory. ~/foo and relative paths are resolved against the current cwd.") },
  async ({ path: p }) => {
    const r: any = await invoke("setCwd", [p]);
    if (!r?.ok) return ok({ ok: false, error: r?.error || "unknown error" });
    return ok({ ok: true, cwd: r.cwd });
  }
);

server.tool(
  "moorhen_get_cwd",
  "Get PyKeko's current active working directory and the directory it was originally launched from.",
  {},
  async () => ok(await invoke("getCwd"))
);

server.tool(
  "moorhen_declare_covalent_link",
  "Declare a covalent link between a Cys SG atom and a ligand carbon (Cβ). Loads the link CIF into Coot, writes a _struct_conn row to the augmented mmCIF, downloads it (for refmacat), and applies the mod2 to the in-viewer ligand chem_comp so bond orders reflect the post-reaction state. Registry has 14 entries across F1-F6 chemistries (e.g. CYS-YNA-post, CYS-ACR-pre-terminal, CYS-CAA-pre, CYS-EPX-pre, CYS-MAL-pre, CYS-RVC-pre).",
  {
    sgCid: z.string().describe("Short-form CID of the Cys SG atom (e.g. //A/481/SG)"),
    cbCid: z.string().describe("Short-form CID of the ligand Cβ atom (e.g. //A/801/C19)"),
    linkId: z.string().describe("Registry entry id from cov-links/index.json (e.g. CYS-ACR-pre-terminal, CYS-YNA-post, CYS-CAA-pre)"),
    molNo: z.number().optional().describe("Molecule molNo containing both Cys and ligand (default: first loaded molecule)"),
    download: z.boolean().optional().describe("Trigger browser download of the augmented mmCIF (default true)"),
  },
  async ({ sgCid, cbCid, linkId, molNo, download }) =>
    ok(await invoke("declareCovalentLink", [sgCid, cbCid, linkId, molNo, download ?? true]))
);

const transport = new StdioServerTransport();
await server.connect(transport);

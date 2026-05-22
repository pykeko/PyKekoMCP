// Minimal MCP stdio client smoke test: spawn the built server, list tools, call a couple.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs";

const transport = new StdioClientTransport({ command: "node", args: ["dist/server.js"], env: process.env });
const client = new Client({ name: "moorhen-mcp-test", version: "0.0.1" }, { capabilities: {} });
await client.connect(transport);

const tools = await client.listTools();
console.log("TOOLS:", tools.tools.map((t) => t.name).join(", "));

const state = await client.callTool({ name: "moorhen_get_state", arguments: {} });
console.log("get_state ->", state.content?.[0]?.text?.slice(0, 200));

const shot = await client.callTool({ name: "moorhen_screenshot", arguments: {} });
const img = shot.content?.find((c) => c.type === "image");
if (img) { fs.writeFileSync("/tmp/mcp-client-shot.png", Buffer.from(img.data, "base64")); console.log("screenshot -> /tmp/mcp-client-shot.png", Buffer.from(img.data, "base64").length, "bytes"); }
else console.log("screenshot ->", JSON.stringify(shot).slice(0, 200));

await client.close();
process.exit(0);

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DEMO_LEADS, LeadStore } from "./leads-store.js";
import { buildServer } from "./server.js";

// stdio entry point. stdout belongs to the protocol, so logs go to stderr.
const server = buildServer(new LeadStore(DEMO_LEADS));
await server.connect(new StdioServerTransport());
console.error("leads MCP server running on stdio");

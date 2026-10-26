import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { scanForInjection } from "../guardrails/index.js";
import { CHANNELS, LeadStore, STAGES } from "./leads-store.js";

/**
 * Example MCP server: exposes a CRM-like lead funnel to any MCP client
 * (Claude Code, Claude Desktop, other agents).
 *
 * Design choices worth noting:
 * - Every tool declares an input schema and an output schema, so clients get
 *   structuredContent they can validate instead of parsing prose.
 * - Read tools are marked readOnlyHint; the write tool is not, so clients can
 *   ask for approval before running it.
 * - Free text coming from the store is screened before it is returned, since
 *   tool output is a classic prompt-injection path.
 */

const leadShape = {
  id: z.string(),
  name: z.string(),
  channel: z.enum(CHANNELS),
  stage: z.enum(STAGES),
  tags: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
};

export function buildServer(store: LeadStore): McpServer {
  const server = new McpServer({ name: "leads", version: "0.1.0" });

  server.registerTool(
    "search_leads",
    {
      title: "Search leads",
      description: "Find leads by name or tag, optionally filtered by funnel stage and channel.",
      inputSchema: {
        query: z.string().max(100).optional(),
        stage: z.enum(STAGES).optional(),
        channel: z.enum(CHANNELS).optional(),
        limit: z.number().int().min(1).max(50).default(20),
      },
      outputSchema: { leads: z.array(z.object(leadShape)), flagged: z.array(z.string()) },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const leads = store.search(args);
      const flagged = leads.filter((l) => scanForInjection(`${l.name} ${l.tags.join(" ")}`).suspicious).map((l) => l.id);
      const structuredContent = { leads, flagged };
      return { content: [{ type: "text", text: JSON.stringify(structuredContent) }], structuredContent };
    },
  );

  server.registerTool(
    "funnel_stats",
    {
      title: "Funnel statistics",
      description: "Lead counts per stage and the win rate among closed leads.",
      inputSchema: {},
      outputSchema: {
        total: z.number(),
        byStage: z.record(z.enum(STAGES), z.number()),
        conversionRate: z.number(),
      },
      annotations: { readOnlyHint: true },
    },
    async () => {
      const structuredContent = store.funnel();
      return { content: [{ type: "text", text: JSON.stringify(structuredContent) }], structuredContent };
    },
  );

  server.registerTool(
    "move_lead_stage",
    {
      title: "Move lead to another stage",
      description: "Change the funnel stage of an open lead. Closed leads (won/lost) cannot be moved.",
      inputSchema: { id: z.string().uuid(), stage: z.enum(STAGES) },
      outputSchema: { lead: z.object(leadShape) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ id, stage }) => {
      try {
        const lead = store.moveStage(id, stage);
        return { content: [{ type: "text", text: JSON.stringify({ lead }) }], structuredContent: { lead } };
      } catch (err) {
        return { isError: true, content: [{ type: "text", text: (err as Error).message }] };
      }
    },
  );

  return server;
}

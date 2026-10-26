import { randomUUID } from "node:crypto";

/**
 * In-memory lead store used by the example MCP server. It stands in for a CRM
 * so the server can be run and tested without external services. Data is
 * fictitious.
 */

export const STAGES = ["new", "contacted", "qualified", "proposal", "won", "lost"] as const;
export type Stage = (typeof STAGES)[number];
export const CHANNELS = ["whatsapp", "telegram", "email", "web"] as const;
export type Channel = (typeof CHANNELS)[number];

export interface Lead {
  id: string;
  name: string;
  channel: Channel;
  stage: Stage;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export class LeadStore {
  private readonly leads = new Map<string, Lead>();

  constructor(seed: Array<Omit<Lead, "id" | "createdAt" | "updatedAt">> = []) {
    for (const s of seed) this.create(s);
  }

  create(input: Omit<Lead, "id" | "createdAt" | "updatedAt">): Lead {
    const now = new Date().toISOString();
    const lead: Lead = { ...input, id: randomUUID(), createdAt: now, updatedAt: now };
    this.leads.set(lead.id, lead);
    return lead;
  }

  get(id: string): Lead | undefined {
    return this.leads.get(id);
  }

  search(filter: { query?: string; stage?: Stage; channel?: Channel; limit?: number }): Lead[] {
    const q = filter.query?.toLowerCase();
    return [...this.leads.values()]
      .filter((l) => !filter.stage || l.stage === filter.stage)
      .filter((l) => !filter.channel || l.channel === filter.channel)
      .filter((l) => !q || l.name.toLowerCase().includes(q) || l.tags.some((t) => t.toLowerCase().includes(q)))
      .slice(0, filter.limit ?? 20);
  }

  moveStage(id: string, stage: Stage): Lead {
    const lead = this.leads.get(id);
    if (!lead) throw new Error(`lead ${id} not found`);
    if (lead.stage === "won" || lead.stage === "lost") throw new Error(`lead ${id} is closed (${lead.stage})`);
    const updated = { ...lead, stage, updatedAt: new Date().toISOString() };
    this.leads.set(id, updated);
    return updated;
  }

  funnel(): { total: number; byStage: Record<Stage, number>; conversionRate: number } {
    const byStage = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>;
    for (const l of this.leads.values()) byStage[l.stage]++;
    const total = this.leads.size;
    const closed = byStage.won + byStage.lost;
    return { total, byStage, conversionRate: closed === 0 ? 0 : Number((byStage.won / closed).toFixed(3)) };
  }
}

export const DEMO_LEADS: Array<Omit<Lead, "id" | "createdAt" | "updatedAt">> = [
  { name: "Ana Prado", channel: "whatsapp", stage: "new", tags: ["plano-anual"] },
  { name: "Bruno Lima", channel: "telegram", stage: "contacted", tags: ["indicacao"] },
  { name: "Carla Souza", channel: "email", stage: "qualified", tags: ["empresa", "plano-anual"] },
  { name: "Diego Alves", channel: "web", stage: "won", tags: ["empresa"] },
  { name: "Eva Martins", channel: "whatsapp", stage: "lost", tags: ["preco"] },
];

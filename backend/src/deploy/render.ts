/**
 * Render REST client — the deploy rail's provider adapter.
 *
 * Free tier only, by design: plan "free" for the web service and the
 * Postgres instance, so the deploy demo costs zero real money. Only the
 * executor calls this module, and only in DEPLOY_MODE=live.
 *
 * API reference: https://api-docs.render.com
 */
import { env } from "../config.js";

const BASE = "https://api.render.com/v1";

function headers(): Record<string, string> {
  if (!env.RENDER_API_KEY) throw new Error("RENDER_API_KEY is not set (backend/.env)");
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${env.RENDER_API_KEY}`,
  };
}

async function renderFetch(label: string, path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: headers() });
  if (!res.ok) throw new Error(`${label} failed (${res.status}): ${await res.text()}`);
  // DELETE returns 204 with no body.
  return res.status === 204 ? null : res.json();
}

/** The workspace that owns everything we create. */
export async function getOwnerId(): Promise<string> {
  const owners = await renderFetch("list-owners", "/owners?limit=1");
  const owner = owners?.[0]?.owner;
  if (!owner?.id) throw new Error("Render returned no owner/workspace for this API key");
  return owner.id;
}

export interface RenderPostgres {
  id: string;
  status: string;
}

export async function createFreePostgres(ownerId: string, name: string): Promise<RenderPostgres> {
  const pg = await renderFetch("create-postgres", "/postgres", {
    method: "POST",
    body: JSON.stringify({ ownerId, name, plan: "free", version: "16", region: "oregon" }),
  });
  return { id: pg.id, status: pg.status ?? "creating" };
}

/** Poll until the database is available, then return its connection string. */
export async function waitForPostgres(
  id: string,
  { maxAttempts = 60, intervalMs = 5000 }: { maxAttempts?: number; intervalMs?: number } = {}
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const pg = await renderFetch("get-postgres", `/postgres/${id}`);
    if (pg.status === "available") {
      const info = await renderFetch("postgres-connection", `/postgres/${id}/connection-info`);
      const url = info.internalConnectionString ?? info.externalConnectionString;
      if (!url) throw new Error("Postgres is available but returned no connection string");
      return url;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Timed out waiting for the Postgres instance to become available");
}

export interface CreateServiceInput {
  ownerId: string;
  name: string;
  repoUrl: string; // public GitHub URL — no OAuth needed
  /** Omitted = the repo's default branch. */
  branch?: string;
  runtime: string;
  buildCommand: string;
  startCommand: string;
  envVars: Array<{ key: string; value: string }>;
}

export interface RenderService {
  id: string;
  url: string | null;
  deployId: string | null;
}

export async function createFreeWebService(input: CreateServiceInput): Promise<RenderService> {
  const created = await renderFetch("create-service", "/services", {
    method: "POST",
    body: JSON.stringify({
      type: "web_service",
      name: input.name,
      ownerId: input.ownerId,
      repo: input.repoUrl,
      ...(input.branch ? { branch: input.branch } : {}),
      autoDeploy: "yes",
      envVars: input.envVars,
      serviceDetails: {
        runtime: input.runtime,
        plan: "free",
        region: "oregon",
        envSpecificDetails: {
          buildCommand: input.buildCommand,
          startCommand: input.startCommand,
        },
      },
    }),
  });
  return {
    id: created.service?.id ?? created.id,
    url: created.service?.serviceDetails?.url ?? null,
    deployId: created.deployId ?? null,
  };
}

/** Poll the service's latest deploy until it goes live (or fails). */
export async function waitForDeploy(
  serviceId: string,
  { maxAttempts = 120, intervalMs = 5000 }: { maxAttempts?: number; intervalMs?: number } = {}
): Promise<void> {
  const FAILED = new Set(["build_failed", "update_failed", "canceled", "pre_deploy_failed", "deactivated"]);
  for (let i = 0; i < maxAttempts; i++) {
    const deploys = await renderFetch("list-deploys", `/services/${serviceId}/deploys?limit=1`);
    const status: string | undefined = deploys?.[0]?.deploy?.status;
    if (status === "live") return;
    if (status && FAILED.has(status)) throw new Error(`Render deploy ended in status "${status}"`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Timed out waiting for the Render deploy to go live (free-tier builds can be slow — check the Render dashboard)");
}

export async function getServiceUrl(serviceId: string): Promise<string | null> {
  const svc = await renderFetch("get-service", `/services/${serviceId}`);
  return svc?.serviceDetails?.url ?? null;
}

/** Cleanup for rehearsals — keeps the free-tier hours safe. */
export async function deleteService(serviceId: string): Promise<void> {
  await renderFetch("delete-service", `/services/${serviceId}`, { method: "DELETE" });
}

export async function deletePostgres(id: string): Promise<void> {
  await renderFetch("delete-postgres", `/postgres/${id}`, { method: "DELETE" });
}

import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { loadEnv, loadVerdictConfig } from "./config.js";
import { LiveTelegraphProvider, MockTelegraphProvider } from "./telegraph/provider.js";
import { checkNodeHealth } from "./telegraph/discovery.js";
import { ApplicationSchema, RunOptionsSchema } from "./telegraph/types.js";
import { Desk, type DeskEvent } from "./engine/desk.js";
import { evaluateVerdict } from "./engine/verdict.js";
import {
  createAndSignMemo,
  verifyMemo,
  saveMemoToFile,
  renderMemoText,
} from "./engine/memo.js";

const app = new Hono();
app.use("*", cors());

const env = loadEnv();
const verdictConfig = loadVerdictConfig();

// In-memory memo store and active event streams
const memosStore = new Map<string, any>();
const activeStreams = new Map<string, (event: DeskEvent) => void>();

// Health endpoint
app.get("/api/health", async (c) => {
  const health = await checkNodeHealth(env.TELEGRAPH_NODE);
  return c.json({
    status: "ok",
    node: env.TELEGRAPH_NODE,
    reachable: health.reachable,
    intentsCount: health.intentsCount,
    missingRequiredIntents: health.missingRequiredIntents,
    escrowAvailableMicroUsdc: health.escrowAvailableMicroUsdc,
    signerConfigured: Boolean(env.PRIVATE_KEY),
  });
});

// Create and trigger a memo evaluation
app.post("/api/memo", async (c) => {
  try {
    const body = await c.req.json();
    const parsedApp = ApplicationSchema.safeParse(body.application || body);
    if (!parsedApp.success) {
      return c.json({ error: "Invalid application format", details: parsedApp.error.issues }, 400);
    }

    const parsedOptions = RunOptionsSchema.partial().parse(body.options || {});
    const memoId = `memo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const provider = env.PRIVATE_KEY
      ? new LiveTelegraphProvider(env.TELEGRAPH_NODE, env.PRIVATE_KEY as `0x${string}`)
      : new MockTelegraphProvider();

    const desk = new Desk(provider);

    // Initial state
    memosStore.set(memoId, {
      id: memoId,
      status: "running",
      events: [] as DeskEvent[],
      memo: null,
      error: null,
    });

    // Handle desk events
    desk.on("event", (evt: DeskEvent) => {
      const stored = memosStore.get(memoId);
      if (stored) {
        stored.events.push(evt);
      }
      const listener = activeStreams.get(memoId);
      if (listener) {
        listener(evt);
      }
    });

    // Run asynchronously
    (async () => {
      try {
        const runResult = await desk.run(parsedApp.data, parsedOptions);
        const verdictResult = evaluateVerdict(
          parsedApp.data,
          runResult.checks,
          verdictConfig
        );

        const privateKey =
          (env.PRIVATE_KEY as `0x${string}`) ||
          "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

        const memo = await createAndSignMemo({
          application: parsedApp.data,
          checks: runResult.checks,
          verdict: verdictResult.verdict,
          reasons: verdictResult.reasons,
          missingEvidence: verdictResult.missingEvidence,
          budgetUsd: runResult.budgetUsd,
          spentUsd: runResult.totalSpentUsd,
          skipped: runResult.skipped,
          durationMs: runResult.durationMs,
          privateKey,
        });

        // Set ID consistently
        memo.id = memoId;
        saveMemoToFile(memo);

        const stored = memosStore.get(memoId);
        if (stored) {
          stored.status = "completed";
          stored.memo = memo;
        }

        const listener = activeStreams.get(memoId);
        if (listener) {
          listener({
            type: "desk_completed",
            checkId: "all",
            totalSpentUsd: runResult.totalSpentUsd,
            remainingChecks: 0,
            data: memo,
          });
        }
      } catch (err: any) {
        const stored = memosStore.get(memoId);
        if (stored) {
          stored.status = "failed";
          stored.error = err.message;
        }
      }
    })();

    return c.json({ id: memoId, status: "processing" }, 202);
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to start memo analysis" }, 500);
  }
});

// SSE endpoint for live updates
app.get("/api/memo/:id/events", (c) => {
  const memoId = c.req.param("id");
  const stored = memosStore.get(memoId);
  if (!stored) {
    return c.text("Memo not found", 404);
  }

  return streamSSE(c, async (stream) => {
    // Send existing historical events
    for (const evt of stored.events) {
      await stream.writeSSE({
        event: evt.type,
        data: JSON.stringify(evt),
      });
    }

    if (stored.status === "completed" && stored.memo) {
      await stream.writeSSE({
        event: "desk_completed",
        data: JSON.stringify({
          type: "desk_completed",
          data: stored.memo,
          totalSpentUsd: stored.memo.cost.spentUsd,
        }),
      });
      return;
    }

    // Attach active listener
    const listener = async (evt: DeskEvent) => {
      try {
        await stream.writeSSE({
          event: evt.type,
          data: JSON.stringify(evt),
        });
      } catch {}
    };

    activeStreams.set(memoId, listener);

    stream.onAbort(() => {
      activeStreams.delete(memoId);
    });

    // Keep stream open while running
    while (stored.status === "running") {
      await new Promise((r) => setTimeout(r, 1000));
    }
  });
});

// Get Memo JSON
app.get("/api/memo/:id", (c) => {
  const memoId = c.req.param("id");
  const stored = memosStore.get(memoId);
  if (stored && stored.memo) {
    return c.json(stored.memo);
  }

  // Check on disk
  const filePath = path.resolve(process.cwd(), "data", "memos", `${memoId}.json`);
  if (fs.existsSync(filePath)) {
    const raw = fs.readFileSync(filePath, "utf-8");
    return c.json(JSON.parse(raw));
  }

  return c.json({ error: "Memo not found" }, 404);
});

// Get text/HTML rendered view
app.get("/api/memo/:id/view", (c) => {
  const memoId = c.req.param("id");
  const stored = memosStore.get(memoId);
  let memo = stored?.memo;

  if (!memo) {
    const filePath = path.resolve(process.cwd(), "data", "memos", `${memoId}.json`);
    if (fs.existsSync(filePath)) {
      memo = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  }

  if (!memo) {
    return c.text("Memo not found", 404);
  }

  const text = renderMemoText(memo);
  return c.text(text);
});

// Verify endpoint
app.post("/api/verify", async (c) => {
  try {
    const memo = await c.req.json();
    const result = await verifyMemo(memo);
    return c.json(result);
  } catch (err: any) {
    return c.json({ valid: false, error: err.message }, 400);
  }
});

// Serve static web/index.html
app.get("/", (c) => {
  const htmlPath = path.resolve(process.cwd(), "web", "index.html");
  if (fs.existsSync(htmlPath)) {
    return c.html(fs.readFileSync(htmlPath, "utf-8"));
  }
  return c.text("ListingGuard Web UI coming up...");
});

const port = env.PORT || 8787;
console.log(`\n=================================================`);
console.log(` ListingGuard Desk Server running at http://localhost:${port}`);
console.log(` API & SSE active | Telegraph Node: ${env.TELEGRAPH_NODE}`);
console.log(`=================================================\n`);

serve({
  fetch: app.fetch,
  port,
});

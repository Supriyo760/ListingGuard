import EventEmitter from "node:events";
import type {
  Application,
  CheckResult,
  RunOptions,
} from "../telegraph/types.js";
import type { ITelegraphProvider } from "../telegraph/provider.js";
import {
  buildChecksForApplication,
  type CheckDefinition,
} from "../checks/registry.js";
import { crossCheck } from "./reconcile.js";

export interface DeskEvent {
  type: "check_started" | "check_done" | "check_failed" | "check_skipped" | "desk_completed";
  checkId: string;
  intent?: string;
  subject?: string;
  costUsd?: number;
  totalSpentUsd: number;
  remainingChecks: number;
  data?: unknown;
}

export class Desk extends EventEmitter {
  private provider: ITelegraphProvider;

  constructor(provider: ITelegraphProvider) {
    super();
    this.provider = provider;
  }

  public async run(
    app: Application,
    options: Partial<RunOptions> = {}
  ): Promise<{
    checks: CheckResult[];
    totalSpentUsd: number;
    budgetUsd: number;
    skipped: string[];
    durationMs: number;
  }> {
    const startTime = Date.now();
    const budgetUsd = options.budgetUsd ?? 1.0;
    const perAskBudgetMicro = options.perAskBudgetMicro ?? 30000;
    const deadlineMs = options.deadlineMs ?? 20000;
    const concurrency = 6;
    const enableCrosscheck = options.crosscheck ?? false;

    // 1. Build list of checks for this application
    const rawCheckDefs = buildChecksForApplication(app, {
      perAskBudgetMicro,
      deadlineMs,
    });

    // 2. Budget planning: Drop optional checks if worst-case spend exceeds budget
    const perCheckMaxUsd = perAskBudgetMicro / 1_000_000;
    let plannedChecks = [...rawCheckDefs];
    const skippedCheckIds: string[] = [];

    const dropPriority = ["audit", "codeReview", "social", "walletBalance"];

    while (
      plannedChecks.length * perCheckMaxUsd > budgetUsd &&
      plannedChecks.some((c) => !c.required)
    ) {
      // Find lowest priority optional check to drop
      let droppedIndex = -1;
      for (const prefix of dropPriority) {
        droppedIndex = plannedChecks.findIndex(
          (c) => !c.required && c.id.startsWith(prefix)
        );
        if (droppedIndex !== -1) break;
      }
      if (droppedIndex === -1) {
        // Drop any non-required check
        droppedIndex = plannedChecks.findIndex((c) => !c.required);
      }
      if (droppedIndex === -1) break; // Only required checks remain

      const dropped = plannedChecks.splice(droppedIndex, 1)[0];
      skippedCheckIds.push(dropped.id);
      this.emit("event", {
        type: "check_skipped",
        checkId: dropped.id,
        intent: dropped.intent,
        subject: dropped.subject,
        totalSpentUsd: 0,
        remainingChecks: plannedChecks.length,
        data: { reason: "Dropped to stay within budget limit" },
      } as DeskEvent);
    }

    const results: CheckResult[] = [];
    let totalSpentUsd = 0;
    let remaining = plannedChecks.length;

    // 3. Concurrency worker queue
    const queue = [...plannedChecks];
    const activeWorkers: Promise<void>[] = [];

    const runWorker = async () => {
      while (queue.length > 0) {
        const checkDef = queue.shift();
        if (!checkDef) break;

        this.emit("event", {
          type: "check_started",
          checkId: checkDef.id,
          intent: checkDef.intent,
          subject: checkDef.subject,
          totalSpentUsd,
          remainingChecks: remaining,
        } as DeskEvent);

        try {
          const askOpts = checkDef.buildAsk(app, {
            perAskBudgetMicro,
            deadlineMs,
          });

          let checkResult: CheckResult;

          // Cross-check for security and sanctions if enabled and applicable
          if (
            enableCrosscheck &&
            (checkDef.id === "security" || checkDef.id.startsWith("sanctions_"))
          ) {
            checkResult = await crossCheck(
              this.provider,
              checkDef.intent,
              checkDef.subject,
              askOpts
            );
            checkResult.id = checkDef.id; // Keep original check ID
          } else {
            const rawRes = await this.provider.ask(askOpts);
            checkResult = checkDef.parseResult(rawRes, checkDef.subject);
          }

          const checkCost = checkResult.spend.reduce((acc, s) => acc + s.costUsd, 0);
          totalSpentUsd += checkCost;
          results.push(checkResult);
          remaining--;

          this.emit("event", {
            type: "check_done",
            checkId: checkDef.id,
            intent: checkDef.intent,
            subject: checkDef.subject,
            costUsd: checkCost,
            totalSpentUsd,
            remainingChecks: remaining,
            data: checkResult,
          } as DeskEvent);
        } catch (err: any) {
          // Never throw on individual check failure
          remaining--;
          const failedResult: CheckResult = {
            id: checkDef.id,
            intent: checkDef.intent,
            subject: checkDef.subject,
            status: "failed",
            fields: null,
            fieldStatus: {},
            confidence: "unverified",
            spend: [],
            error: err.message || "Execution error",
          };
          results.push(failedResult);

          this.emit("event", {
            type: "check_failed",
            checkId: checkDef.id,
            intent: checkDef.intent,
            subject: checkDef.subject,
            costUsd: 0,
            totalSpentUsd,
            remainingChecks: remaining,
            data: failedResult,
          } as DeskEvent);
        }
      }
    };

    const workerCount = Math.min(concurrency, plannedChecks.length);
    for (let i = 0; i < workerCount; i++) {
      activeWorkers.push(runWorker());
    }

    await Promise.all(activeWorkers);

    const durationMs = Date.now() - startTime;
    this.emit("event", {
      type: "desk_completed",
      checkId: "all",
      totalSpentUsd,
      remainingChecks: 0,
      data: { totalChecks: results.length, durationMs },
    } as DeskEvent);

    return {
      checks: results,
      totalSpentUsd: Number(totalSpentUsd.toFixed(4)),
      budgetUsd,
      skipped: skippedCheckIds,
      durationMs,
    };
  }
}

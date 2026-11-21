import crypto from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import type { NodeAskResponse } from "./types.js";

export class InvalidParamsError extends Error {
  public data: unknown;
  constructor(message: string, data: unknown) {
    super(message);
    this.name = "InvalidParamsError";
    this.data = data;
  }
}

export class InsufficientEscrowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InsufficientEscrowError";
  }
}

export interface AskOptions {
  intent: string;
  params?: Record<string, unknown>;
  query?: string;
  maxBudgetMicro?: number;
  deadlineMs?: number;
  minerId?: string;
}

export interface EscrowAskResult {
  status: number;
  data: NodeAskResponse;
  receipt: {
    receipt_hash?: string;
    epoch_id?: string;
    amount?: number;
    miner?: string;
    [key: string]: unknown;
  } | null;
}

export interface EscrowClientConfig {
  nodeUrl: string;
  privateKey: `0x${string}`;
}

export class EscrowClient {
  public nodeUrl: string;
  public account: ReturnType<typeof privateKeyToAccount>;

  constructor(config: EscrowClientConfig) {
    this.nodeUrl = config.nodeUrl.replace(/\/+$/, "");
    this.account = privateKeyToAccount(config.privateKey);
  }

  public get address(): `0x${string}` {
    return this.account.address;
  }

  /**
   * Builds the EIP-191 message and payment authorization object from the 402 challenge.
   */
  public async buildPaymentPayload(challenge: any) {
    const escrow = challenge.accepts?.find((a: any) => a.scheme === "escrow");
    if (!escrow) {
      throw new Error("Telegraph node did not return an escrow scheme challenge");
    }

    const template: string = escrow.extra?.message;
    if (!template) {
      throw new Error("Challenge escrow missing extra.message template");
    }

    const amountMatch = template.match(/Amount:\s*(\d+)\s*uUSDC/i);
    const amountVal = amountMatch ? amountMatch[1] : "10000";

    const now = Math.floor(Date.now() / 1000);
    const auth = {
      from: this.account.address.toLowerCase(),
      to: escrow.payTo,
      value: amountVal,
      validAfter: String(now - 5),
      validBefore: String(now + 100), // Validity window < 2 min
      nonce: crypto.randomUUID(),
    };

    const message = template
      .replace("{from}", auth.from)
      .replace("{nonce}", auth.nonce)
      .replace("{validAfter}", auth.validAfter)
      .replace("{validBefore}", auth.validBefore);

    const signature = await this.account.signMessage({ message });

    const paymentHeaderObj = {
      x402Version: 2,
      scheme: "escrow",
      network: escrow.network,
      payload: {
        signature,
        authorization: auth,
      },
    };

    const paymentHeaderBase64 = Buffer.from(
      JSON.stringify(paymentHeaderObj)
    ).toString("base64");

    return { paymentHeaderBase64, auth, message };
  }

  /**
   * Executes a paid ask via the Telegraph Escrow scheme.
   */
  public async ask(options: AskOptions, attempt = 1): Promise<EscrowAskResult> {
    const endpoint = options.minerId
      ? `${this.nodeUrl}/engine/v1/ask/${options.minerId}`
      : `${this.nodeUrl}/engine/v1/ask`;

    const requestBodyObj: Record<string, unknown> = {};
    if (options.intent) requestBodyObj.intent = options.intent;
    if (options.params) requestBodyObj.params = options.params;
    if (options.query) requestBodyObj.query = options.query;
    if (options.maxBudgetMicro !== undefined)
      requestBodyObj.max_budget_usdc = options.maxBudgetMicro;
    if (options.deadlineMs !== undefined)
      requestBodyObj.deadline_ms = options.deadlineMs;

    const requestBody = JSON.stringify(requestBodyObj);
    const initialHeaders = { "Content-Type": "application/json" };

    // Step 1: Initial call with no payment header to obtain 402 challenge
    const challengeRes = await fetch(endpoint, {
      method: "POST",
      headers: initialHeaders,
      body: requestBody,
    });

    if (challengeRes.status === 400) {
      const errData = await challengeRes.json().catch(() => ({}));
      throw new InvalidParamsError(
        `Invalid parameters for intent ${options.intent}: ${JSON.stringify(errData)}`,
        errData
      );
    }

    if (challengeRes.status === 200) {
      // Free endpoint or unexpectedly unbilled
      const data = (await challengeRes.json()) as NodeAskResponse;
      return { status: 200, data, receipt: null };
    }

    if (challengeRes.status !== 402) {
      const errText = await challengeRes.text();
      throw new Error(`Unexpected challenge response status ${challengeRes.status}: ${errText}`);
    }

    const challenge = await challengeRes.json();

    // Step 2 & 3: Construct authorization and sign
    const { paymentHeaderBase64 } = await this.buildPaymentPayload(challenge);

    // Step 4: Re-post identical body with X-PAYMENT header
    const paidRes = await fetch(endpoint, {
      method: "POST",
      headers: {
        ...initialHeaders,
        "X-PAYMENT": paymentHeaderBase64,
      },
      body: requestBody,
    });

    if (paidRes.status === 402) {
      const errBody: any = await paidRes.json().catch(() => ({}));
      const reason = (errBody.reason || errBody.error || "").toLowerCase();

      if (reason.includes("insufficient escrow") || reason.includes("balance")) {
        throw new InsufficientEscrowError(
          `Insufficient escrow balance: ${errBody.reason || "Please deposit USDC to escrow"}`
        );
      }

      if (reason.includes("charge limit reached")) {
        // Wait for next block / few seconds and retry once
        if (attempt <= 2) {
          await new Promise((r) => setTimeout(r, 4000));
          return this.ask(options, attempt + 1);
        }
      }

      if (
        (reason.includes("nonce") ||
          reason.includes("expiry") ||
          reason.includes("expired") ||
          reason.includes("could not be recorded")) &&
        attempt <= 2
      ) {
        // Retry ONCE with a fresh nonce and timestamp
        await new Promise((r) => setTimeout(r, 1000));
        return this.ask(options, attempt + 1);
      }

      throw new Error(`Payment rejected (402): ${JSON.stringify(errBody)}`);
    }

    if (paidRes.status === 429) {
      if (attempt <= 2) {
        await new Promise((r) => setTimeout(r, 5000));
        return this.ask(options, attempt + 1);
      }
      throw new Error("Rate limit exceeded (429)");
    }

    if (paidRes.status >= 500) {
      const errText = await paidRes.text().catch(() => "");
      throw new Error(`Node server error (${paidRes.status}): ${errText}`);
    }

    const receiptHeader = paidRes.headers.get("X-PAYMENT-RESPONSE");
    let receipt: any = null;
    if (receiptHeader) {
      try {
        const decoded = Buffer.from(receiptHeader, "base64").toString("utf-8");
        receipt = JSON.parse(decoded);
      } catch {
        receipt = { raw: receiptHeader };
      }
    }

    const data = (await paidRes.json()) as NodeAskResponse;
    return {
      status: paidRes.status,
      data,
      receipt,
    };
  }
}

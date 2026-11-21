import { describe, it, expect } from "vitest";
import { EscrowClient } from "../src/telegraph/escrow.js";

describe("Escrow Client Payment Templating", () => {
  const privateKey =
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const client = new EscrowClient({
    nodeUrl: "https://devnode.telegraphprotocol.com",
    privateKey,
  });

  const mockChallenge = {
    accepts: [
      {
        scheme: "escrow",
        network: "ethereum-sepolia",
        payTo: "0x72a70e949362670bf8bcead24efc5b8f950aa08b",
        extra: {
          message:
            "Authorize Telegraph Intelligence Purchase\nFrom: {from}\nAmount: 30000 uUSDC\nNonce: {nonce}\nValidAfter: {validAfter}\nValidBefore: {validBefore}\nResource: /engine/v1/ask\nNetwork: ethereum-sepolia",
        },
      },
    ],
  };

  it("extracts amount and formats lowercase from address", async () => {
    const { auth, message } = await client.buildPaymentPayload(mockChallenge);

    expect(auth.from).toBe(client.address.toLowerCase());
    expect(auth.value).toBe("30000");
    expect(auth.to).toBe("0x72a70e949362670bf8bcead24efc5b8f950aa08b");

    expect(message).toContain(`From: ${client.address.toLowerCase()}`);
    expect(message).toContain("Amount: 30000 uUSDC");
    expect(message).toContain(`Nonce: ${auth.nonce}`);
  });

  it("generates a fresh random nonce on every attempt", async () => {
    const payload1 = await client.buildPaymentPayload(mockChallenge);
    const payload2 = await client.buildPaymentPayload(mockChallenge);

    expect(payload1.auth.nonce).not.toBe(payload2.auth.nonce);
    expect(payload1.paymentHeaderBase64).not.toBe(payload2.paymentHeaderBase64);
  });

  it("ensures validity window is under 120 seconds", async () => {
    const { auth } = await client.buildPaymentPayload(mockChallenge);
    const validAfter = parseInt(auth.validAfter, 10);
    const validBefore = parseInt(auth.validBefore, 10);
    const windowSeconds = validBefore - validAfter;

    expect(windowSeconds).toBeLessThanOrEqual(120);
    expect(windowSeconds).toBeGreaterThan(0);
  });

  it("generates valid base64 JSON payload with x402Version 2", async () => {
    const { paymentHeaderBase64 } = await client.buildPaymentPayload(mockChallenge);
    const decoded = JSON.parse(
      Buffer.from(paymentHeaderBase64, "base64").toString("utf-8")
    );

    expect(decoded.x402Version).toBe(2);
    expect(decoded.scheme).toBe("escrow");
    expect(decoded.network).toBe("ethereum-sepolia");
    expect(decoded.payload.signature).toMatch(/^0x[a-fA-F0-9]{130}$/);
    expect(decoded.payload.authorization.from).toBe(client.address.toLowerCase());
  });
});

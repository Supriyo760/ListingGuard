export interface IntentSummary {
  name: string;
  miner_count?: number;
  description?: string;
  category?: string;
  [key: string]: unknown;
}

export interface AccountLedger {
  address: string;
  available: string; // in micro USDC
  deposited?: string;
  locked?: string;
  [key: string]: unknown;
}

export interface HealthCheckResult {
  reachable: boolean;
  intentsCount: number;
  missingRequiredIntents: string[];
  escrowAvailableMicroUsdc: number | null;
  error?: string;
}

export const REQUIRED_INTENTS = [
  "SECURITY_REVIEW_GENERAL",
  "TOKEN_HOLDER_COUNT_GENERAL",
  "TOKEN_TOTAL_SUPPLY_VERIFY_GENERAL",
  "WASH_TRADING_DETECTION_GENERAL",
];

export async function getIntents(nodeUrl: string): Promise<IntentSummary[]> {
  const url = `${nodeUrl.replace(/\/+$/, "")}/engine/v1/intents`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch intents: ${res.statusText}`);
  }
  const data: any = await res.json();
  return Array.isArray(data) ? data : data.intents || [];
}

export async function getIntentSchema(
  nodeUrl: string,
  intentName: string
): Promise<Record<string, unknown>> {
  const url = `${nodeUrl.replace(/\/+$/, "")}/engine/v1/intents/${intentName}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch intent schema for ${intentName}: ${res.statusText}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

export async function getMinersForIntent(
  nodeUrl: string,
  intentName: string
): Promise<any[]> {
  const url = `${nodeUrl.replace(/\/+$/, "")}/engine/v1/intents/${intentName}/miners`;
  const res = await fetch(url);
  if (!res.ok) {
    return [];
  }
  const data: any = await res.json();
  return Array.isArray(data) ? data : data.miners || [];
}

export async function getLeaderboard(nodeUrl: string): Promise<any[]> {
  const url = `${nodeUrl.replace(/\/+$/, "")}/leaderboard/miners`;
  const res = await fetch(url);
  if (!res.ok) {
    return [];
  }
  const data: any = await res.json();
  return Array.isArray(data) ? data : data.miners || [];
}

export async function getAccountLedger(
  nodeUrl: string,
  address: string
): Promise<AccountLedger | null> {
  const url = `${nodeUrl.replace(/\/+$/, "")}/v1/ledger/account/${address.toLowerCase()}`;
  const res = await fetch(url);
  if (!res.ok) {
    return null;
  }
  return res.json() as Promise<AccountLedger>;
}

export async function checkNodeHealth(
  nodeUrl: string,
  address?: string
): Promise<HealthCheckResult> {
  try {
    const intents = await getIntents(nodeUrl);
    const intentMap = new Map(intents.map((i) => [i.name, i.miner_count ?? 0]));

    const missingRequired: string[] = [];
    for (const req of REQUIRED_INTENTS) {
      const count = intentMap.get(req) ?? 0;
      if (count === 0) {
        missingRequired.push(req);
      }
    }

    let escrowAvailable: number | null = null;
    if (address) {
      const ledger = await getAccountLedger(nodeUrl, address);
      if (ledger && ledger.available) {
        escrowAvailable = parseInt(ledger.available, 10);
      }
    }

    return {
      reachable: true,
      intentsCount: intents.length,
      missingRequiredIntents: missingRequired,
      escrowAvailableMicroUsdc: escrowAvailable,
    };
  } catch (err: any) {
    return {
      reachable: false,
      intentsCount: 0,
      missingRequiredIntents: REQUIRED_INTENTS,
      escrowAvailableMicroUsdc: null,
      error: err.message,
    };
  }
}

import { createWalletClient, createPublicClient, http, parseUnits, formatUnits } from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { loadEnv } from "../config.js";
import { getAccountLedger } from "../telegraph/discovery.js";

const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const DIAMOND_ABI = [
  {
    name: "depositUSDC",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
] as const;

async function main() {
  const env = loadEnv();
  if (!env.PRIVATE_KEY) {
    console.error("Error: PRIVATE_KEY must be set in .env to deposit funds.");
    process.exit(1);
  }

  const account = privateKeyToAccount(env.PRIVATE_KEY as `0x${string}`);
  const rpcUrl = env.SEPOLIA_RPC;
  const diamondAddr = env.DIAMOND as `0x${string}`;
  const usdcAddr = env.USDC as `0x${string}`;

  console.log("=== ListingGuard Escrow Deposit ===");
  console.log(`Wallet Address : ${account.address}`);
  console.log(`Diamond Address: ${diamondAddr}`);
  console.log(`USDC Contract  : ${usdcAddr}`);
  console.log(`Sepolia RPC    : ${rpcUrl}`);

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpcUrl),
  });

  // Check ETH balance
  const ethBalance = await publicClient.getBalance({ address: account.address });
  console.log(`Sepolia ETH Balance: ${formatUnits(ethBalance, 18)} ETH`);
  if (ethBalance === 0n) {
    console.error("Error: Wallet has 0 Sepolia ETH. Please fund with testnet ETH from a faucet.");
    process.exit(1);
  }

  // Check USDC balance
  const rawUsdcBalance = await publicClient.readContract({
    address: usdcAddr,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [account.address],
  });
  console.log(`Test USDC Balance  : ${formatUnits(rawUsdcBalance, 6)} USDC`);

  // Parse amount from args or default to user balance (up to 5 USDC) or 1 USDC
  const availableUsdcNum = parseFloat(formatUnits(rawUsdcBalance, 6));
  let amountArg = process.argv[2] ? parseFloat(process.argv[2]) : (availableUsdcNum >= 1 ? Math.min(availableUsdcNum, 5.0) : 1.0);
  const amountUnits = parseUnits(String(amountArg), 6);

  if (rawUsdcBalance < amountUnits) {
    console.error(
      `Error: Insufficient USDC balance. Have ${formatUnits(rawUsdcBalance, 6)} USDC, need ${amountArg} USDC.`
    );
    console.error("Claim free test USDC from https://anjoman.ai/dashboard/faucet");
    process.exit(1);
  }

  console.log(`\nStep 1: Approving Diamond for ${amountArg} USDC...`);
  const approveTx = await walletClient.writeContract({
    address: usdcAddr,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [diamondAddr, amountUnits],
  });
  console.log(`Approve tx submitted: ${approveTx}`);
  await publicClient.waitForTransactionReceipt({ hash: approveTx });
  console.log("Approve tx confirmed!");

  console.log(`\nStep 2: Depositing ${amountArg} USDC into Diamond...`);
  const depositTx = await walletClient.writeContract({
    address: diamondAddr,
    abi: DIAMOND_ABI,
    functionName: "depositUSDC",
    args: [amountUnits],
  });
  console.log(`Deposit tx submitted: ${depositTx}`);
  await publicClient.waitForTransactionReceipt({ hash: depositTx });
  console.log("Deposit tx confirmed!");

  // Step 3: Check Telegraph off-chain ledger
  console.log("\nStep 3: Checking Telegraph protocol escrow ledger...");
  const ledger = await getAccountLedger(env.TELEGRAPH_NODE, account.address);
  if (ledger) {
    const availableUsd = (parseInt(ledger.available || "0", 10) / 1_000_000).toFixed(4);
    console.log(`Off-chain Available Escrow: $${availableUsd} USDC (${ledger.available} uUSDC)`);
  } else {
    console.log("Ledger record updating shortly on testnet node.");
  }

  console.log("\nDeposit complete! You are ready to run paid intelligence checks.");
}

main().catch((err) => {
  console.error("Deposit failed:", err);
  process.exit(1);
});

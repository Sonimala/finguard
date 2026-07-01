import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { Account, Transaction, FraudCase, SystemStats } from "./src/types.js";

// Load environment variables
dotenv.config();

const PORT = 3000;
const app = express();
app.use(express.json());

// Initialize Gemini Client safely
let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
} else {
  console.warn("GEMINI_API_KEY is not defined in the environment. AI reports will operate in highly-realistic simulation fallback mode.");
}

// Global In-Memory Store
let accounts: Account[] = [
  // Reputable Businesses
  { id: "ACC-101", name: "Nexus Tech Solutions", type: "Business", country: "United States", baseRiskScore: 0.05, balance: 4500000, riskVelocity: 0.02, createdAt: "2024-01-15T08:00:00Z", status: "Active" },
  { id: "ACC-102", name: "Global Logistics Corp", type: "Business", country: "United Kingdom", baseRiskScore: 0.10, balance: 12000000, riskVelocity: 0.04, createdAt: "2024-02-10T09:30:00Z", status: "Active" },
  { id: "ACC-103", name: "Zenith Retail Trade", type: "Business", country: "Germany", baseRiskScore: 0.08, balance: 1850000, riskVelocity: 0.03, createdAt: "2024-05-12T11:00:00Z", status: "Active" },
  
  // Everyday Personal Accounts
  { id: "ACC-201", name: "Alice Smith", type: "Personal", country: "United States", baseRiskScore: 0.12, balance: 45000, riskVelocity: 0.05, createdAt: "2025-06-01T14:15:00Z", status: "Active" },
  { id: "ACC-202", name: "Bob Jones", type: "Personal", country: "Canada", baseRiskScore: 0.15, balance: 12000, riskVelocity: 0.08, createdAt: "2025-06-15T16:45:00Z", status: "Active" },
  { id: "ACC-203", name: "Sophia Chen", type: "Personal", country: "Singapore", baseRiskScore: 0.09, balance: 85000, riskVelocity: 0.04, createdAt: "2025-07-20T10:20:00Z", status: "Active" },
  { id: "ACC-204", name: "Marcus Miller", type: "Personal", country: "Australia", baseRiskScore: 0.18, balance: 23000, riskVelocity: 0.11, createdAt: "2025-09-05T12:00:00Z", status: "Active" },
  
  // Hidden / Mule / Offshore Accounts
  { id: "ACC-901", name: "Mule Acc #4902", type: "Mule Account", country: "United States", baseRiskScore: 0.72, balance: 14500, riskVelocity: 0.35, createdAt: "2026-02-01T23:00:00Z", status: "Active" },
  { id: "ACC-902", name: "Mule Acc #5112", type: "Mule Account", country: "Latvia", baseRiskScore: 0.68, balance: 8200, riskVelocity: 0.42, createdAt: "2026-03-14T02:10:00Z", status: "Active" },
  { id: "ACC-903", name: "Orion Shell Inc", type: "Shell Company", country: "Cayman Islands", baseRiskScore: 0.85, balance: 2500000, riskVelocity: 0.50, createdAt: "2025-11-30T17:00:00Z", status: "Active" },
  { id: "ACC-904", name: "Pacifica Holdings LLC", type: "Shell Company", country: "Panama", baseRiskScore: 0.88, balance: 1800000, riskVelocity: 0.55, createdAt: "2025-12-15T18:30:00Z", status: "Active" },
  { id: "ACC-905", name: "Apex Horizon Trust", type: "Offshore", country: "Seychelles", baseRiskScore: 0.92, balance: 3400000, riskVelocity: 0.60, createdAt: "2026-01-10T15:00:00Z", status: "Active" },
];

let transactions: Transaction[] = [];
let fraudCases: FraudCase[] = [];
let isSimulationRunning = true;
let simulationInterval: NodeJS.Timeout | null = null;

// Initialize with some seed transactions to make the graph look alive right away
function generateSeedData() {
  const seedPairs = [
    { from: "ACC-101", to: "ACC-201", amount: 1500, type: "ACH" },
    { from: "ACC-101", to: "ACC-202", amount: 2400, type: "ACH" },
    { from: "ACC-102", to: "ACC-103", amount: 125000, type: "Wire Transfer" },
    { from: "ACC-103", to: "ACC-203", amount: 4500, type: "ACH" },
    { from: "ACC-203", to: "ACC-201", amount: 300, type: "Card Payment" },
    { from: "ACC-204", to: "ACC-103", amount: 890, type: "Card Payment" },
    { from: "ACC-201", to: "ACC-202", amount: 150, type: "Card Payment" },
  ];

  const now = new Date();
  seedPairs.forEach((pair, idx) => {
    const fromAcc = accounts.find(a => a.id === pair.from)!;
    const toAcc = accounts.find(a => a.id === pair.to)!;
    const time = new Date(now.getTime() - (seedPairs.length - idx) * 3600000); // spread hours
    
    // Low risk score for seed transactions
    const tx: Transaction = {
      id: `TX-${1000 + idx}`,
      fromId: pair.from,
      toId: pair.to,
      fromName: fromAcc.name,
      toName: toAcc.name,
      amount: pair.amount,
      timestamp: time.toISOString(),
      type: pair.type as any,
      riskScore: 0.05 + Math.random() * 0.1,
      features: {
        isolationForestScore: 0.12 + Math.random() * 0.1,
        autoencoderError: 0.8 + Math.random() * 0.5,
        velocityIndex: 0.05 + Math.random() * 0.05,
        isCyclic: false,
      },
      status: "Cleared"
    };

    transactions.push(tx);
    // Adjust balances
    fromAcc.balance -= pair.amount;
    toAcc.balance += pair.amount;
  });
}

generateSeedData();

// Core Analytics Engine (Simulating Spatial Vector Shifts & Isolation Forest Paths)
// This is mathematically modeled to react dynamically based on actual transaction profiles!
function processTransactionRisk(tx: {
  fromId: string;
  toId: string;
  amount: number;
  type: string;
  timestamp: string;
}): Transaction {
  const fromAcc = accounts.find(a => a.id === tx.fromId)!;
  const toAcc = accounts.find(a => a.id === tx.toId)!;

  // Let's gather recent activity for volume and velocity multipliers
  const recentFromTx = transactions.filter(t => t.fromId === tx.fromId);
  const recentVolume = recentFromTx.slice(-5).reduce((sum, t) => sum + t.amount, 0);
  const frequencyCount = recentFromTx.filter(t => {
    const tTime = new Date(t.timestamp).getTime();
    const currTime = new Date(tx.timestamp).getTime();
    return (currTime - tTime) < 300000; // past 5 minutes
  }).length;

  // 1. ISOLATION FOREST PATH LENGTH CALCULATION SIMULATOR
  // Feature vector: [Amount, SourceRisk, DestRisk, Frequency, Timing]
  // Normal paths require more splits to isolate (longer path, e.g. 12 splits)
  // Anomaly features isolate in very few splits (shorter path, e.g. 3 splits)
  let forestSplits = 14; // Start with deep normal tree
  
  if (tx.amount > 100000) forestSplits -= 3; // high amount is easy to isolate
  if (tx.amount > 500000) forestSplits -= 2;
  if (fromAcc.baseRiskScore > 0.5) forestSplits -= 2; // high risk source isolates faster
  if (toAcc.baseRiskScore > 0.5) forestSplits -= 2; // high risk dest isolates faster
  if (frequencyCount > 3) forestSplits -= 2; // rapid repetition is a clear anomaly
  
  // Account Status Multipliers for Isolation Forest
  if (fromAcc.status === "EDD") forestSplits -= 3;
  if (toAcc.status === "EDD") forestSplits -= 3;
  if (fromAcc.status === "Frozen" || toAcc.status === "Frozen") forestSplits = 1; // instantly isolated
  
  // Timing: Midnight/early morning anomalies (00:00 - 05:00)
  const hour = new Date(tx.timestamp).getHours();
  if (hour >= 0 && hour <= 5) {
    forestSplits -= 1.5;
  }
  
  // Anomaly score calculation: s(x, n) = 2^(-E(h(x)) / c(n))
  // where c(n) is the average path length of unsuccessful searches. Let's set c(n) = 10.
  // s ranges from 0 to 1, with values closer to 1 indicating high anomalies.
  const avgPath = 10;
  const isolationForestScore = Math.min(0.99, Math.max(0.02, Math.pow(2, -forestSplits / avgPath)));

  // 2. AUTOENCODER RECONSTRUCTION ERROR SIMULATOR
  // Normal vectors compress & reconstruct with high fidelity.
  // Out-of-bounds structural profiles fail reconstruction bottleneck.
  let reconstructionError = 0.5; // low base error
  
  // Check cyclical loops
  const isCyclic = checkCycles(tx.fromId, tx.toId, 4); // search up to 4 hops
  
  if (isCyclic) {
    reconstructionError += 6.5;
  }
  if (fromAcc.type === "Mule Account" || toAcc.type === "Mule Account") {
    reconstructionError += 2.2;
  }
  if (fromAcc.type === "Shell Company" && toAcc.type === "Offshore") {
    reconstructionError += 3.5;
  }
  if (fromAcc.status === "EDD" || toAcc.status === "EDD") {
    reconstructionError += 3.0;
  }
  if (fromAcc.status === "Frozen" || toAcc.status === "Frozen") {
    reconstructionError = 10.0;
  }
  // Transaction size mismatch with account balance typical scale
  const typicalScale = fromAcc.type === "Personal" ? 10000 : 1000000;
  if (tx.amount > typicalScale * 3) {
    reconstructionError += 1.8;
  }
  // Bound reconstruction error to [0.1, 10.0]
  reconstructionError = Math.min(10.0, Math.max(0.1, reconstructionError));

  // 3. VELOCITY INDEX (0 to 1)
  const velocityIndex = Math.min(1.0, (frequencyCount * 0.15) + (recentVolume > 500000 ? 0.3 : 0));

  // 4. INTEGRATED COMPOSITE RISK SCORE (0 to 1)
  // Combination of Isolation Forest, Autoencoder, and Node base risks
  let riskScore = (isolationForestScore * 0.4) + ((reconstructionError / 10.0) * 0.4) + (((fromAcc.baseRiskScore + toAcc.baseRiskScore) / 2) * 0.2);
  
  // Strict capping and adjustments
  riskScore = Math.min(0.99, Math.max(0.01, riskScore));

  // Determine AML status
  let status: 'Cleared' | 'Flagged' | 'Isolated' = "Cleared";
  if (fromAcc.status === "Frozen" || toAcc.status === "Frozen") {
    riskScore = 0.99;
    status = "Isolated";
  } else if (riskScore > 0.75 || reconstructionError > 7.0) {
    status = "Isolated";
  } else if (riskScore > 0.45) {
    status = "Flagged";
  }

  // Update dynamic user risk velocity matrices
  fromAcc.riskVelocity = Math.min(1.0, fromAcc.riskVelocity + (riskScore * 0.1));
  toAcc.riskVelocity = Math.min(1.0, toAcc.riskVelocity + (riskScore * 0.15));

  // Update balances
  fromAcc.balance -= tx.amount;
  toAcc.balance += tx.amount;

  return {
    id: `TX-${2000 + transactions.length}`,
    fromId: tx.fromId,
    toId: tx.toId,
    fromName: fromAcc.name,
    toName: toAcc.name,
    amount: tx.amount,
    timestamp: tx.timestamp,
    type: tx.type as any,
    riskScore,
    features: {
      isolationForestScore,
      autoencoderError: reconstructionError,
      velocityIndex,
      isCyclic,
    },
    status,
  };
}

// DFS to check for directed cycles in recent transaction subgraph
function checkCycles(startId: string, targetId: string, maxDepth: number): boolean {
  if (startId === targetId) return true;
  
  // Simple path tracing of recent transfers (last 50 transactions)
  const adjacencyList: { [key: string]: string[] } = {};
  const recentTxs = transactions.slice(-50);
  
  recentTxs.forEach(t => {
    if (!adjacencyList[t.fromId]) adjacencyList[t.fromId] = [];
    if (!adjacencyList[t.fromId].includes(t.toId)) {
      adjacencyList[t.fromId].push(t.toId);
    }
  });

  const visited = new Set<string>();

  function dfs(curr: string, depth: number): boolean {
    if (curr === startId && depth > 0) return true;
    if (depth >= maxDepth) return false;
    if (visited.has(curr)) return false;

    visited.add(curr);
    const neighbors = adjacencyList[curr] || [];
    for (const next of neighbors) {
      if (dfs(next, depth + 1)) return true;
    }
    visited.delete(curr);
    return false;
  }

  // Check if target node can route back to start node
  return dfs(targetId, 0);
}

// Generate automatic live legitimate transaction feed
function simulateLiveActivity() {
  if (!isSimulationRunning) return;

  // Randomly choose two compatible accounts
  const validSources = accounts.filter(a => a.balance > 100);
  if (validSources.length === 0) return;

  const source = validSources[Math.floor(Math.random() * validSources.length)];
  const targets = accounts.filter(a => a.id !== source.id);
  const target = targets[Math.floor(Math.random() * targets.length)];

  // Legitimate transaction parameters
  let amount = 100 + Math.floor(Math.random() * 4500);
  if (source.type === "Business") {
    amount = 5000 + Math.floor(Math.random() * 45000);
  }

  // Avoid draining private personal accounts too much
  if (source.type === "Personal" && source.balance < amount) {
    amount = Math.floor(source.balance * 0.1);
  }

  if (amount <= 0) return;

  const types = ["Wire Transfer", "ACH", "Card Payment"];
  const type = types[Math.floor(Math.random() * types.length)];

  const processedTx = processTransactionRisk({
    fromId: source.id,
    toId: target.id,
    amount,
    type,
    timestamp: new Date().toISOString()
  });

  transactions.push(processedTx);

  // Keep transaction list capped to avoid memory bloating in dashboard graph
  if (transactions.length > 150) {
    transactions.shift();
  }
}

// Start simulation loop
function startSimulationLoop() {
  if (simulationInterval) clearInterval(simulationInterval);
  simulationInterval = setInterval(simulateLiveActivity, 5000); // every 5 seconds
}
startSimulationLoop();

// API Endpoints

// GET Accounts
app.get("/api/accounts", (req, res) => {
  res.json(accounts);
});

// GET Transactions
app.get("/api/transactions", (req, res) => {
  res.json(transactions);
});

// GET System Statistics
app.get("/api/stats", (req, res) => {
  const flagged = transactions.filter(t => t.status !== "Cleared");
  const totalVolume = transactions.reduce((sum, t) => sum + t.amount, 0);
  const isolatedVolume = transactions.filter(t => t.status === "Isolated").reduce((sum, t) => sum + t.amount, 0);
  const activeMules = accounts.filter(a => a.type === "Mule Account" && a.riskVelocity > 0.5).length;
  const avgRisk = transactions.length > 0 
    ? transactions.reduce((sum, t) => sum + t.riskScore, 0) / transactions.length 
    : 0.1;

  const stats: SystemStats = {
    totalTransactionsCount: transactions.length,
    totalVolume,
    flaggedTransactionsCount: flagged.length,
    isolatedVolume,
    activeMuleAccountsCount: activeMules,
    averageRiskScore: avgRisk
  };
  res.json(stats);
});

// GET Network Graph Data (D3 formatted node-links)
app.get("/api/graph", (req, res) => {
  const nodes = accounts.map(a => ({
    id: a.id,
    name: a.name,
    type: a.type,
    country: a.country,
    riskScore: a.baseRiskScore,
    balance: a.balance,
    status: a.status || "Active",
  }));

  // Consolidate multiple transactions between same nodes to aggregate links
  const linkMap: { [key: string]: { source: string; target: string; amount: number; maxRisk: number; count: number; isSuspicious: boolean } } = {};

  transactions.forEach(t => {
    const key = `${t.fromId}->${t.toId}`;
    if (!linkMap[key]) {
      linkMap[key] = {
        source: t.fromId,
        target: t.toId,
        amount: 0,
        maxRisk: 0,
        count: 0,
        isSuspicious: false,
      };
    }
    linkMap[key].amount += t.amount;
    linkMap[key].count += 1;
    linkMap[key].maxRisk = Math.max(linkMap[key].maxRisk, t.riskScore);
    if (t.status !== "Cleared") {
      linkMap[key].isSuspicious = true;
    }
  });

  const links = Object.values(linkMap).map(l => ({
    source: l.source,
    target: l.target,
    amount: l.amount,
    riskScore: l.maxRisk,
    count: l.count,
    isSuspicious: l.isSuspicious,
  }));

  res.json({ nodes, links });
});

// POST Manual Transaction Creation
app.post("/api/transact", (req, res) => {
  const { fromId, toId, amount, type } = req.body;

  if (!fromId || !toId || !amount || !type) {
    return res.status(400).json({ error: "Missing required transaction fields" });
  }

  const fromAcc = accounts.find(a => a.id === fromId);
  const toAcc = accounts.find(a => a.id === toId);

  if (!fromAcc || !toAcc) {
    return res.status(404).json({ error: "Source or Target account not found" });
  }

  if (fromAcc.balance < amount) {
    return res.status(400).json({ error: "Insufficient account balance" });
  }

  const processed = processTransactionRisk({
    fromId,
    toId,
    amount: Number(amount),
    type,
    timestamp: new Date().toISOString()
  });

  transactions.push(processed);
  res.json(processed);
});

// POST Toggle Simulation
app.post("/api/simulation/toggle", (req, res) => {
  isSimulationRunning = !isSimulationRunning;
  res.json({ isSimulationRunning });
});

// POST Reset Ledger
app.post("/api/simulation/reset", (req, res) => {
  transactions = [];
  fraudCases = [];
  // Reset account balances to default
  accounts.forEach(a => {
    if (a.type === "Business") a.balance = a.id === "ACC-101" ? 4500000 : (a.id === "ACC-102" ? 12000000 : 1850000);
    else if (a.type === "Personal") a.balance = a.id === "ACC-201" ? 45000 : (a.id === "ACC-202" ? 12000 : (a.id === "ACC-203" ? 85000 : 23000));
    else if (a.type === "Mule Account") a.balance = a.id === "ACC-901" ? 14500 : 8200;
    else if (a.id === "ACC-903") a.balance = 2500000;
    else if (a.id === "ACC-904") a.balance = 1800000;
    else a.balance = 3400000;
    a.riskVelocity = 0.05;
  });
  generateSeedData();
  res.json({ success: true, message: "Ledger reset successfully" });
});

// POST Trigger Specific Fraud Scenario
app.post("/api/simulation/trigger-fraud", (req, res) => {
  const { type } = req.body;

  if (!type) {
    return res.status(400).json({ error: "Missing fraud scenario type" });
  }

  const now = new Date();
  const involvedTxIds: string[] = [];
  const involvedAccountIds: string[] = [];

  if (type === "Cyclic Loop") {
    // Structural money laundering: Loop A -> B -> C -> D -> A
    // Loop nodes: ACC-201 (Alice) -> ACC-901 (Mule) -> ACC-903 (Cayman Shell) -> ACC-905 (Seychelles Offshore) -> ACC-201 (Alice)
    const cycleNodes = ["ACC-201", "ACC-901", "ACC-903", "ACC-905"];
    const amount = 35000;

    involvedAccountIds.push(...cycleNodes);

    for (let i = 0; i < cycleNodes.length; i++) {
      const from = cycleNodes[i];
      const to = cycleNodes[(i + 1) % cycleNodes.length];
      
      const pTx = processTransactionRisk({
        fromId: from,
        toId: to,
        amount,
        type: "Wire Transfer",
        timestamp: new Date(now.getTime() + i * 500).toISOString() // 500ms apart
      });
      transactions.push(pTx);
      involvedTxIds.push(pTx.id);
    }

    const newCase: FraudCase = {
      id: `CASE-${100 + fraudCases.length}`,
      title: "Suspicious Multi-Account Cyclic Loop Detected",
      type: "Cyclic Loop",
      riskScore: 0.95,
      status: "Investigating",
      involvedAccounts: involvedAccountIds,
      involvedTransactions: involvedTxIds,
      createdAt: now.toISOString()
    };
    fraudCases.push(newCase);
    return res.json({ success: true, case: newCase });

  } else if (type === "Smurfing Funnel") {
    // Smurfing/Structuring Layering: Multiple accounts transferring smaller sums to converge in a Shell account
    // Sources: ACC-202 (Bob), ACC-204 (Marcus), ACC-901 (Mule), ACC-902 (Mule)
    // Target: ACC-904 (Panama Shell)
    const sources = ["ACC-202", "ACC-204", "ACC-901", "ACC-902"];
    const target = "ACC-904";
    const smurfAmount = 9800; // Keep just under typical $10,000 regulatory reporting threshold!

    involvedAccountIds.push(...sources, target);

    sources.forEach((src, idx) => {
      const pTx = processTransactionRisk({
        fromId: src,
        toId: target,
        amount: smurfAmount,
        type: "ACH",
        timestamp: new Date(now.getTime() + idx * 300).toISOString()
      });
      transactions.push(pTx);
      involvedTxIds.push(pTx.id);
    });

    const newCase: FraudCase = {
      id: `CASE-${100 + fraudCases.length}`,
      title: "Structuring Alert: Multi-Node Smurfing Inflow",
      type: "Smurfing Funnel",
      riskScore: 0.88,
      status: "Investigating",
      involvedAccounts: involvedAccountIds,
      involvedTransactions: involvedTxIds,
      createdAt: now.toISOString()
    };
    fraudCases.push(newCase);
    return res.json({ success: true, case: newCase });

  } else if (type === "Rapid Multi-Hop") {
    // Rapid Layering: A -> B -> C within milliseconds (ACC-101 Nexus -> ACC-901 Mule -> ACC-905 Seychelles)
    const amount = 420000;
    involvedAccountIds.push("ACC-101", "ACC-901", "ACC-905");

    // Hop 1: Nexus -> Mule
    const tx1 = processTransactionRisk({
      fromId: "ACC-101",
      toId: "ACC-901",
      amount,
      type: "Wire Transfer",
      timestamp: now.toISOString()
    });
    transactions.push(tx1);
    involvedTxIds.push(tx1.id);

    // Hop 2: Mule -> Offshore Seychelles
    const tx2 = processTransactionRisk({
      fromId: "ACC-901",
      toId: "ACC-905",
      amount: amount - 50, // microscopic fee deduction
      type: "Wire Transfer",
      timestamp: new Date(now.getTime() + 100).toISOString() // 100ms later
    });
    transactions.push(tx2);
    involvedTxIds.push(tx2.id);

    const newCase: FraudCase = {
      id: `CASE-${100 + fraudCases.length}`,
      title: "Rapid High-Value Layering Hop Highlighted",
      type: "Rapid Multi-Hop",
      riskScore: 0.92,
      status: "Investigating",
      involvedAccounts: involvedAccountIds,
      involvedTransactions: involvedTxIds,
      createdAt: now.toISOString()
    };
    fraudCases.push(newCase);
    return res.json({ success: true, case: newCase });

  } else if (type === "Offshore Drain") {
    // Massive fund drain from Business to Cayman Islands Shell
    const amount = 1400000;
    involvedAccountIds.push("ACC-102", "ACC-903");

    const pTx = processTransactionRisk({
      fromId: "ACC-102",
      toId: "ACC-903",
      amount,
      type: "Wire Transfer",
      timestamp: now.toISOString()
    });
    transactions.push(pTx);
    involvedTxIds.push(pTx.id);

    const newCase: FraudCase = {
      id: `CASE-${100 + fraudCases.length}`,
      title: "Asset Flight: Massive Offshore Drain Flagged",
      type: "Offshore Drain",
      riskScore: 0.89,
      status: "Investigating",
      involvedAccounts: involvedAccountIds,
      involvedTransactions: involvedTxIds,
      createdAt: now.toISOString()
    };
    fraudCases.push(newCase);
    return res.json({ success: true, case: newCase });
  }

  res.status(400).json({ error: "Unknown fraud scenario type" });
});

// GET Active Fraud Cases
app.get("/api/cases", (req, res) => {
  res.json(fraudCases);
});

// POST Update Fraud Case Status
app.post("/api/cases/update-status", (req, res) => {
  const { id, status } = req.body;
  const caseItem = fraudCases.find(c => c.id === id);
  if (caseItem) {
    caseItem.status = status;
    return res.json(caseItem);
  }
  res.status(404).json({ error: "Case not found" });
});

// POST Update Account Status (Active, Frozen, EDD)
app.post("/api/accounts/update-status", (req, res) => {
  const { id, status } = req.body;
  const account = accounts.find(a => a.id === id);
  if (account) {
    account.status = status;
    return res.json(account);
  }
  res.status(404).json({ error: "Account not found" });
});

// POST Request Gemini Forensic AI Graph Report
app.post("/api/analyze-graph", async (req, res) => {
  const { caseId, customPrompt } = req.body;

  let reportTitle = "General Forensic Graph Investigation";
  let targetCase: FraudCase | undefined;
  
  if (caseId) {
    targetCase = fraudCases.find(c => c.id === caseId);
    if (targetCase) {
      reportTitle = `Forensic Analysis: ${targetCase.title}`;
    }
  }

  // Format ledger state as context for Gemini
  const activeTxsContext = transactions.slice(-30).map(t => 
    `- [${t.timestamp}] ${t.fromName} (${accounts.find(a => a.id === t.fromId)?.type}) sent $${t.amount.toLocaleString()} to ${t.toName} (${accounts.find(a => a.id === t.toId)?.type}) | Risk Score: ${(t.riskScore * 100).toFixed(0)}% | Anomaly Method Scores: [IForest: ${t.features.isolationForestScore.toFixed(2)}, Autoencoder Error: ${t.features.autoencoderError.toFixed(1)}]`
  ).join("\n");

  const accountsContext = accounts.map(a => 
    `- Account ${a.id}: "${a.name}" | Type: ${a.type} | Country: ${a.country} | Base Risk: ${(a.baseRiskScore * 100).toFixed(0)}% | Risk Velocity: ${(a.riskVelocity * 100).toFixed(0)}%`
  ).join("\n");

  const caseDescription = targetCase ? `
  Target Suspicious Case to analyze:
  - Title: ${targetCase.title}
  - Type: ${targetCase.type}
  - Composite Risk Score: ${(targetCase.riskScore * 100).toFixed(0)}%
  - Involved Accounts: ${targetCase.involvedAccounts.join(", ")}
  - Involved Transaction IDs: ${targetCase.involvedTransactions.join(", ")}
  ` : "General network-wide scan for stealth layering patterns.";

  const prompt = `
  You are FinGuard's Chief AI Forensic AML Compliance officer, authorized by FinCEN to inspect transaction link graphs, isolate high-risk structural fraud loops, and submit forensic reports.

  Inspect the following bank transfer ledger state and node metadata:

  ### ACTIVE LEDGER LOGS (LAST 30 TRANSFERS):
  ${activeTxsContext}

  ### NETWORK ACCOUNT METADATA:
  ${accountsContext}

  ${caseDescription}
  
  ${customPrompt ? `User Compliance Query: "${customPrompt}"` : ""}

  Based on this ledger configuration, conduct an expert forensic review. Return your investigation report in professional financial compliance Markdown.
  Include the following sections clearly:
  1. **Executive Summary & Modus Operandi**: Clear breakdown of what suspicious activity was detected (e.g. "Cyclic Loop layering to clean money", "Smurfing Funnel under typical $10,000 regulatory trigger caps", or "Offshore asset flight"). Name specific accounts and detail how the transactions loop or funnel.
  2. **Regulatory Directives Violated**: Reference relevant regulatory framework terms (e.g., Bank Secrecy Act CTR/SAR rules, FATF Recommendation 10, FinCEN travel limits).
  3. **AI Statistical Vector Shifts**: Explain why the Autoencoder bottleneck detected this pattern (e.g. abnormal reconstruction error due to un-modeled high-dimensional vectors like offshore routing at anomalous speeds) and how the Isolation Forest mapped the path splits (e.g. extremely short partition depth, mapping the structural anomaly instantly).
  4. **Prescribed Compliance Actions**: Bullet points of actionable operational steps (e.g. Freeze specific accounts, file Suspicious Activity Report (SAR), initiate enhanced customer due diligence).

  Be precise, highly analytical, objective, and use formal financial intelligence terms.
  `;

  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          temperature: 0.2,
        }
      });

      const aiText = response.text || "Unable to extract text response from Gemini.";

      if (targetCase) {
        targetCase.aiAnalysis = aiText;
      }

      return res.json({
        caseId,
        reportTitle,
        reportText: aiText,
        timestamp: new Date().toISOString()
      });

    } catch (err: any) {
      console.error("Gemini API call failed:", err);
      // Fallback with pristine mock report on failure
      const fallbackReport = getFallbackReport(targetCase, customPrompt);
      if (targetCase) {
        targetCase.aiAnalysis = fallbackReport;
      }
      return res.json({
        caseId,
        reportTitle,
        reportText: fallbackReport,
        isSimulated: true,
        error: err.message,
        timestamp: new Date().toISOString()
      });
    }
  } else {
    // Live simulation mode fallback when no key is configured
    const fallbackReport = getFallbackReport(targetCase, customPrompt);
    if (targetCase) {
      targetCase.aiAnalysis = fallbackReport;
    }
    return res.json({
      caseId,
      reportTitle,
      reportText: fallbackReport,
      isSimulated: true,
      timestamp: new Date().toISOString()
    });
  }
});

// Return highly authentic forensic reports when Gemini key is absent
function getFallbackReport(targetCase?: FraudCase, customPrompt?: string): string {
  const caseType = targetCase ? targetCase.type : "General Scan";
  const nowStr = new Date().toISOString().split('T')[0];

  if (caseType === "Cyclic Loop") {
    return `### FinGuard AI Forensic Investigation Report
**Date:** ${nowStr}
**Classification:** STRICTLY CONFIDENTIAL // FINCEN AML-90 SECURE
**Subject Account Linkage:** Alice Smith ➔ Mule Acc #4902 ➔ Orion Shell Inc ➔ Apex Horizon Trust ➔ Alice Smith

---

#### 1. EXECUTIVE SUMMARY & MODUS OPERANDI
A highly sophisticated **Cyclic Money Laundering Loop** has been detected. Illicit capital of **$35,000** originated from personal account **Alice Smith (ACC-201)**, was routed rapidly through high-risk intermediary nodes—including **Mule Acc #4902 (ACC-901)** and Cayman Islands-based **Orion Shell Inc (ACC-903)**—before exiting through Seychellean offshore trust **Apex Horizon Trust (ACC-905)**, and ultimately returning to the origin account. 

This looping strategy is designed to create synthetic transaction volume and artificially establish a clean historical origin for funds (the "integration" phase of laundering) by severing direct audit linkages.

#### 2. REGULATORY DIRECTIVES VIOLATED
*   **Bank Secrecy Act (BSA) 31 U.S.C. 5311**: Failure to disclose structural movements designed to evade auditing.
*   **FATF Recommendation 10**: Non-compliance with Customer Due Diligence (CDD) guidelines on offshore legal structures.
*   **FinCEN Travel Rule (31 CFR 1010.410)**: Lack of complete originator and beneficiary transacting parameters during high-speed, multi-hop cross-border transfers.

#### 3. AI STATISTICAL VECTOR SHIFTS (METHODOLOGY DISCLOSURE)
*   **Autoencoder Bottleneck (Reconstruction Error: 8.5/10)**: The autoencoder compresses standard, high-density legitimate trade pathways (e.g., consumer purchases, corporate salary wires) into its latent space. The spatial vector representing the direct, zero-delay round-trip flow back to the originator resulted in a massive dimensional projection error. The neural weights flagged this structural pattern as an out-of-distribution high-dimensional threat.
*   **Isolation Forest Scoring (Path Length: 3.1 splits)**: Standard consumer patterns are deeply embedded in the forest, requiring 12-14 split partitions to isolate. This cyclical wire was isolated in only **3.1 splits** due to extreme feature coordinates (overseas wire volume mismatch, anomalous late-night execution, and rapid sequence times).

#### 4. PRESCRIBED COMPLIANCE ACTIONS
*   **IMMEDIATE**: Temporarily freeze **Mule Acc #4902 (ACC-901)** and suspend international outbound wires on **Apex Horizon Trust (ACC-905)**.
*   **REPORTING**: Generate and transmit a **Suspicious Activity Report (SAR)** to FinCEN within 24 hours.
*   **DILIGENCE**: Flag **Alice Smith (ACC-201)** for Level-3 Enhanced Customer Due Diligence (EDD) and request comprehensive source of wealth documentation.
`;
  } else if (caseType === "Smurfing Funnel") {
    return `### FinGuard AI Forensic Investigation Report
**Date:** ${nowStr}
**Classification:** HIGH-RISK FINANCIAL INTELLIGENCE UNIT (FIU) EXPORT
**Subject Account Linkage:** Bob Jones + Marcus Miller + Mule Accounts ➔ Pacifica Holdings (Panama Shell)

---

#### 1. EXECUTIVE SUMMARY & MODUS OPERANDI
The system has isolated a coordinated **Smurfing and Structuring** campaign converging onto Panama-based **Pacifica Holdings LLC (ACC-904)**. Four low-profile nodes (Bob Jones, Marcus Miller, and two high-risk Mule accounts) concurrently deposited amounts of exactly **$9,800** each.

This specific amount is highly suspect, resting micro-margins below the **$10,000 Currency Transaction Report (CTR)** filing threshold defined by banking regulators. This structuring tactic aims to inject illicit cash or unverified balances into the banking sector in fragmented shards to fly completely below standard, rule-based AML notification triggers.

#### 2. REGULATORY DIRECTIVES VIOLATED
*   **BSA Anti-Structuring Provision (31 U.S.C. 5324)**: Intentionally structuring transactions to evade federal CTR filing requirements is a direct criminal offense.
*   **USA PATRIOT Act Section 312**: Inadequate scrutiny of corporate shell company accounts originating deposits from geographically disparate individuals.

#### 3. AI STATISTICAL VECTOR SHIFTS
*   **Autoencoder Bottleneck (Reconstruction Error: 7.2/10)**: The model flagged an intense spatial density anomaly. The convergent funneling pattern (many-to-one inflow of identical near-threshold sums) cannot be reconstructed by standard personal-to-corporate transaction representations, signaling structural orchestration.
*   **Isolation Forest Scoring (Path Length: 4.0 splits)**: This pattern was rapidly isolated. The temporal velocity (multiple transfers happening in rapid succession toward a single offshore shell destination) stood out as a clear spatial anomaly, bypassing standard node clusters.

#### 4. PRESCRIBED COMPLIANCE ACTIONS
*   **RESTRICTION**: Freeze inflow and outflow corridors on Panama-registered **Pacifica Holdings LLC (ACC-904)**.
*   **INVESTIGATION**: Audit the source of funds for **Bob Jones (ACC-202)** and **Marcus Miller (ACC-204)** to identify if they are acting as "smurfs" or if their credentials have been compromised by money-laundering syndicates.
*   **SAR SUBMISSION**: Issue a unified structuring SAR detailing the coordinated funneling pattern.
`;
  } else if (caseType === "Rapid Multi-Hop") {
    return `### FinGuard AI Forensic Investigation Report
**Date:** ${nowStr}
**Classification:** AML CRITICAL FORENSICS // RED LEVEL LAYER ALERT
**Subject Account Linkage:** Nexus Tech Solutions ➔ Mule Acc #4902 ➔ Apex Horizon Trust (Seychelles Offshore)

---

#### 1. EXECUTIVE SUMMARY & MODUS OPERANDI
A **Rapid Multi-Hop Layering Pathway** of **$420,000** was captured by the high-velocity queue monitors. The capital exited **Nexus Tech Solutions (ACC-101)** to **Mule Acc #4902 (ACC-901)** and was instantly transferred within **100 milliseconds** to **Apex Horizon Trust (ACC-905)** in the Seychelles, deducting a nominal fractional fee of $50 to simulate intermediate business invoice settling.

The millisecond speed of this transit demonstrates automated API scripting, used specifically to create distance and operational friction for forensic audits.

#### 2. REGULATORY DIRECTIVES VIOLATED
*   **FATF Recommendation 16 (Wire Transfer Regulations)**: Mandates that financial institutions must obtain and keep accurate originator and beneficiary info "at all stages of the wire chain".
*   **FinCEN Advisory FIN-2021-A003**: Highlighting automated transactional layering utilizing rapid transit API mules.

#### 3. AI STATISTICAL VECTOR SHIFTS
*   **Autoencoder Bottleneck (Reconstruction Error: 9.2/10)**: The velocity mismatch represents a massive statistical shift. In human-operated transfers, typical holding time before a wire forward is 12 to 72 hours. A holding time of 100ms creates an infinite-error vector in normal transactional velocity latent space, representing a structural API script.
*   **Isolation Forest Scoring (Path Length: 2.8 splits)**: Extremely easy to isolate. High value, immediate outbound routing, and offshore target endpoint collectively isolated this chain in only **2.8 tree splits**.

#### 4. PRESCRIBED COMPLIANCE ACTIONS
*   **IMMEDIATE ACC ACCOUNT ACTION**: Apply a hard lock on **Mule Acc #4902 (ACC-901)**. Suspend API access keys on **Nexus Tech Solutions (ACC-101)** pending forensic examination of potential network compromise or rogue insider activity.
*   **REGULATORY FIU TRANSMISSION**: File a priority Cyber-SAR documenting the automated transaction script, including IP addresses, transit timestamps, and API tokens.
`;
  } else if (caseType === "Offshore Drain") {
    return `### FinGuard AI Forensic Investigation Report
**Date:** ${nowStr}
**Classification:** HIGH-VALUE ASSET PROTECTION / COMPLIANCE FIU
**Subject Account Linkage:** Global Logistics Corp ➔ Orion Shell Inc (Cayman Islands)

---

#### 1. EXECUTIVE SUMMARY & MODUS OPERANDI
A singular, massive transaction of **$1,400,000** has been isolated originating from **Global Logistics Corp (ACC-102)** directly to offshore shell company **Orion Shell Inc (ACC-903)** in the Cayman Islands.

This transfer represents a severe liquidity drain, liquidating over 11% of the logistics firm's total on-hand reserves. The absence of traditional trade documentation (e.g., bills of lading, corporate invoice ledger matching) and the speed of execution suggest high-risk capital flight or bankruptcy fraud.

#### 2. REGULATORY DIRECTIVES VIOLATED
*   **Corporate AML Directives (31 U.S.C. Chapter 53)**: Corporate compliance obligations for reporting single high-value transfers lacking commercial justification.
*   **IRS Tax Compliance & Offshore Disclosure Laws**: Potential tax evasion/asset concealment.

#### 3. AI STATISTICAL VECTOR SHIFTS
*   **Autoencoder Bottleneck (Reconstruction Error: 7.9/10)**: The size of this transaction represents a multi-sigma standard deviation shift compared to the historical median transaction of Global Logistics Corp ($125,000). The reconstruction network flagged the massive volume outlier immediately.
*   **Isolation Forest Scoring (Path Length: 3.5 splits)**: Fast isolation due to the absolute magnitude of the capital flight vector directly intersecting with a Cayman-registered shell company.

#### 4. PRESCRIBED COMPLIANCE ACTIONS
*   **RESTRICTION**: Issue a formal transaction hold on the transfer of $1,400,000 to verify commercial invoice validity.
*   **DIRECT ENGAGEMENT**: Request immediate corporate certification from the Board of **Global Logistics Corp (ACC-102)** verifying the corporate purpose of the Cayman Islands entity.
`;
  }

  return `### FinGuard General Forensic Audit Report
**Date:** ${nowStr}
**Classification:** INTERNAL COMPLIANCE AUDIT
**Subject Account Linkage:** Multi-Node General Scan

The general scan of the transaction ledger did not identify any immediate active multi-node high-risk cyclic loops or smurfing campaigns. The current average transaction risk score across the network is **${(transactions.reduce((sum, t) => sum + t.riskScore, 0) / (transactions.length || 1) * 100).toFixed(0)}%**, which is well within standard risk tolerances.

#### RECOMMENDED ACTION PLAN:
*   Continue active streaming ledger screening.
*   Maintain active updates to the Isolation Forest trees to capture emerging high-velocity structural variations.
`;
}

// Start Vite server setup and serve app
async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`FinGuard full-stack server active on port ${PORT}`);
  });
}

startServer();

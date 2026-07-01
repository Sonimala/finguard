import React, { useEffect, useState, useMemo } from "react";
import {
  Shield,
  Activity,
  AlertTriangle,
  RefreshCw,
  Play,
  Pause,
  PlusCircle,
  TrendingUp,
  Globe,
  DollarSign,
  FileText,
  Search,
  ArrowRight,
  Database,
  Eye,
  Info,
  Server,
  Fingerprint,
  Zap,
  CheckCircle,
  HelpCircle,
  Check
} from "lucide-react";
import { Account, Transaction, FraudCase, SystemStats } from "./types";
import NetworkGraph from "./components/NetworkGraph";

export default function App() {
  // State variables
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [graphData, setGraphData] = useState<{ nodes: any[]; links: any[] }>({ nodes: [], links: [] });
  const [fraudCases, setFraudCases] = useState<FraudCase[]>([]);
  const [stats, setStats] = useState<SystemStats>({
    totalTransactionsCount: 0,
    totalVolume: 0,
    flaggedTransactionsCount: 0,
    isolatedVolume: 0,
    activeMuleAccountsCount: 0,
    averageRiskScore: 0.1,
  });

  const [isSimulationRunning, setIsSimulationRunning] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedLinkId, setSelectedLinkId] = useState<{ source: string; target: string } | null>(null);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  
  // Custom manual transaction form state
  const [manualFrom, setManualFrom] = useState("");
  const [manualTo, setManualTo] = useState("");
  const [manualAmount, setManualAmount] = useState("");
  const [manualType, setManualType] = useState("Wire Transfer");
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState(false);

  // Investigation room state
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [activeReport, setActiveReport] = useState<{
    reportTitle: string;
    reportText: string;
    isSimulated?: boolean;
    timestamp?: string;
  } | null>(null);

  const [rightPanelTab, setRightPanelTab] = useState<'tx' | 'account'>('tx');
  const [copied, setCopied] = useState(false);

  // Path Tracing State
  const [traceSourceId, setTraceSourceId] = useState("ACC-901");
  const [traceTargetId, setTraceTargetId] = useState("ACC-101");

  // Dynamic Multi-Hop Path-Finding Logic
  const foundTracePaths = useMemo(() => {
    if (!traceSourceId || !traceTargetId || traceSourceId === traceTargetId) return [];
    
    interface TracePath {
      nodes: Account[];
      transactions: Transaction[];
      cumulativeAmount: number;
      averageRisk: number;
    }
    
    const paths: TracePath[] = [];
    const visited = new Set<string>();

    const dfs = (
      currentId: string, 
      currentPathNodes: Account[], 
      currentPathTxs: Transaction[]
    ) => {
      if (currentPathNodes.length > 4) return; // Limit depth to 4 hops

      if (currentId === traceTargetId) {
        const totalAmount = currentPathTxs.reduce((sum, val) => sum + val.amount, 0);
        const avgRisk = currentPathNodes.reduce((sum, val) => sum + val.baseRiskScore, 0) / currentPathNodes.length;

        paths.push({
          nodes: [...currentPathNodes],
          transactions: [...currentPathTxs],
          cumulativeAmount: totalAmount,
          averageRisk: avgRisk
        });
        return;
      }

      visited.add(currentId);

      const outgoingTxs = transactions.filter(t => t.fromId === currentId);
      
      const targetMap = new Map<string, Transaction>();
      outgoingTxs.forEach(tx => {
        if (!targetMap.has(tx.toId) || new Date(tx.timestamp).getTime() > new Date(targetMap.get(tx.toId)!.timestamp).getTime()) {
          targetMap.set(tx.toId, tx);
        }
      });

      for (const [nextId, latestTx] of targetMap.entries()) {
        if (!visited.has(nextId)) {
          const nextNode = accounts.find(a => a.id === nextId);
          if (nextNode) {
            dfs(nextId, [...currentPathNodes, nextNode], [...currentPathTxs, latestTx]);
          }
        }
      }

      visited.delete(currentId);
    };

    const startNode = accounts.find(a => a.id === traceSourceId);
    if (startNode) {
      dfs(traceSourceId, [startNode], []);
    }

    return paths.sort((a, b) => b.averageRisk - a.averageRisk);
  }, [traceSourceId, traceTargetId, transactions, accounts]);

  // Poll intervals
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000); // refresh every 3s
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [accountsRes, txsRes, statsRes, graphRes, casesRes] = await Promise.all([
        fetch("/api/accounts"),
        fetch("/api/transactions"),
        fetch("/api/stats"),
        fetch("/api/graph"),
        fetch("/api/cases"),
      ]);

      const accountsData = await accountsRes.json();
      const txsData = await txsRes.json();
      const statsData = await statsRes.json();
      const graphData = await graphRes.json();
      const casesData = await casesRes.json();

      setAccounts(accountsData);
      
      // Sort transactions descending by timestamp (latest first)
      const sortedTxs = [...txsData].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      setTransactions(sortedTxs);
      
      setStats(statsData);
      setGraphData(graphData);
      setFraudCases(casesData);

      // Auto-select latest transaction if none selected
      if (sortedTxs.length > 0 && !selectedTxId) {
        setSelectedTxId(sortedTxs[0].id);
      }
    } catch (err) {
      console.error("Error polling backend services:", err);
    }
  };

  const handleToggleSimulation = async () => {
    try {
      const res = await fetch("/api/simulation/toggle", { method: "POST" });
      const data = await res.json();
      setIsSimulationRunning(data.isSimulationRunning);
    } catch (err) {
      console.error(err);
    }
  };

  const handleResetLedger = async () => {
    if (!window.confirm("Are you sure you want to completely clear and reset the transaction ledger?")) return;
    try {
      const res = await fetch("/api/simulation/reset", { method: "POST" });
      await res.json();
      setSelectedNodeId(null);
      setSelectedLinkId(null);
      setSelectedTxId(null);
      setActiveReport(null);
      setSelectedCaseId(null);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleTriggerScenario = async (type: string) => {
    try {
      setIsAnalyzing(true);
      const res = await fetch("/api/simulation/trigger-fraud", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      fetchData();
      
      if (data.success && data.case) {
        setSelectedCaseId(data.case.id);
        // Automatically request AI report for this newly triggered case
        await handleRequestAIReport(data.case.id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleRequestAIReport = async (caseId: string | null = null, query: string = "") => {
    setIsAnalyzing(true);
    try {
      const res = await fetch("/api/analyze-graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId,
          customPrompt: query,
        }),
      });
      const report = await res.json();
      setActiveReport({
        reportTitle: report.reportTitle,
        reportText: report.reportText,
        isSimulated: report.isSimulated,
        timestamp: report.timestamp,
      });
    } catch (err) {
      console.error("Failed to generate compliance report:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleManualTransact = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess(false);

    if (!manualFrom || !manualTo || !manualAmount) {
      setFormError("All transaction parameters are required.");
      return;
    }

    if (manualFrom === manualTo) {
      setFormError("Origin and target accounts cannot be identical.");
      return;
    }

    const amountNum = parseFloat(manualAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setFormError("Amount must be a positive number.");
      return;
    }

    const srcAcc = accounts.find((a) => a.id === manualFrom);
    if (srcAcc && srcAcc.balance < amountNum) {
      setFormError(`Insufficient funds in source account. (Current balance: $${srcAcc.balance.toLocaleString()})`);
      return;
    }

    try {
      const res = await fetch("/api/transact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromId: manualFrom,
          toId: manualTo,
          amount: amountNum,
          type: manualType,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        setFormError(errData.error || "Transaction routing failed.");
        return;
      }

      const tx = await res.json();
      setManualAmount("");
      setFormSuccess(true);
      setSelectedTxId(tx.id);
      fetchData();
      
      // Clear success indicator after 3 seconds
      setTimeout(() => setFormSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      setFormError("Server error executing transfer.");
    }
  };

  const handleSelectLink = (source: string, target: string) => {
    setSelectedLinkId({ source, target });
    setSelectedNodeId(null);
    setRightPanelTab('tx');
    // Find latest transaction representing this connection link
    const linkTx = transactions.find((t) => t.fromId === source && t.toId === target);
    if (linkTx) {
      setSelectedTxId(linkTx.id);
    }
  };

  const handleUpdateAccountStatus = async (accountId: string, newStatus: 'Active' | 'Frozen' | 'EDD') => {
    try {
      const res = await fetch('/api/accounts/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: accountId, status: newStatus }),
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error("Error updating account status:", err);
    }
  };

  // Select focused account
  const focusedAccount = selectedNodeId
    ? accounts.find((a) => a.id === selectedNodeId)
    : null;

  // Selected focused transaction details
  const focusedTx = selectedTxId
    ? transactions.find((t) => t.id === selectedTxId)
    : null;

  // Custom Markdown parser helper to render beautiful HTML elements
  const renderForensicReport = (text: string) => {
    if (!text) return null;

    return text.split("\n").map((line, idx) => {
      // Headers
      if (line.startsWith("### ")) {
        return (
          <h4 key={idx} className="text-sm font-bold tracking-wider text-slate-100 mt-5 mb-2.5 uppercase border-b border-slate-900 pb-1 flex items-center gap-1.5 font-sans">
            <Fingerprint className="w-4 h-4 text-rose-500" />
            {line.substring(4)}
          </h4>
        );
      }
      if (line.startsWith("#### ")) {
        return (
          <h5 key={idx} className="text-xs font-bold tracking-wide text-rose-400 mt-4 mb-2 uppercase font-mono">
            {line.substring(5)}
          </h5>
        );
      }
      if (line.startsWith("**") && line.endsWith("**")) {
        return (
          <p key={idx} className="text-xs font-semibold text-slate-200 mt-2 font-mono">
            {line.replace(/\*\*/g, "")}
          </p>
        );
      }

      // Bullet points
      if (line.startsWith("* ") || line.startsWith("- ")) {
        const content = line.substring(2);
        // Highlight critical terms inside bullets
        return (
          <li key={idx} className="text-xs text-slate-300 ml-4 list-disc mb-1.5 leading-relaxed font-sans">
            {formatBoldKeywords(content)}
          </li>
        );
      }

      // Horizontal lines
      if (line.trim() === "---") {
        return <hr key={idx} className="border-slate-900 my-4" />;
      }

      // Normal text
      if (line.trim() === "") return <div key={idx} className="h-2"></div>;

      return (
        <p key={idx} className="text-xs text-slate-300 mb-2 leading-relaxed font-sans">
          {formatBoldKeywords(line)}
        </p>
      );
    });
  };

  // Highlight bold sections inside custom markdown parser
  const formatBoldKeywords = (text: string) => {
    const parts = text.split(/\*\*(.*?)\*\*/g);
    return parts.map((part, i) => {
      if (i % 2 === 1) {
        return (
          <strong key={i} className="text-slate-100 font-semibold bg-slate-900 px-1 py-0.5 rounded border border-slate-800">
            {part}
          </strong>
        );
      }
      return part;
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans flex flex-col selection:bg-rose-500 selection:text-white">
      
      {/* HEADER SECTION */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-rose-950/50 p-2.5 rounded-xl border border-rose-800/40 shadow-[0_0_15px_rgba(239,68,68,0.15)] animate-pulse">
            <Shield className="w-7 h-7 text-rose-500" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white font-sans flex items-center gap-2">
              FinGuard
              <span className="text-[10px] font-mono font-medium bg-slate-900 text-slate-400 border border-slate-800 px-2 py-0.5 rounded uppercase tracking-widest">
                Real-Time AML Graph
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5 font-sans">
              Cybercriminal multi-account looping & structured anomaly isolation console
            </p>
          </div>
        </div>

        {/* Real-Time Telemetry Margin */}
        <div className="flex items-center flex-wrap gap-3.5 text-xs">
          <div className="flex items-center gap-1.5 bg-slate-900/60 border border-slate-800 px-2.5 py-1.5 rounded-lg">
            <Server className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-slate-400 font-mono">NODE_CLUSTER:</span>
            <span className="text-blue-400 font-mono font-bold">STABLE</span>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-900/60 border border-slate-800 px-2.5 py-1.5 rounded-lg">
            <Activity className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-slate-400 font-mono">STREAMING:</span>
            <span className={`${isSimulationRunning ? "text-emerald-500" : "text-amber-500"} font-mono font-bold uppercase`}>
              {isSimulationRunning ? "ACTIVE" : "PAUSED"}
            </span>
          </div>

          <button
            onClick={handleToggleSimulation}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-medium text-xs transition-all ${
              isSimulationRunning
                ? "bg-amber-950/20 text-amber-400 border-amber-900/50 hover:bg-amber-950/40"
                : "bg-emerald-950/20 text-emerald-400 border-emerald-900/50 hover:bg-emerald-950/40"
            }`}
          >
            {isSimulationRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {isSimulationRunning ? "Pause Feed" : "Start Feed"}
          </button>

          <button
            onClick={handleResetLedger}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 px-3 py-1.5 rounded-lg transition-all text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reset Ledger
          </button>
        </div>
      </header>

      {/* COMPLIANCE KEY METRICS (STATS ROW) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 px-6 pt-5">
        
        {/* Metric 1 */}
        <div className="bg-slate-900/30 border border-slate-900 p-4 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 block">Total Ledger Swipes</span>
            <span className="text-2xl font-bold font-mono text-white mt-1 block">
              {stats.totalTransactionsCount}
            </span>
            <span className="text-[10px] text-emerald-500 mt-1 flex items-center gap-1 font-sans">
              <TrendingUp className="w-3 h-3" /> Live throughput online
            </span>
          </div>
          <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800/80">
            <Database className="w-5 h-5 text-slate-400" />
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-slate-900/30 border border-slate-900 p-4 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 block">Identified Structuring</span>
            <span className="text-2xl font-bold font-mono text-amber-500 mt-1 block">
              {stats.flaggedTransactionsCount} <span className="text-xs text-slate-500 font-normal">items</span>
            </span>
            <span className="text-[10px] text-amber-500 mt-1 flex items-center gap-1 font-sans">
              <AlertTriangle className="w-3 h-3" /> Risk anomalies isolated
            </span>
          </div>
          <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800/80">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-slate-900/30 border border-slate-900 p-4 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 block">Isolated Capital Flight</span>
            <span className="text-2xl font-bold font-mono text-rose-500 mt-1 block">
              ${stats.isolatedVolume.toLocaleString()}
            </span>
            <span className="text-[10px] text-rose-400 mt-1 flex items-center gap-1 font-sans">
              <Zap className="w-3 h-3 animate-pulse" /> Hard-lock quarantine active
            </span>
          </div>
          <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800/80">
            <DollarSign className="w-5 h-5 text-rose-500" />
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-slate-900/30 border border-slate-900 p-4 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 block">Weighted Threat Ratio</span>
            <span className="text-2xl font-bold font-mono text-white mt-1 block">
              {(stats.averageRiskScore * 100).toFixed(1)}%
            </span>
            <div className="w-24 bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-amber-500 to-rose-500 h-1.5 rounded-full transition-all duration-500" 
                style={{ width: `${stats.averageRiskScore * 100}%` }}
              ></div>
            </div>
          </div>
          <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800/80">
            <Fingerprint className="w-5 h-5 text-slate-400" />
          </div>
        </div>

      </section>

      {/* MAIN APPLICATION GRID (2 COLUMNS: LEFT GRAPH, RIGHT DETAILS) */}
      <main className="grid grid-cols-1 lg:grid-cols-12 gap-5 px-6 py-5 flex-1 items-start">
        
        {/* COLUMN LEFT: INTERACTIVE NETWORK LINK GRAPH & CONTROLS (8 COLS) */}
        <section className="lg:col-span-7 xl:col-span-8 flex flex-col gap-4">
          
          {/* Card Header */}
          <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-900 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2 font-sans">
                  <Globe className="w-4.5 h-4.5 text-blue-400" />
                  Streaming Inter-Account Ledger Topology
                </h3>
                <p className="text-xs text-slate-400 font-sans mt-0.5">
                  High-velocity ledger link paths generated dynamically by transacting identities
                </p>
              </div>

              {/* Reset selections */}
              {(selectedNodeId || selectedLinkId) && (
                <button
                  onClick={() => {
                    setSelectedNodeId(null);
                    setSelectedLinkId(null);
                  }}
                  className="text-xs text-blue-400 hover:text-blue-300 font-medium font-sans flex items-center gap-1 self-start"
                >
                  Clear Selection Filter
                </button>
              )}
            </div>

            {/* D3 canvas component */}
            <div className="h-[450px] w-full">
              <NetworkGraph
                graphData={graphData}
                selectedNodeId={selectedNodeId}
                onSelectNode={(nodeId) => {
                  setSelectedNodeId(nodeId);
                  setSelectedLinkId(null);
                  if (nodeId) setRightPanelTab('account');
                }}
                selectedLinkId={selectedLinkId}
                onSelectLink={handleSelectLink}
              />
            </div>
          </div>

          {/* SIMULATION & CYBER ATTACK INJECTOR CONTROL ROOM */}
          <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col gap-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2 font-mono">
              <Zap className="w-4 h-4 text-rose-500" />
              Forensic Simulation Injector Room
            </h3>
            <p className="text-xs text-slate-400 -mt-1">
              Select and trigger pre-compiled financial crime structural loops to test spatial compliance models:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              
              {/* Trigger 1: Cyclic Loop */}
              <button
                onClick={() => handleTriggerScenario("Cyclic Loop")}
                disabled={isAnalyzing}
                className="flex flex-col items-start text-left p-3 rounded-lg border border-rose-900/30 bg-rose-950/5 hover:bg-rose-950/15 hover:border-rose-800/60 transition-all disabled:opacity-50"
              >
                <span className="text-xs font-bold text-rose-400 font-sans">1. Cyclic Loop</span>
                <span className="text-[10px] text-slate-400 mt-1 leading-snug">
                  A ➔ B ➔ C ➔ D ➔ A circular flow to integrate and wash capital origin.
                </span>
              </button>

              {/* Trigger 2: Smurfing Funnel */}
              <button
                onClick={() => handleTriggerScenario("Smurfing Funnel")}
                disabled={isAnalyzing}
                className="flex flex-col items-start text-left p-3 rounded-lg border border-amber-900/30 bg-amber-950/5 hover:bg-amber-950/15 hover:border-amber-800/60 transition-all disabled:opacity-50"
              >
                <span className="text-xs font-bold text-amber-400 font-sans">2. Smurfing Funnel</span>
                <span className="text-[10px] text-slate-400 mt-1 leading-snug">
                  Multiple distinct transfers kept structured micro-margins below the $10K limit.
                </span>
              </button>

              {/* Trigger 3: Rapid Multi-Hop */}
              <button
                onClick={() => handleTriggerScenario("Rapid Multi-Hop")}
                disabled={isAnalyzing}
                className="flex flex-col items-start text-left p-3 rounded-lg border border-blue-900/30 bg-blue-950/5 hover:bg-blue-950/15 hover:border-blue-800/60 transition-all disabled:opacity-50"
              >
                <span className="text-xs font-bold text-blue-400 font-sans">3. Rapid Multi-Hop</span>
                <span className="text-[10px] text-slate-400 mt-1 leading-snug">
                  API-driven routing forwarding cash overseas within millisecond ranges.
                </span>
              </button>

              {/* Trigger 4: Offshore Flight */}
              <button
                onClick={() => handleTriggerScenario("Offshore Drain")}
                disabled={isAnalyzing}
                className="flex flex-col items-start text-left p-3 rounded-lg border border-purple-900/30 bg-purple-950/5 hover:bg-purple-950/15 hover:border-purple-800/60 transition-all disabled:opacity-50"
              >
                <span className="text-xs font-bold text-purple-400 font-sans">4. Offshore Drain</span>
                <span className="text-[10px] text-slate-400 mt-1 leading-snug">
                  Unilateral capital flight draining commercial cash assets to shell entities.
                </span>
              </button>

            </div>
          </div>

          {/* AUTOMATED MULTI-HOP PATH-TRACE & ASSET TRACKING ENGINE */}
          <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-900 pb-2">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5 font-sans">
                  <Globe className="w-4.5 h-4.5 text-rose-500 animate-spin-slow" />
                  Automated Multi-Hop Path-Trace & Asset Tracking
                </h3>
                <p className="text-[11px] text-slate-400 font-sans mt-0.5">
                  Analyze dynamic multi-hop ledger sequences, capital leakages, and intermediate mule chains between sovereign entities
                </p>
              </div>
            </div>

            {/* Target Selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-slate-900/10 p-3 rounded-lg border border-slate-900">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-mono uppercase text-slate-500">Source Entity (Origin of Funds)</label>
                <select
                  value={traceSourceId}
                  onChange={(e) => setTraceSourceId(e.target.value)}
                  className="bg-slate-950 border border-slate-850 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-rose-500 focus:border-rose-500 transition-colors"
                >
                  {accounts.map(a => (
                    <option key={a.id} value={a.id} className="bg-slate-950 text-slate-300">
                      {a.status === "Frozen" ? "❄️ [FROZEN] " : a.status === "EDD" ? "⚠️ [EDD] " : "🟢 [ACTIVE] "}
                      {a.name} ({a.id})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-mono uppercase text-slate-500">Target Entity (Destination Sink)</label>
                <select
                  value={traceTargetId}
                  onChange={(e) => setTraceTargetId(e.target.value)}
                  className="bg-slate-950 border border-slate-850 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-rose-500 focus:border-rose-500 transition-colors"
                >
                  {accounts.map(a => (
                    <option key={a.id} value={a.id} className="bg-slate-950 text-slate-300">
                      {a.status === "Frozen" ? "❄️ [FROZEN] " : a.status === "EDD" ? "⚠️ [EDD] " : "🟢 [ACTIVE] "}
                      {a.name} ({a.id})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
              <span className="font-mono text-slate-500 uppercase">Target Presets:</span>
              <button
                onClick={() => { setTraceSourceId("ACC-901"); setTraceTargetId("ACC-101"); }}
                className="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-slate-300 transition-all font-mono text-[9px]"
              >
                ACC-901 (Mule) ➔ ACC-101 (Nexus Tech)
              </button>
              <button
                onClick={() => { setTraceSourceId("ACC-905"); setTraceTargetId("ACC-201"); }}
                className="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-slate-300 transition-all font-mono text-[9px]"
              >
                ACC-905 (Seychelles) ➔ ACC-201 (Alice)
              </button>
              <button
                onClick={() => { setTraceSourceId("ACC-903"); setTraceTargetId("ACC-102"); }}
                className="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-slate-300 transition-all font-mono text-[9px]"
              >
                ACC-903 (Orion Shell) ➔ ACC-102 (Global Log)
              </button>
            </div>

            {/* Trace Output Stream */}
            <div className="border-t border-slate-900 pt-3">
              {traceSourceId === traceTargetId ? (
                <div className="flex items-center gap-2 bg-slate-900/30 border border-slate-900 p-4 rounded-lg text-xs text-slate-400 font-sans">
                  <Info className="w-4 h-4 text-slate-500 shrink-0" />
                  <span>Source and Target entities are identical. Choose different nodes to reconstruct potential multi-hop transfer channels.</span>
                </div>
              ) : foundTracePaths.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center p-6 bg-slate-900/20 border border-dashed border-slate-900 rounded-lg text-slate-500">
                  <Activity className="w-7 h-7 text-slate-700 mb-2 animate-pulse" />
                  <span className="text-xs font-sans">No routing connections discovered</span>
                  <span className="text-[10px] text-slate-600 mt-1">There are no transfer paths matching these parameters in the active ledger records. Try starting a different flow scenario or inject manual transfers.</span>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between text-xs font-mono text-slate-400 border-b border-slate-900/60 pb-1.5">
                    <span>Identified Transfer Sequences ({foundTracePaths.length} discovered)</span>
                    <span className="text-[10px] text-slate-500 uppercase">Sorted by Chain Risk Profile</span>
                  </div>

                  <div className="flex flex-col gap-3 max-h-[280px] overflow-y-auto pr-1">
                    {foundTracePaths.map((path, idx) => {
                      const isHighRisk = path.averageRisk > 0.55;
                      const isMedRisk = path.averageRisk > 0.3 && !isHighRisk;
                      
                      const severityColor = isHighRisk 
                        ? "border-rose-950 bg-rose-950/5 hover:bg-rose-950/10" 
                        : isMedRisk 
                          ? "border-amber-950 bg-amber-950/5 hover:bg-amber-950/10" 
                          : "border-slate-900 bg-slate-900/25 hover:bg-slate-900/40";
                          
                      const severityBadge = isHighRisk 
                        ? "text-rose-400 bg-rose-950/50 border-rose-900/60" 
                        : isMedRisk 
                          ? "text-amber-400 bg-amber-950/50 border-amber-900/60" 
                          : "text-emerald-400 bg-emerald-950/40 border-emerald-900/40";

                      const severityText = isHighRisk ? "🔴 HIGH RISK LOOP" : isMedRisk ? "🟡 SUSPICIOUS CHAIN" : "🟢 CLEARED ROUTE";

                      return (
                        <div key={idx} className={`p-3 rounded-lg border flex flex-col gap-3 transition-all duration-200 ${severityColor}`}>
                          
                          {/* Route Info Stats */}
                          <div className="flex items-center justify-between text-[10px] font-mono">
                            <span className="font-bold text-slate-300 flex items-center gap-1">
                              Route #{idx + 1} <span className="font-normal text-slate-500">• {path.nodes.length - 1} Hops</span>
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400 font-normal">Sovereign Aggregate Flow:</span>
                              <span className="text-white font-bold">${path.cumulativeAmount.toLocaleString()}</span>
                              <span className={`px-1.5 py-0.5 rounded border text-[8px] font-bold ${severityBadge}`}>
                                {severityText}
                              </span>
                            </div>
                          </div>

                          {/* Graphical Flow representation */}
                          <div className="flex items-center flex-wrap gap-2 py-2 px-2.5 bg-slate-950/60 border border-slate-900 rounded-md">
                            {path.nodes.map((node, nIdx) => {
                              const isFirst = nIdx === 0;
                              
                              // Check styles for node
                              let nodeBorder = "border-slate-800";
                              let nodeBg = "bg-slate-900/40";
                              let nodeText = "text-slate-300";
                              
                              if (node.status === "Frozen") {
                                nodeBorder = "border-sky-800 shadow-[0_0_8px_rgba(56,189,248,0.15)]";
                                nodeBg = "bg-sky-950/30";
                                nodeText = "text-sky-400";
                              } else if (node.status === "EDD") {
                                nodeBorder = "border-amber-800/80 shadow-[0_0_8px_rgba(245,158,11,0.15)]";
                                nodeBg = "bg-amber-950/30";
                                nodeText = "text-amber-400";
                              } else if (node.baseRiskScore > 0.6) {
                                nodeBorder = "border-rose-900/60 shadow-[0_0_8px_rgba(239,68,68,0.15)]";
                                nodeBg = "bg-rose-950/15";
                                nodeText = "text-rose-400";
                              }

                              const stepTx = path.transactions[nIdx - 1];

                              return (
                                <React.Fragment key={node.id}>
                                  {!isFirst && stepTx && (
                                    <div className="flex flex-col items-center justify-center font-mono text-[9px] text-slate-500 shrink-0 select-none">
                                      <ArrowRight className="w-3.5 h-3.5 text-slate-600 animate-pulse" />
                                      <span className="text-slate-300 font-bold" title={`Transaction ID: ${stepTx.id}`}>
                                        ${stepTx.amount.toLocaleString()}
                                      </span>
                                    </div>
                                  )}

                                  <div
                                    onClick={() => {
                                      setSelectedNodeId(node.id);
                                      setSelectedLinkId(null);
                                      setRightPanelTab('account');
                                    }}
                                    className={`px-2 py-1 rounded-md border text-[10px] flex items-center gap-1.5 cursor-pointer hover:bg-slate-800 hover:border-slate-700 transition-all shrink-0 ${nodeBorder} ${nodeBg} ${nodeText}`}
                                  >
                                    <span className="text-[11px]">
                                      {node.status === "Frozen" ? "❄️" : node.status === "EDD" ? "⚠️" : node.type === "Business" ? "🏢" : "👤"}
                                    </span>
                                    <div className="flex flex-col text-left">
                                      <span className="font-bold leading-none">{node.name}</span>
                                      <span className="text-[8px] font-mono text-slate-500 leading-none mt-0.5">{node.id}</span>
                                    </div>
                                  </div>
                                </React.Fragment>
                              );
                            })}
                          </div>

                          {/* CTA Audit Action */}
                          <div className="flex justify-end pt-1">
                            <button
                              onClick={() => {
                                const promptMessage = `Trace Audit Report request for multi-hop sequence from funds origin point ${path.nodes[0].name} (${path.nodes[0].id}) to destination sink ${path.nodes[path.nodes.length - 1].name} (${path.nodes[path.nodes.length - 1].id}) across a multi-stage ${path.nodes.length - 1} hop network path. Detailed chain risk is ${path.averageRisk > 0.6 ? "CRITICAL OUTLIER RISK (Average Risk Index: " + (path.averageRisk * 100).toFixed(0) + "%)" : "SUSPICIOUS VECTOR DEVIATION"}. Identify intermediate shells, smurfing structures, analyze reconstruction anomalies, and formulate final freezing orders.`;
                                setCustomPrompt(promptMessage);
                                setSelectedCaseId(null);
                                const forensicOffice = document.getElementById("ai-forensic-office");
                                if (forensicOffice) {
                                  forensicOffice.scrollIntoView({ behavior: "smooth" });
                                }
                              }}
                              className="px-3 py-1.5 bg-rose-950/50 hover:bg-rose-900/60 text-rose-400 border border-rose-900/50 hover:border-rose-800 rounded text-[10px] font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                            >
                              🧠 Send Route to AI Agent for SAR Briefing
                            </button>
                          </div>

                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* STREAMING AML LEDGER FEED CONTAINER */}
          <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-900 pb-2.5">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5 font-sans">
                  <Activity className="w-4.5 h-4.5 text-rose-500" />
                  Streaming AML Ledger Feed
                </h3>
                <p className="text-[11px] text-slate-400 font-sans">
                  Showing active transfers processed through Isolation Forest tree depth screenings
                </p>
              </div>

              <span className="text-[10px] font-mono text-slate-400">
                CAP: 150 EVENTS LIMIT
              </span>
            </div>

            {/* Ledger Tables */}
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-900 text-[10px] font-mono text-slate-400 uppercase">
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-2">Origin ➔ Target</th>
                    <th className="py-2.5 px-2 text-right">Volume</th>
                    <th className="py-2.5 px-2 text-center">Autoencoder Error</th>
                    <th className="py-2.5 px-2 text-center">I-Forest Score</th>
                    <th className="py-2.5 px-3 text-right">Risk Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900 font-mono text-xs">
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500 font-sans">
                        No transactions found in ledger database. Inject transfers to activate.
                      </td>
                    </tr>
                  ) : (
                    transactions.map((tx) => {
                      const isSelected = selectedTxId === tx.id;
                      const fromNode = accounts.find((a) => a.id === tx.fromId);
                      const toNode = accounts.find((a) => a.id === tx.toId);
                      
                      let statusBadge = (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950/50 text-emerald-400 border border-emerald-900/40">
                          CLEARED
                        </span>
                      );
                      if (tx.status === "Isolated") {
                        statusBadge = (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950/50 text-rose-400 border border-rose-900/40 animate-pulse">
                            ISOLATED
                          </span>
                        );
                      } else if (tx.status === "Flagged") {
                        statusBadge = (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/50 text-amber-400 border border-amber-900/40">
                            FLAGGED
                          </span>
                        );
                      }

                      return (
                        <tr
                          key={tx.id}
                          onClick={() => {
                            setSelectedTxId(tx.id);
                            setSelectedLinkId(null);
                            setSelectedNodeId(null);
                          }}
                          className={`hover:bg-slate-900/40 transition-all cursor-pointer ${
                            isSelected ? "bg-slate-900 border-l-2 border-l-blue-500" : ""
                          }`}
                        >
                          <td className="py-2.5 px-3 whitespace-nowrap">{statusBadge}</td>
                          <td className="py-2.5 px-2">
                            <div className="flex flex-col">
                              <span className="text-white font-sans font-medium flex items-center gap-1 text-xs">
                                {tx.fromName}
                                <ArrowRight className="w-3 h-3 text-slate-500" />
                                {tx.toName}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {tx.id} • {tx.type} • {new Date(tx.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-right text-white font-bold font-mono">
                            ${tx.amount.toLocaleString()}
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              tx.features.autoencoderError > 6.0 
                                ? "bg-rose-950/40 text-rose-400" 
                                : "bg-slate-900 text-slate-400"
                            }`}>
                              {tx.features.autoencoderError.toFixed(1)}/10
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-center text-slate-400">
                            {tx.features.isolationForestScore.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <span className={`font-bold ${
                              tx.riskScore > 0.7 
                                ? "text-rose-500" 
                                : (tx.riskScore > 0.4 ? "text-amber-500" : "text-emerald-500")
                            }`}>
                              {(tx.riskScore * 100).toFixed(0)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </section>

        {/* COLUMN RIGHT: ANOMALY DETAILS & FORENSIC AI OFFICE (4 COLS) */}
        <section className="lg:col-span-5 xl:col-span-4 flex flex-col gap-4">
          
          {/* INTEL & FORENSIC CENTER (MULTI-TABBED) */}
          <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-900 pb-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5 font-sans">
                <Fingerprint className="w-4.5 h-4.5 text-blue-400" />
                Intelligence & Forensics Room
              </h3>
            </div>

            {/* Custom Tab Switcher */}
            <div className="flex gap-2 p-1 bg-slate-900/60 rounded-lg border border-slate-900">
              <button
                onClick={() => setRightPanelTab('tx')}
                className={`flex-1 text-center py-1.5 rounded-md text-[11px] font-mono font-bold uppercase transition-all ${
                  rightPanelTab === 'tx'
                    ? "bg-blue-600 text-white shadow-md"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                📂 Transact Link
              </button>
              <button
                onClick={() => setRightPanelTab('account')}
                className={`flex-1 text-center py-1.5 rounded-md text-[11px] font-mono font-bold uppercase transition-all ${
                  rightPanelTab === 'account'
                    ? "bg-blue-600 text-white shadow-md"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                👤 Entity Dossier {selectedNodeId ? `(${selectedNodeId})` : ""}
              </button>
            </div>

            {/* TAB CONTENTS */}
            {rightPanelTab === 'tx' ? (
              focusedTx ? (
                <div className="flex flex-col gap-3.5">
                  {/* Flow Detail header */}
                  <div className="bg-slate-900/40 border border-slate-900 p-3 rounded-lg flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-slate-500">ID: {focusedTx.id}</span>
                      <span className="text-[10px] font-mono text-slate-500">
                        {new Date(focusedTx.timestamp).toLocaleString()}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 justify-between">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-slate-400 uppercase font-mono">Sender</span>
                        <span className="text-white font-bold text-xs">{focusedTx.fromName}</span>
                        <span className="text-[9px] text-slate-500 font-mono">{focusedTx.fromId}</span>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-600" />
                      <div className="flex flex-col items-end text-right">
                        <span className="text-[10px] text-slate-400 uppercase font-mono">Receiver</span>
                        <span className="text-white font-bold text-xs">{focusedTx.toName}</span>
                        <span className="text-[9px] text-slate-500 font-mono">{focusedTx.toId}</span>
                      </div>
                    </div>

                    <div className="border-t border-slate-800 pt-2.5 mt-1 flex items-center justify-between">
                      <span className="text-xs text-slate-400 font-sans">Settled Volume:</span>
                      <span className="text-sm font-bold font-mono text-white">
                        ${focusedTx.amount.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Algorithmic Disclosures */}
                  <div className="grid grid-cols-2 gap-3">
                    
                    {/* Isolation Forest Path length */}
                    <div className="bg-slate-900/30 border border-slate-900 p-2.5 rounded-lg">
                      <div className="flex items-center gap-1 text-[9px] font-mono text-slate-400 uppercase">
                        <Info className="w-3 h-3 text-blue-400" />
                        I-Forest Score
                      </div>
                      <div className="text-xl font-bold font-mono text-white mt-1">
                        {focusedTx.features.isolationForestScore.toFixed(3)}
                      </div>
                      <div className="text-[9px] text-slate-500 font-sans mt-1 leading-tight">
                        Path splits: {Math.round(14 - focusedTx.features.isolationForestScore * 10)} / 14
                      </div>
                    </div>

                    {/* Autoencoder reconstruction */}
                    <div className="bg-slate-900/30 border border-slate-900 p-2.5 rounded-lg">
                      <div className="flex items-center gap-1 text-[9px] font-mono text-slate-400 uppercase">
                        <Database className="w-3 h-3 text-rose-400" />
                        Autoencoder Error
                      </div>
                      <div className="text-xl font-bold font-mono text-rose-400 mt-1">
                        {focusedTx.features.autoencoderError.toFixed(2)}
                      </div>
                      <div className="text-[9px] text-slate-500 font-sans mt-1 leading-tight">
                        Bottleneck deviation error
                      </div>
                    </div>

                  </div>

                  {/* Interactive Autoencoder Bottleneck Visualizer */}
                  <div className="bg-slate-900/40 border border-slate-900 rounded-lg p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 uppercase">
                      <span>Autoencoder Bottleneck Spectrum</span>
                      <span className={focusedTx.features.autoencoderError > 7.0 ? "text-rose-500 font-bold font-mono text-[9px] px-1.5 py-0.5 bg-rose-950/40 border border-rose-900/50 rounded" : "text-emerald-500 font-bold font-mono text-[9px] px-1.5 py-0.5 bg-emerald-950/40 border border-emerald-900/50 rounded"}>
                        {focusedTx.features.autoencoderError > 7.0 ? "⚠️ OUTLIER DEVIATION" : "✅ RECONSTRUCTED"}
                      </span>
                    </div>
                    
                    <div className="relative w-full bg-slate-950 h-5 border border-slate-900 rounded overflow-hidden flex items-center">
                      {/* Safe Zone */}
                      <div className="absolute left-0 top-0 bottom-0 bg-emerald-500/5 w-[70%]" />
                      {/* Outlier Alert Zone */}
                      <div className="absolute left-[70%] top-0 bottom-0 bg-rose-500/5 w-[30%]" />
                      {/* Threshold line */}
                      <div className="absolute left-[70%] top-0 bottom-0 w-0.5 bg-rose-600/60 border-l border-dashed border-rose-500" />
                      
                      {/* Current Error Indicator */}
                      <div 
                        className={`absolute h-3 w-3 rounded-full transition-all duration-500 ${
                          focusedTx.features.autoencoderError > 7.0 
                            ? "bg-rose-500 shadow-[0_0_10px_#ef4444]" 
                            : "bg-emerald-500 shadow-[0_0_10px_#10b981]"
                        }`}
                        style={{ left: `calc(${Math.min(98, (focusedTx.features.autoencoderError / 10) * 100)}% - 6px)` }}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between text-[8px] font-mono text-slate-500">
                      <span>0.1 (Normal)</span>
                      <span className="text-rose-500 font-bold">7.0 (Threshold Limit)</span>
                      <span>10.0 (Max Error)</span>
                    </div>
                  </div>

                  {/* Risk Velocity Metric */}
                  <div className="bg-slate-900/20 border border-slate-900 p-2.5 rounded-lg">
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 uppercase">
                      <span>Velocity Index:</span>
                      <span className="font-bold text-white">
                        {(focusedTx.features.velocityIndex * 10).toFixed(1)} / 10
                      </span>
                    </div>
                    <div className="w-full bg-slate-900 rounded-full h-1 mt-1.5 overflow-hidden">
                      <div 
                        className="bg-blue-500 h-1 rounded-full" 
                        style={{ width: `${focusedTx.features.velocityIndex * 100}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Cyclical Loop Indicator */}
                  {focusedTx.features.isCyclic && (
                    <div className="bg-rose-950/20 border border-rose-900/40 p-2.5 rounded-lg flex items-center gap-2.5 text-xs text-rose-400">
                      <AlertTriangle className="w-5 h-5 text-rose-500 animate-bounce shrink-0" />
                      <div>
                        <span className="font-bold uppercase font-mono block">Direct Cycle Captured</span>
                        <span className="text-[10px] text-slate-400 leading-tight block">
                          Capital was routed structurally through external mules and returns back to starting origin entity.
                        </span>
                      </div>
                    </div>
                  )}

                </div>
              ) : (
                <p className="text-xs text-slate-500 font-sans py-12 text-center leading-relaxed">
                  Select any transaction line in the ledger feed or dynamic link on the topology map to execute a spatial mathematical audit.
                </p>
              )
            ) : (
              /* ENTITY DOSSIER TAB */
              focusedAccount ? (
                <div className="flex flex-col gap-3.5">
                  
                  {/* Account Overview Card */}
                  <div className="bg-slate-900/40 border border-slate-900 p-3 rounded-lg flex flex-col gap-2.5">
                    <div className="flex items-start justify-between">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-mono text-slate-500 uppercase">Entity Account ID</span>
                        <span className="text-xs font-mono font-bold text-slate-300">{focusedAccount.id}</span>
                      </div>

                      {/* Dynamic status badges */}
                      {focusedAccount.status === "Frozen" ? (
                        <span className="text-[10px] bg-sky-950/50 text-sky-400 border border-sky-800/60 px-2 py-0.5 rounded font-mono font-bold flex items-center gap-1 shadow-[0_0_8px_rgba(56,189,248,0.15)] animate-pulse">
                          ❄️ ASSETS FROZEN
                        </span>
                      ) : focusedAccount.status === "EDD" ? (
                        <span className="text-[10px] bg-amber-950/50 text-amber-400 border border-amber-800/60 px-2 py-0.5 rounded font-mono font-bold flex items-center gap-1 shadow-[0_0_8px_rgba(245,158,11,0.15)]">
                          ⚠️ ENHANCED DD
                        </span>
                      ) : (
                        <span className="text-[10px] bg-emerald-950/30 text-emerald-400 border border-emerald-900/40 px-2 py-0.5 rounded font-mono font-bold flex items-center gap-1">
                          🟢 ACTIVE / CLEAR
                        </span>
                      )}
                    </div>

                    <div className="border-t border-b border-slate-900 py-2 my-1 flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400 font-sans">Legal Identity:</span>
                        <span className="text-xs font-bold text-white font-sans">{focusedAccount.name}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400 font-sans">Entity Type:</span>
                        <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800">{focusedAccount.type}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400 font-sans">Jurisdiction:</span>
                        <span className="text-xs font-bold text-slate-300 font-sans">{focusedAccount.country}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400 font-sans">Liquidity Balance:</span>
                      <span className="text-sm font-bold font-mono text-white">
                        ${focusedAccount.balance.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Risk Profile & Velocity */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-900/30 border border-slate-900 p-2.5 rounded-lg">
                      <div className="text-[9px] font-mono text-slate-500 uppercase">Base Risk Weight</div>
                      <div className="text-lg font-bold font-mono text-white mt-1">
                        {(focusedAccount.baseRiskScore * 100).toFixed(0)}%
                      </div>
                      <div className="w-full bg-slate-950 h-1 rounded-full mt-1.5 overflow-hidden">
                        <div 
                          className="bg-blue-500 h-1 rounded-full" 
                          style={{ width: `${focusedAccount.baseRiskScore * 100}%` }}
                        />
                      </div>
                    </div>

                    <div className="bg-slate-900/30 border border-slate-900 p-2.5 rounded-lg">
                      <div className="text-[9px] font-mono text-slate-500 uppercase">Risk Velocity</div>
                      <div className={`text-lg font-bold font-mono mt-1 ${focusedAccount.riskVelocity > 0.4 ? "text-rose-400 animate-pulse" : "text-white"}`}>
                        {(focusedAccount.riskVelocity * 100).toFixed(0)}%
                      </div>
                      <div className="w-full bg-slate-950 h-1 rounded-full mt-1.5 overflow-hidden">
                        <div 
                          className={`h-1 rounded-full ${focusedAccount.riskVelocity > 0.4 ? "bg-rose-500" : "bg-blue-500"}`} 
                          style={{ width: `${focusedAccount.riskVelocity * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* ACTION CORRIDOR */}
                  <div className="bg-slate-900/20 border border-slate-900 rounded-lg p-3 flex flex-col gap-2.5">
                    <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block">Compliance Enforcement Console</span>
                    <div className="flex flex-col gap-2">
                      {focusedAccount.status !== 'Frozen' && (
                        <button
                          onClick={() => handleUpdateAccountStatus(focusedAccount.id, 'Frozen')}
                          className="w-full py-1.5 bg-sky-950/40 text-sky-400 border border-sky-800 hover:bg-sky-900/40 rounded text-xs font-bold font-sans flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <span>❄️ Lock Assets / Freeze Account</span>
                        </button>
                      )}
                      {focusedAccount.status !== 'EDD' && (
                        <button
                          onClick={() => handleUpdateAccountStatus(focusedAccount.id, 'EDD')}
                          className="w-full py-1.5 bg-amber-950/40 text-amber-400 border border-amber-850 hover:bg-amber-900/40 rounded text-xs font-bold font-sans flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <span>⚠️ Initiate Enhanced Due Diligence</span>
                        </button>
                      )}
                      {focusedAccount.status !== 'Active' && (
                        <button
                          onClick={() => handleUpdateAccountStatus(focusedAccount.id, 'Active')}
                          className="w-full py-1.5 bg-emerald-950/40 text-emerald-400 border border-emerald-850 hover:bg-emerald-900/40 rounded text-xs font-bold font-sans flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <span>🟢 Clear Restrictions / Set Active</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Recent Activity Mini-Feed */}
                  <div className="flex flex-col gap-2 mt-1">
                    <span className="text-[10px] font-mono text-slate-500 uppercase">Recent Transfers Map</span>
                    <div className="flex flex-col gap-1.5 max-h-[120px] overflow-y-auto">
                      {transactions.filter(t => t.fromId === focusedAccount.id || t.toId === focusedAccount.id).slice(0, 4).length === 0 ? (
                        <span className="text-[10px] text-slate-500 italic py-1 text-center block">No transactions mapped to this node.</span>
                      ) : (
                        transactions.filter(t => t.fromId === focusedAccount.id || t.toId === focusedAccount.id).slice(0, 4).map(t => (
                          <div 
                            key={t.id} 
                            onClick={() => setSelectedTxId(t.id)}
                            className={`p-2 rounded bg-slate-900/50 border hover:bg-slate-900 cursor-pointer flex items-center justify-between text-[10px] transition-all ${selectedTxId === t.id ? "border-blue-500/80 bg-slate-900" : "border-slate-900"}`}
                          >
                            <div className="flex flex-col">
                              <span className="font-semibold text-slate-300">
                                {t.fromId === focusedAccount.id ? `➔ Sent to ${t.toName}` : `⇠ Recv from ${t.fromName}`}
                              </span>
                              <span className="text-[8px] text-slate-500 font-mono">{t.id} • {new Date(t.timestamp).toLocaleTimeString()}</span>
                            </div>
                            <div className="text-right flex flex-col items-end">
                              <span className="font-mono text-white font-bold">${t.amount.toLocaleString()}</span>
                              <span className={`text-[8px] font-mono ${t.status === 'Isolated' ? 'text-rose-400' : t.status === 'Flagged' ? 'text-amber-400' : 'text-slate-500'}`}>{t.status}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                </div>
              ) : (
                <p className="text-xs text-slate-500 font-sans py-12 text-center leading-relaxed">
                  Select any legal node on the topology map above to inspect its real-time transaction ledger balances, sovereign jurisdictions, and freeze legal parameters.
                </p>
              )
            )}

          </div>

          {/* ACTIVE SUSPICIOUS FRAUD CASES LIST */}
          <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col gap-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5 border-b border-slate-900 pb-2 font-sans">
              <AlertTriangle className="w-4.5 h-4.5 text-amber-500 animate-pulse" />
              Active AML Forensic Cases
            </h3>

            <div className="flex flex-col gap-2.5 max-h-[180px] overflow-y-auto">
              {fraudCases.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-xs">
                  No fraud alerts generated. Trigger a scenario below to populate.
                </div>
              ) : (
                fraudCases.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => {
                      setSelectedCaseId(c.id);
                      handleRequestAIReport(c.id);
                    }}
                    className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                      selectedCaseId === c.id
                        ? "bg-slate-900 border-rose-800/80 shadow-[0_0_10px_rgba(239,68,68,0.1)]"
                        : "bg-slate-900/30 border-slate-900 hover:bg-slate-900/50"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                      <span className="font-bold text-rose-400 uppercase">{c.type}</span>
                      <span className="text-slate-500">{c.id}</span>
                    </div>
                    <h4 className="text-xs font-semibold text-white leading-snug">{c.title}</h4>
                    <div className="flex items-center justify-between text-[9px] text-slate-400 mt-2">
                      <span>{c.involvedAccounts.length} entities involved</span>
                      <span className="text-rose-500 font-mono font-bold">
                        {(c.riskScore * 100).toFixed(0)}% THREAT
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* AI FORENSIC ANALYSIS AND INVESTIGATION OFFICE */}
          <div id="ai-forensic-office" className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-900 pb-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5 font-sans">
                <FileText className="w-4.5 h-4.5 text-rose-500" />
                AI Forensic Agent
              </h3>
              <span className="text-[10px] bg-emerald-950/30 text-emerald-400 border border-emerald-900/40 px-2 py-0.5 rounded font-mono">
                GEMINI POWERED
              </span>
            </div>

            {/* AI Report Block */}
            <div className="bg-slate-900/40 border border-slate-900 rounded-lg p-3 min-h-[220px] max-h-[380px] overflow-y-auto relative flex flex-col justify-between">
              
              {isAnalyzing && (
                <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-center gap-3 text-center z-20">
                  <div className="w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
                  <div className="text-xs font-mono text-rose-400 animate-pulse">
                    PARSING TRANSACTION SUBGRAPHS...<br />
                    RUNNING VECTOR COGNITIVE REVIEWS
                  </div>
                </div>
              )}

              {activeReport ? (
                <div>
                  <div className="flex items-center justify-between border-b border-slate-900 pb-2 mb-2">
                    <h4 className="text-xs font-bold text-white tracking-wide uppercase font-sans">
                      {activeReport.reportTitle}
                    </h4>
                    
                    <div className="flex items-center gap-1.5">
                      {activeReport.isSimulated && (
                        <span className="text-[8px] font-mono text-amber-500 border border-amber-900/30 px-1.5 py-0.5 rounded mr-1">
                          Simulated
                        </span>
                      )}
                      
                      {/* Copy Action Button */}
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(activeReport.reportText);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                        className="px-2 py-1 bg-slate-950 border border-slate-800 text-[9px] font-mono font-bold text-slate-400 hover:text-white rounded flex items-center gap-1 transition-all cursor-pointer"
                        title="Copy to Clipboard"
                      >
                        {copied ? "✓ Copied" : "📋 Copy"}
                      </button>

                      {/* Download Action Button */}
                      <button
                        onClick={() => {
                          const element = document.createElement("a");
                          const file = new Blob([activeReport.reportText], {type: 'text/plain'});
                          element.href = URL.createObjectURL(file);
                          element.download = `finguard_aml_forensic_${selectedCaseId || 'report'}.txt`;
                          document.body.appendChild(element);
                          element.click();
                          document.body.removeChild(element);
                        }}
                        className="px-2 py-1 bg-slate-950 border border-slate-800 text-[9px] font-mono font-bold text-slate-400 hover:text-white rounded flex items-center gap-1 transition-all cursor-pointer"
                        title="Download Text File"
                      >
                        💾 Save
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1 text-slate-300">
                    {renderForensicReport(activeReport.reportText)}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center py-12 px-4 h-full my-auto text-slate-500">
                  <Fingerprint className="w-10 h-10 text-slate-700 mb-2 animate-pulse" />
                  <p className="text-xs font-sans">
                    Compliance sandbox ready.
                  </p>
                  <p className="text-[10px] text-slate-600 mt-1">
                    Trigger an attack above or click an active case to run full structural AI loop evaluations.
                  </p>
                </div>
              )}
            </div>

            {/* Custom Compliance Query Input */}
            <div className="flex flex-col gap-2">
              <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 block">
                Custom Forensic Prompt
              </span>
              <div className="relative">
                <input
                  type="text"
                  placeholder="e.g. Audit ACC-901 Mule and summarize offshore links"
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customPrompt.trim()) {
                      handleRequestAIReport(selectedCaseId, customPrompt);
                      setCustomPrompt("");
                    }
                  }}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-3 pr-10 py-2 text-xs font-sans text-white focus:outline-none focus:ring-1 focus:ring-rose-500 focus:border-rose-500 placeholder-slate-600"
                />
                <button
                  onClick={() => {
                    if (customPrompt.trim()) {
                      handleRequestAIReport(selectedCaseId, customPrompt);
                      setCustomPrompt("");
                    }
                  }}
                  className="absolute right-1.5 top-1.5 p-1 text-slate-400 hover:text-white transition-all bg-slate-950 rounded border border-slate-800"
                >
                  <Search className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

          </div>

          {/* MANUAL TRANSACTION ROUTING INJECTOR */}
          <div className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col gap-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5 border-b border-slate-900 pb-2 font-sans">
              <PlusCircle className="w-4.5 h-4.5 text-blue-400" />
              Manual Transaction Router
            </h3>

            <form onSubmit={handleManualTransact} className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                
                {/* Sender Select */}
                <div>
                  <label className="text-[10px] uppercase font-mono tracking-wider text-slate-500 block mb-1">
                    From Account
                  </label>
                  <select
                    value={manualFrom}
                    onChange={(e) => setManualFrom(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">-- Select Source --</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.id} - {a.name} (${Math.round(a.balance).toLocaleString()})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Receiver Select */}
                <div>
                  <label className="text-[10px] uppercase font-mono tracking-wider text-slate-500 block mb-1">
                    To Account
                  </label>
                  <select
                    value={manualTo}
                    onChange={(e) => setManualTo(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">-- Select Destination --</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.id} - {a.name} (${Math.round(a.balance).toLocaleString()})
                      </option>
                    ))}
                  </select>
                </div>

              </div>

              <div className="grid grid-cols-2 gap-3">
                
                {/* Amount */}
                <div>
                  <label className="text-[10px] uppercase font-mono tracking-wider text-slate-500 block mb-1">
                    Volume ($ USD)
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 50000"
                    value={manualAmount}
                    onChange={(e) => setManualAmount(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Type */}
                <div>
                  <label className="text-[10px] uppercase font-mono tracking-wider text-slate-500 block mb-1">
                    Payment Type
                  </label>
                  <select
                    value={manualType}
                    onChange={(e) => setManualType(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-sans text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="Wire Transfer">Wire Transfer</option>
                    <option value="ACH">ACH Transfer</option>
                    <option value="Cash Deposit">Cash Deposit</option>
                    <option value="Card Payment">Card Payment</option>
                  </select>
                </div>

              </div>

              {formError && (
                <div className="text-xs text-rose-400 bg-rose-950/20 border border-rose-900/40 p-2 rounded-lg font-sans">
                  {formError}
                </div>
              )}

              {formSuccess && (
                <div className="text-xs text-emerald-400 bg-emerald-950/20 border border-emerald-900/40 p-2 rounded-lg font-sans flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                  Transaction successfully dispatched and scored in vector space.
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-500 font-bold py-2 px-4 rounded-lg text-xs font-sans text-white transition-all"
              >
                Dispatch Transfer Link
              </button>
            </form>
          </div>

        </section>

      </main>

      {/* FOOTER */}
      <footer className="border-t border-slate-900 py-4 px-6 text-center text-[10px] text-slate-600 font-mono mt-auto bg-slate-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <span>FINGUARD SECURE COMPLIANCE ENVIRONMENT • v4.12-ALPHA-RELEASE</span>
        <span>SECURITY SIGNATURE: ACC-VECTOR_ISOLATION_VERIFIED</span>
      </footer>

    </div>
  );
}

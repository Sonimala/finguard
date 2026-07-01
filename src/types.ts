export interface Account {
  id: string;
  name: string;
  type: 'Personal' | 'Business' | 'Offshore' | 'Shell Company' | 'Mule Account';
  country: string;
  baseRiskScore: number; // 0 to 1
  balance: number;
  riskVelocity: number; // calculated over past transactions
  createdAt: string;
  status?: 'Active' | 'Frozen' | 'EDD';
}

export interface Transaction {
  id: string;
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  amount: number;
  timestamp: string;
  type: 'Wire Transfer' | 'ACH' | 'Cash Deposit' | 'Card Payment';
  riskScore: number; // 0 to 1
  features: {
    isolationForestScore: number; // anomaly score (0 to 1)
    autoencoderError: number; // reconstruction error (0 to 10)
    velocityIndex: number; // velocity multiplier (0 to 1)
    isCyclic: boolean;
  };
  status: 'Cleared' | 'Flagged' | 'Isolated';
  explanation?: string;
}

export interface GraphNode {
  id: string;
  name: string;
  type: string;
  country: string;
  riskScore: number;
  balance: number;
  status?: string;
}

export interface GraphLink {
  source: string;
  target: string;
  amount: number;
  riskScore: number;
  count: number;
  isSuspicious: boolean;
}

export interface FraudCase {
  id: string;
  title: string;
  type: 'Cyclic Loop' | 'Smurfing Funnel' | 'Rapid Multi-Hop' | 'Offshore Drain';
  riskScore: number;
  status: 'Investigating' | 'Frozen' | 'Dismissed';
  involvedAccounts: string[];
  involvedTransactions: string[];
  aiAnalysis?: string;
  createdAt: string;
}

export interface SystemStats {
  totalTransactionsCount: number;
  totalVolume: number;
  flaggedTransactionsCount: number;
  isolatedVolume: number;
  activeMuleAccountsCount: number;
  averageRiskScore: number;
}

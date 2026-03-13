import type { TransactionContext } from "./transaction-manager";

export interface AcquireLeaseInput {
  key: string;
  chainId: number;
  contractAddress: string;
  eventName: string;
  reorgLookback: number;
  owner: string;
  leaseDurationMs: number;
}

export interface UpdateProgressInput {
  key: string;
  chainId: number;
  contractAddress: string;
  eventName: string;
  lastFinalizedScannedBlock: number;
  reorgLookback: number;
  status: "idle" | "running" | "error";
  leaseOwner?: string;
  lastError?: string | null;
}

export interface SyncStateRecord {
  key: string;
  chainId: number;
  contractAddress: string;
  eventName: string;
  lastFinalizedScannedBlock: number;
  reorgLookback: number;
  status: "idle" | "running" | "error";
  leaseOwner?: string;
  leaseUntil?: Date;
  lastHeartbeatAt?: Date;
  lastError?: string;
  updatedAt: Date;
}

export interface SyncStateRepository {
  acquireLease(input: AcquireLeaseInput): Promise<SyncStateRecord | null>;
  renewLease(input: AcquireLeaseInput): Promise<boolean>;
  updateProgress(
    input: UpdateProgressInput,
    transaction?: TransactionContext
  ): Promise<void>;
  getByKey(key: string): Promise<SyncStateRecord | null>;
}

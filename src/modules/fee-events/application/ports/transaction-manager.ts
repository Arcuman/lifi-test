declare const transactionContextBrand: unique symbol;

export type TransactionContext = {
  readonly [transactionContextBrand]: "TransactionContext";
};

export interface TransactionManager {
  withTransaction<T>(
    work: (context: TransactionContext) => Promise<T>
  ): Promise<T>;
}

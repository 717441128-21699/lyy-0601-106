import { InMemoryStorage } from '../storage';
import {
  Transaction,
  CreateTransactionInput,
  UpdateTransactionInput,
  ID,
  TransactionType,
  TransactionCategory,
  RecurrenceRule,
  CreateRecurrenceRuleInput,
} from '../types';
import {
  createBaseEntity,
  now,
  roundAmount,
  isInDateRange,
  addFrequency,
} from '../utils';
import { DEFAULT_CURRENCY } from '../constants';
import { AccountModule } from './AccountModule';

export class TransactionModule {
  private storage: InMemoryStorage;
  private accounts: AccountModule;

  constructor(storage: InMemoryStorage, accounts: AccountModule) {
    this.storage = storage;
    this.accounts = accounts;
  }

  create(input: CreateTransactionInput): Transaction {
    if (!input.userId) {
      throw new Error('用户ID不能为空');
    }
    if (!input.accountId) {
      throw new Error('账户ID不能为空');
    }
    if (!input.amount || input.amount <= 0) {
      throw new Error('交易金额必须大于0');
    }
    if (!input.category) {
      throw new Error('交易分类不能为空');
    }

    const fromAccount = this.accounts.getByIdOrThrow(input.accountId);
    if (input.type === 'transfer' && !input.toAccountId) {
      throw new Error('转账交易必须指定目标账户');
    }
    if (input.type === 'refund' && !input.refundOfId) {
      throw new Error('退款交易必须关联原始交易ID');
    }

    const transaction: Transaction = {
      ...createBaseEntity(),
      userId: input.userId,
      type: input.type,
      amount: roundAmount(input.amount),
      currency: input.currency ?? fromAccount.currency ?? DEFAULT_CURRENCY,
      accountId: input.accountId,
      toAccountId: input.toAccountId,
      category: input.category,
      subCategory: input.subCategory,
      note: input.note,
      tags: input.tags,
      date: input.date ?? now(),
      isRecurring: input.isRecurring,
      recurrenceRuleId: input.recurrenceRuleId,
      splitId: input.splitId,
      refundOfId: input.refundOfId,
      isRefunded: false,
      attachmentUrl: input.attachmentUrl,
      location: input.location,
    };

    this.applyTransactionToAccounts(transaction);

    if (transaction.type === 'refund' && transaction.refundOfId) {
      const originalTx = this.storage.transactions.get(transaction.refundOfId);
      if (originalTx) {
        originalTx.isRefunded = true;
        originalTx.updatedAt = now();
        this.storage.transactions.set(originalTx.id, originalTx);
      }
    }

    this.storage.transactions.set(transaction.id, transaction);
    return transaction;
  }

  private applyTransactionToAccounts(transaction: Transaction): void {
    const amount = transaction.amount;

    switch (transaction.type) {
      case 'income':
        this.accounts.adjustBalance(transaction.accountId, amount);
        break;
      case 'expense':
        this.accounts.adjustBalance(transaction.accountId, -amount);
        break;
      case 'transfer':
        this.accounts.adjustBalance(transaction.accountId, -amount);
        if (transaction.toAccountId) {
          this.accounts.adjustBalance(transaction.toAccountId, amount);
        }
        break;
      case 'refund':
        this.accounts.adjustBalance(transaction.accountId, amount);
        break;
    }
  }

  private reverseTransactionFromAccounts(transaction: Transaction): void {
    const amount = transaction.amount;

    switch (transaction.type) {
      case 'income':
        this.accounts.adjustBalance(transaction.accountId, -amount);
        break;
      case 'expense':
        this.accounts.adjustBalance(transaction.accountId, amount);
        break;
      case 'transfer':
        this.accounts.adjustBalance(transaction.accountId, amount);
        if (transaction.toAccountId) {
          this.accounts.adjustBalance(transaction.toAccountId, -amount);
        }
        break;
      case 'refund':
        this.accounts.adjustBalance(transaction.accountId, -amount);
        break;
    }
  }

  recordIncome(
    input: Omit<CreateTransactionInput, 'type'> & { category?: TransactionCategory }
  ): Transaction {
    return this.create({
      ...input,
      type: 'income',
      category: input.category ?? 'salary',
    });
  }

  recordExpense(
    input: Omit<CreateTransactionInput, 'type'> & { category?: TransactionCategory }
  ): Transaction {
    return this.create({
      ...input,
      type: 'expense',
      category: input.category ?? 'other',
    });
  }

  recordTransfer(input: {
    userId: ID;
    fromAccountId: ID;
    toAccountId: ID;
    amount: number;
    currency?: string;
    note?: string;
    tags?: string[];
    date?: number;
  }): Transaction {
    return this.create({
      userId: input.userId,
      type: 'transfer',
      amount: input.amount,
      currency: input.currency as any,
      accountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      category: 'savings',
      note: input.note,
      tags: input.tags,
      date: input.date,
    });
  }

  recordRefund(input: {
    userId: ID;
    originalTransactionId: ID;
    amount?: number;
    currency?: string;
    accountId?: ID;
    note?: string;
    tags?: string[];
    date?: number;
  }): Transaction {
    const original = this.getByIdOrThrow(input.originalTransactionId);
    return this.create({
      userId: input.userId,
      type: 'refund',
      amount: input.amount ?? original.amount,
      currency: (input.currency as any) ?? original.currency,
      accountId: input.accountId ?? original.accountId,
      category: original.category,
      refundOfId: original.id,
      note: input.note ?? `退款: ${original.note ?? ''}`,
      tags: input.tags,
      date: input.date,
    });
  }

  getById(id: ID): Transaction | null {
    return this.storage.transactions.get(id) ?? null;
  }

  getByIdOrThrow(id: ID): Transaction {
    const tx = this.getById(id);
    if (!tx) {
      throw new Error(`交易不存在: ${id}`);
    }
    return tx;
  }

  update(id: ID, input: UpdateTransactionInput): Transaction {
    const tx = this.getByIdOrThrow(id);
    this.reverseTransactionFromAccounts(tx);

    const updated: Transaction = {
      ...tx,
      ...input,
      amount: input.amount !== undefined ? roundAmount(input.amount) : tx.amount,
      updatedAt: now(),
    };

    this.applyTransactionToAccounts(updated);
    this.storage.transactions.set(id, updated);
    return updated;
  }

  addNote(id: ID, note: string): Transaction {
    return this.update(id, { note });
  }

  setCategory(id: ID, category: TransactionCategory, subCategory?: string): Transaction {
    return this.update(id, { category, subCategory });
  }

  addTags(id: ID, tags: string[]): Transaction {
    const tx = this.getByIdOrThrow(id);
    const newTags = Array.from(new Set([...(tx.tags ?? []), ...tags]));
    return this.update(id, { tags: newTags });
  }

  removeTags(id: ID, tags: string[]): Transaction {
    const tx = this.getByIdOrThrow(id);
    const newTags = (tx.tags ?? []).filter((t) => !tags.includes(t));
    return this.update(id, { tags: newTags });
  }

  delete(id: ID): boolean {
    const tx = this.getById(id);
    if (tx) {
      this.reverseTransactionFromAccounts(tx);
      if (tx.refundOfId) {
        const original = this.storage.transactions.get(tx.refundOfId);
        if (original) {
          original.isRefunded = false;
          original.updatedAt = now();
          this.storage.transactions.set(original.id, original);
        }
      }
    }
    return this.storage.transactions.delete(id);
  }

  listByUser(
    userId: ID,
    options?: {
      startDate?: number;
      endDate?: number;
      accountId?: ID;
      types?: TransactionType[];
      categories?: TransactionCategory[];
      tags?: string[];
      limit?: number;
      offset?: number;
    }
  ): Transaction[] {
    let result = Array.from(this.storage.transactions.values()).filter(
      (tx) => tx.userId === userId
    );

    if (options?.startDate) {
      result = result.filter((tx) => tx.date >= options.startDate!);
    }
    if (options?.endDate) {
      result = result.filter((tx) => tx.date <= options.endDate!);
    }
    if (options?.accountId) {
      result = result.filter(
        (tx) => tx.accountId === options.accountId || tx.toAccountId === options.accountId
      );
    }
    if (options?.types && options.types.length > 0) {
      result = result.filter((tx) => options.types!.includes(tx.type));
    }
    if (options?.categories && options.categories.length > 0) {
      result = result.filter((tx) => options.categories!.includes(tx.category));
    }
    if (options?.tags && options.tags.length > 0) {
      result = result.filter(
        (tx) => tx.tags && options.tags!.some((tag) => tx.tags!.includes(tag))
      );
    }

    result.sort((a, b) => b.date - a.date);

    if (options?.offset !== undefined) {
      result = result.slice(options.offset);
    }
    if (options?.limit !== undefined) {
      result = result.slice(0, options.limit);
    }

    return result;
  }

  listInDateRange(
    userId: ID,
    startDate: number,
    endDate: number,
    accountIds?: ID[]
  ): Transaction[] {
    return this.listByUser(userId, {
      startDate,
      endDate,
    }).filter(
      (tx) =>
        !accountIds ||
        accountIds.length === 0 ||
        accountIds.includes(tx.accountId) ||
        (tx.toAccountId && accountIds.includes(tx.toAccountId))
    );
  }

  sumByType(
    userId: ID,
    type: TransactionType,
    startDate?: number,
    endDate?: number,
    accountIds?: ID[]
  ): number {
    const txs = this.listByUser(userId, {
      startDate,
      endDate,
      types: [type],
    });
    const filtered = accountIds && accountIds.length > 0
      ? txs.filter(
          (tx) =>
            accountIds.includes(tx.accountId) ||
            (tx.toAccountId && accountIds.includes(tx.toAccountId))
        )
      : txs;
    return filtered.reduce((sum, tx) => sum + tx.amount, 0);
  }

  getTotalIncome(userId: ID, startDate?: number, endDate?: number, accountIds?: ID[]): number {
    return this.sumByType(userId, 'income', startDate, endDate, accountIds);
  }

  getTotalExpense(userId: ID, startDate?: number, endDate?: number, accountIds?: ID[]): number {
    return this.sumByType(userId, 'expense', startDate, endDate, accountIds);
  }

  getNetAmount(userId: ID, startDate?: number, endDate?: number, accountIds?: ID[]): number {
    return (
      this.getTotalIncome(userId, startDate, endDate, accountIds) -
      this.getTotalExpense(userId, startDate, endDate, accountIds)
    );
  }

  getRefunds(userId: ID, startDate?: number, endDate?: number): Transaction[] {
    return this.listByUser(userId, { startDate, endDate, types: ['refund'] });
  }

  getTransfers(userId: ID, startDate?: number, endDate?: number): Transaction[] {
    return this.listByUser(userId, { startDate, endDate, types: ['transfer'] });
  }

  search(userId: ID, keyword: string, limit: number = 50): Transaction[] {
    const kw = keyword.toLowerCase();
    return this.listByUser(userId, { limit }).filter(
      (tx) =>
        (tx.note && tx.note.toLowerCase().includes(kw)) ||
        (tx.subCategory && tx.subCategory.toLowerCase().includes(kw)) ||
        (tx.location && tx.location.toLowerCase().includes(kw)) ||
        (tx.tags && tx.tags.some((t) => t.toLowerCase().includes(kw))) ||
        tx.category.toLowerCase().includes(kw)
    );
  }

  createRecurrenceRule(input: CreateRecurrenceRuleInput): RecurrenceRule {
    const startDate = input.startDate ?? now();
    const rule: RecurrenceRule = {
      ...createBaseEntity(),
      userId: input.userId,
      frequency: input.frequency,
      interval: input.interval ?? 1,
      startDate,
      endDate: input.endDate,
      nextOccurrence: addFrequency(startDate, input.frequency, input.interval ?? 1),
      count: input.count,
      occurrencesGenerated: 0,
      transactionTemplate: input.transactionTemplate,
    };
    this.storage.recurrenceRules.set(rule.id, rule);
    return rule;
  }

  processRecurrenceRules(currentTime: number = now()): Transaction[] {
    const generated: Transaction[] = [];
    this.storage.recurrenceRules.forEach((rule) => {
      while (
        rule.nextOccurrence <= currentTime &&
        (!rule.endDate || rule.nextOccurrence <= rule.endDate) &&
        (!rule.count || rule.occurrencesGenerated < rule.count)
      ) {
        const tx = this.create({
          ...rule.transactionTemplate,
          date: rule.nextOccurrence,
          isRecurring: true,
          recurrenceRuleId: rule.id,
        });
        generated.push(tx);
        rule.occurrencesGenerated++;
        rule.nextOccurrence = addFrequency(
          rule.nextOccurrence,
          rule.frequency,
          rule.interval
        );
      }
      rule.updatedAt = now();
      this.storage.recurrenceRules.set(rule.id, rule);
    });
    return generated;
  }

  getRecurrenceRules(userId: ID): RecurrenceRule[] {
    return Array.from(this.storage.recurrenceRules.values()).filter(
      (r) => r.userId === userId
    );
  }

  deleteRecurrenceRule(id: ID): boolean {
    return this.storage.recurrenceRules.delete(id);
  }
}

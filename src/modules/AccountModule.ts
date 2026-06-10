import { InMemoryStorage } from '../storage';
import {
  Account,
  CreateAccountInput,
  UpdateAccountInput,
  ID,
  AccountType,
} from '../types';
import { createBaseEntity, now, roundAmount } from '../utils';
import { DEFAULT_CURRENCY } from '../constants';

export class AccountModule {
  private storage: InMemoryStorage;

  constructor(storage: InMemoryStorage) {
    this.storage = storage;
  }

  create(input: CreateAccountInput): Account {
    if (!input.name || input.name.trim().length === 0) {
      throw new Error('账户名称不能为空');
    }
    if (!input.userId) {
      throw new Error('用户ID不能为空');
    }

    const initialBalance = roundAmount(input.initialBalance ?? 0);

    const account: Account = {
      ...createBaseEntity(),
      userId: input.userId,
      name: input.name.trim(),
      type: input.type,
      balance: initialBalance,
      initialBalance: initialBalance,
      currency: input.currency ?? DEFAULT_CURRENCY,
      icon: input.icon,
      color: input.color,
      description: input.description,
      isDefault: input.isDefault ?? false,
      creditLimit: input.creditLimit,
      billingDate: input.billingDate,
      isArchived: false,
    };

    if (account.isDefault) {
      this.storage.accounts.forEach((acc) => {
        if (acc.userId === account.userId && acc.isDefault && acc.id !== account.id) {
          acc.isDefault = false;
          acc.updatedAt = now();
        }
      });
    }

    this.storage.accounts.set(account.id, account);
    return account;
  }

  createCashAccount(input: Omit<CreateAccountInput, 'type'>): Account {
    return this.create({ ...input, type: 'cash' });
  }

  createEWalletAccount(input: Omit<CreateAccountInput, 'type'>): Account {
    return this.create({ ...input, type: 'e-wallet' });
  }

  createBankAccount(input: Omit<CreateAccountInput, 'type'>): Account {
    return this.create({ ...input, type: 'bank' });
  }

  createCreditCardAccount(
    input: Omit<CreateAccountInput, 'type'> & {
      creditLimit: number;
      billingDate?: number;
    }
  ): Account {
    return this.create({
      ...input,
      type: 'credit-card',
      creditLimit: input.creditLimit,
      billingDate: input.billingDate,
    });
  }

  getById(id: ID): Account | null {
    return this.storage.accounts.get(id) ?? null;
  }

  getByIdOrThrow(id: ID): Account {
    const account = this.getById(id);
    if (!account) {
      throw new Error(`账户不存在: ${id}`);
    }
    return account;
  }

  listByUserId(userId: ID, includeArchived: boolean = false): Account[] {
    return Array.from(this.storage.accounts.values()).filter(
      (acc) => acc.userId === userId && (includeArchived || !acc.isArchived)
    );
  }

  getDefault(userId: ID): Account | null {
    return (
      Array.from(this.storage.accounts.values()).find(
        (acc) => acc.userId === userId && acc.isDefault && !acc.isArchived
      ) ?? null
    );
  }

  listByType(userId: ID, type: AccountType, includeArchived: boolean = false): Account[] {
    return this.listByUserId(userId, includeArchived).filter((acc) => acc.type === type);
  }

  update(id: ID, input: UpdateAccountInput): Account {
    const account = this.getByIdOrThrow(id);
    const updated: Account = {
      ...account,
      ...input,
      updatedAt: now(),
    };

    if (input.isDefault) {
      this.storage.accounts.forEach((acc) => {
        if (acc.userId === account.userId && acc.isDefault && acc.id !== id) {
          acc.isDefault = false;
          acc.updatedAt = now();
        }
      });
    }

    this.storage.accounts.set(id, updated);
    return updated;
  }

  adjustBalance(id: ID, amount: number): Account {
    const account = this.getByIdOrThrow(id);
    account.balance = roundAmount(account.balance + amount);
    account.updatedAt = now();
    this.storage.accounts.set(id, account);
    return account;
  }

  setBalance(id: ID, balance: number): Account {
    const account = this.getByIdOrThrow(id);
    account.balance = roundAmount(balance);
    account.updatedAt = now();
    this.storage.accounts.set(id, account);
    return account;
  }

  archive(id: ID): Account {
    return this.update(id, { isArchived: true });
  }

  unarchive(id: ID): Account {
    return this.update(id, { isArchived: false });
  }

  delete(id: ID): boolean {
    return this.storage.accounts.delete(id);
  }

  getTotalBalance(userId: ID, currency?: string): number {
    return this.listByUserId(userId)
      .filter((acc) => !currency || acc.currency === currency)
      .reduce((sum, acc) => sum + acc.balance, 0);
  }

  getTotalAssets(userId: ID): number {
    return this.listByUserId(userId)
      .filter((acc) => acc.type !== 'credit-card' || acc.balance > 0)
      .reduce((sum, acc) => sum + Math.max(0, acc.balance), 0);
  }

  getTotalLiabilities(userId: ID): number {
    return this.listByUserId(userId)
      .filter((acc) => acc.type === 'credit-card')
      .reduce((sum, acc) => sum + Math.abs(Math.min(0, acc.balance)), 0);
  }
}

import { InMemoryStorage } from '../storage';
import {
  Budget,
  CreateBudgetInput,
  UpdateBudgetInput,
  ID,
  BudgetProgress,
  TransactionCategory,
} from '../types';
import { createBaseEntity, now, roundAmount, getPeriodRange, calculatePercentage } from '../utils';
import { DEFAULT_CURRENCY } from '../constants';
import { TransactionModule } from './TransactionModule';

export class BudgetModule {
  private storage: InMemoryStorage;
  private transactions: TransactionModule;

  constructor(storage: InMemoryStorage, transactions: TransactionModule) {
    this.storage = storage;
    this.transactions = transactions;
  }

  create(input: CreateBudgetInput): Budget {
    if (!input.userId) {
      throw new Error('用户ID不能为空');
    }
    if (!input.name || input.name.trim().length === 0) {
      throw new Error('预算名称不能为空');
    }
    if (!input.amount || input.amount <= 0) {
      throw new Error('预算金额必须大于0');
    }

    const startDate = input.startDate ?? now();
    const { endDate } = getPeriodRange(input.period, startDate);

    const budget: Budget = {
      ...createBaseEntity(),
      userId: input.userId,
      name: input.name.trim(),
      period: input.period,
      amount: roundAmount(input.amount),
      currency: input.currency ?? DEFAULT_CURRENCY,
      category: input.category,
      categories: input.categories,
      accountId: input.accountId,
      startDate,
      endDate,
      rollover: input.rollover ?? false,
      alertThreshold: input.alertThreshold ?? 80,
      isActive: true,
    };

    this.storage.budgets.set(budget.id, budget);
    return budget;
  }

  createMonthlyBudget(
    input: Omit<CreateBudgetInput, 'period'>
  ): Budget {
    return this.create({ ...input, period: 'monthly' });
  }

  createCategoryBudget(
    input: Omit<CreateBudgetInput, 'period' | 'category'> & {
      category: TransactionCategory;
    }
  ): Budget {
    return this.create({
      ...input,
      period: 'monthly',
      category: input.category,
    });
  }

  getById(id: ID): Budget | null {
    return this.storage.budgets.get(id) ?? null;
  }

  getByIdOrThrow(id: ID): Budget {
    const budget = this.getById(id);
    if (!budget) {
      throw new Error(`预算不存在: ${id}`);
    }
    return budget;
  }

  listByUser(userId: ID, includeInactive: boolean = false): Budget[] {
    return Array.from(this.storage.budgets.values()).filter(
      (b) => b.userId === userId && (includeInactive || b.isActive !== false)
    );
  }

  listActive(userId: ID, referenceDate: number = now()): Budget[] {
    return this.listByUser(userId).filter(
      (b) => b.startDate <= referenceDate && b.endDate >= referenceDate
    );
  }

  listByCategory(
    userId: ID,
    category: TransactionCategory,
    includeInactive: boolean = false
  ): Budget[] {
    return this.listByUser(userId, includeInactive).filter(
      (b) => b.category === category || (b.categories && b.categories.includes(category))
    );
  }

  update(id: ID, input: UpdateBudgetInput): Budget {
    const budget = this.getByIdOrThrow(id);
    const updated: Budget = {
      ...budget,
      ...input,
      amount: input.amount !== undefined ? roundAmount(input.amount) : budget.amount,
      updatedAt: now(),
    };
    this.storage.budgets.set(id, updated);
    return updated;
  }

  rollover(id: ID): Budget {
    const budget = this.getByIdOrThrow(id);
    const progress = this.getProgress(id);
    const rolledOverAmount = progress.remainingAmount > 0 ? progress.remainingAmount : 0;
    const newAmount = budget.amount + rolledOverAmount;
    return this.update(id, { amount: newAmount });
  }

  deactivate(id: ID): Budget {
    return this.update(id, { isActive: false });
  }

  activate(id: ID): Budget {
    return this.update(id, { isActive: true });
  }

  delete(id: ID): boolean {
    return this.storage.budgets.delete(id);
  }

  getProgress(id: ID, referenceDate: number = now()): BudgetProgress {
    const budget = this.getByIdOrThrow(id);

    let spentAmount = 0;
    const expenseTypes = ['expense'];
    let categories: TransactionCategory[] | undefined;

    if (budget.category) {
      categories = [budget.category];
    } else if (budget.categories && budget.categories.length > 0) {
      categories = budget.categories;
    }

    const txs = this.transactions.listByUser(budget.userId, {
      startDate: budget.startDate,
      endDate: Math.min(budget.endDate, referenceDate),
      types: expenseTypes as any,
      categories,
      accountId: budget.accountId,
    });

    spentAmount = txs.reduce((sum, tx) => sum + tx.amount, 0);

    const remainingAmount = budget.amount - spentAmount;
    const percentage = calculatePercentage(spentAmount, budget.amount);
    const isOverBudget = spentAmount > budget.amount;
    const isAlertTriggered = budget.alertThreshold !== undefined
      ? percentage >= budget.alertThreshold
      : false;

    return {
      budgetId: budget.id,
      name: budget.name,
      period: budget.period,
      budgetAmount: budget.amount,
      spentAmount: roundAmount(spentAmount),
      remainingAmount: roundAmount(remainingAmount),
      percentage,
      isOverBudget,
      alertThreshold: budget.alertThreshold,
      isAlertTriggered,
    };
  }

  getAllProgress(userId: ID, referenceDate: number = now()): BudgetProgress[] {
    const budgets = this.listActive(userId, referenceDate);
    return budgets.map((b) => this.getProgress(b.id, referenceDate));
  }

  getAlertBudgets(userId: ID, referenceDate: number = now()): BudgetProgress[] {
    return this.getAllProgress(userId, referenceDate).filter((p) => p.isAlertTriggered);
  }

  getOverBudget(userId: ID, referenceDate: number = now()): BudgetProgress[] {
    return this.getAllProgress(userId, referenceDate).filter((p) => p.isOverBudget);
  }

  renewBudget(id: ID): Budget {
    const old = this.getByIdOrThrow(id);
    const { startDate, endDate } = getPeriodRange(old.period, now());

    const newBudget: Budget = {
      ...createBaseEntity(),
      userId: old.userId,
      name: old.name,
      period: old.period,
      amount: old.amount,
      currency: old.currency,
      category: old.category,
      categories: old.categories,
      accountId: old.accountId,
      startDate,
      endDate,
      rollover: old.rollover,
      alertThreshold: old.alertThreshold,
      isActive: true,
    };

    if (old.rollover) {
      const progress = this.getProgress(old.id);
      if (progress.remainingAmount > 0) {
        newBudget.amount = roundAmount(newBudget.amount + progress.remainingAmount);
      }
    }

    this.deactivate(old.id);
    this.storage.budgets.set(newBudget.id, newBudget);
    return newBudget;
  }
}

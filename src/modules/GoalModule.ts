import { InMemoryStorage } from '../storage';
import {
  Goal,
  CreateGoalInput,
  UpdateGoalInput,
  ID,
  GoalProgress,
  GoalContribution,
  GoalStatus,
} from '../types';
import {
  createBaseEntity,
  now,
  roundAmount,
  daysBetween,
  calculatePercentage,
  isAfter,
  addFrequency,
} from '../utils';
import { DEFAULT_CURRENCY, MS_PER_MONTH, MS_PER_DAY } from '../constants';
import { TransactionModule } from './TransactionModule';
import { AccountModule } from './AccountModule';

export class GoalModule {
  private storage: InMemoryStorage;
  private transactions: TransactionModule;
  private accounts: AccountModule;

  constructor(
    storage: InMemoryStorage,
    transactions: TransactionModule,
    accounts: AccountModule
  ) {
    this.storage = storage;
    this.transactions = transactions;
    this.accounts = accounts;
  }

  create(input: CreateGoalInput): Goal {
    if (!input.userId) {
      throw new Error('用户ID不能为空');
    }
    if (!input.name || input.name.trim().length === 0) {
      throw new Error('目标名称不能为空');
    }
    if (!input.targetAmount || input.targetAmount <= 0) {
      throw new Error('目标金额必须大于0');
    }
    if (input.deadline && input.deadline <= (input.startDate ?? now())) {
      throw new Error('目标截止日期必须晚于开始日期');
    }

    const initialAmount = roundAmount(input.initialAmount ?? 0);

    const goal: Goal = {
      ...createBaseEntity(),
      userId: input.userId,
      name: input.name.trim(),
      description: input.description,
      targetAmount: roundAmount(input.targetAmount),
      currentAmount: initialAmount,
      currency: input.currency ?? DEFAULT_CURRENCY,
      deadline: input.deadline,
      startDate: input.startDate ?? now(),
      category: input.category,
      icon: input.icon,
      color: input.color,
      status: 'active',
      linkedAccountId: input.linkedAccountId,
      contributors: input.contributors,
      priority: input.priority,
      autoContribute: input.autoContribute
        ? {
            enabled: input.autoContribute.enabled,
            amount: input.autoContribute.amount,
            frequency: input.autoContribute.frequency,
            sourceAccountId: input.autoContribute.sourceAccountId,
            nextContributionDate: input.autoContribute.enabled
              ? addFrequency(now(), input.autoContribute.frequency)
              : undefined,
          }
        : undefined,
    };

    this.storage.goals.set(goal.id, goal);
    this.storage.goalContributions.set(goal.id, []);

    if (initialAmount > 0) {
      this.addContribution({
        goalId: goal.id,
        userId: goal.userId,
        amount: initialAmount,
        note: '初始存款',
      });
    }

    return goal;
  }

  createSavingsGoal(
    input: Omit<CreateGoalInput, 'category'> & {
      linkedAccountId: ID;
    }
  ): Goal {
    return this.create({
      ...input,
      category: 'savings',
      linkedAccountId: input.linkedAccountId,
    });
  }

  getById(id: ID): Goal | null {
    return this.storage.goals.get(id) ?? null;
  }

  getByIdOrThrow(id: ID): Goal {
    const goal = this.getById(id);
    if (!goal) {
      throw new Error(`目标不存在: ${id}`);
    }
    return goal;
  }

  listByUser(userId: ID, includeCancelled: boolean = false): Goal[] {
    return Array.from(this.storage.goals.values()).filter(
      (g) =>
        g.userId === userId &&
        (includeCancelled || g.status !== 'cancelled')
    );
  }

  listByStatus(userId: ID, status: GoalStatus): Goal[] {
    return this.listByUser(userId).filter((g) => g.status === status);
  }

  listActive(userId: ID): Goal[] {
    return this.listByStatus(userId, 'active');
  }

  listCompleted(userId: ID): Goal[] {
    return this.listByStatus(userId, 'completed');
  }

  listByCategory(userId: ID, category: string): Goal[] {
    return this.listByUser(userId).filter((g) => g.category === category);
  }

  update(id: ID, input: UpdateGoalInput): Goal {
    const goal = this.getByIdOrThrow(id);
    const updated: Goal = {
      ...goal,
      ...input,
      targetAmount:
        input.targetAmount !== undefined
          ? roundAmount(input.targetAmount)
          : goal.targetAmount,
      updatedAt: now(),
      autoContribute: input.autoContribute
        ? {
            ...goal.autoContribute,
            ...input.autoContribute,
          }
        : goal.autoContribute,
    };
    this.storage.goals.set(id, updated);
    return updated;
  }

  pause(id: ID): Goal {
    return this.update(id, { status: 'paused' });
  }

  resume(id: ID): Goal {
    return this.update(id, { status: 'active' });
  }

  complete(id: ID): Goal {
    return this.update(id, { status: 'completed' });
  }

  cancel(id: ID): Goal {
    return this.update(id, { status: 'cancelled' });
  }

  delete(id: ID): boolean {
    this.storage.goalContributions.delete(id);
    return this.storage.goals.delete(id);
  }

  addContribution(input: {
    goalId: ID;
    userId: ID;
    amount: number;
    note?: string;
    transactionId?: ID;
    sourceAccountId?: ID;
    isAutoContribution?: boolean;
  }): GoalContribution {
    const goal = this.getByIdOrThrow(input.goalId);

    if (goal.status === 'completed' || goal.status === 'cancelled') {
      throw new Error(`当前目标状态为 ${goal.status}，无法添加存款`);
    }

    const amount = roundAmount(input.amount);
    if (amount <= 0) {
      throw new Error('存款金额必须大于0');
    }

    const contribution: GoalContribution = {
      ...createBaseEntity(),
      goalId: input.goalId,
      userId: input.userId,
      amount,
      currency: goal.currency,
      note: input.note,
      transactionId: input.transactionId,
      isAutoContribution: input.isAutoContribution ?? false,
    };

    const contributions = this.storage.goalContributions.get(input.goalId) ?? [];
    contributions.push(contribution);
    this.storage.goalContributions.set(input.goalId, contributions);

    goal.currentAmount = roundAmount(goal.currentAmount + amount);
    if (goal.currentAmount >= goal.targetAmount && goal.status === 'active') {
      goal.status = 'completed';
    }
    goal.updatedAt = now();
    this.storage.goals.set(input.goalId, goal);

    if (input.sourceAccountId) {
      this.accounts.adjustBalance(input.sourceAccountId, -amount);
    }

    return contribution;
  }

  withdrawContribution(input: {
    goalId: ID;
    userId: ID;
    amount: number;
    note?: string;
    targetAccountId?: ID;
  }): GoalContribution {
    const goal = this.getByIdOrThrow(input.goalId);
    const amount = roundAmount(input.amount);

    if (amount <= 0) {
      throw new Error('取款金额必须大于0');
    }
    if (amount > goal.currentAmount) {
      throw new Error('取款金额不能超过当前存款');
    }

    const contribution: GoalContribution = {
      ...createBaseEntity(),
      goalId: input.goalId,
      userId: input.userId,
      amount: -amount,
      currency: goal.currency,
      note: input.note ?? '取款',
    };

    const contributions = this.storage.goalContributions.get(input.goalId) ?? [];
    contributions.push(contribution);
    this.storage.goalContributions.set(input.goalId, contributions);

    goal.currentAmount = roundAmount(goal.currentAmount - amount);
    if (goal.currentAmount < goal.targetAmount && goal.status === 'completed') {
      goal.status = 'active';
    }
    goal.updatedAt = now();
    this.storage.goals.set(input.goalId, goal);

    if (input.targetAccountId) {
      this.accounts.adjustBalance(input.targetAccountId, amount);
    }

    return contribution;
  }

  getContributions(goalId: ID): GoalContribution[] {
    const contributions = this.storage.goalContributions.get(goalId) ?? [];
    return contributions.sort((a, b) => b.createdAt - a.createdAt);
  }

  getRecentContributions(goalId: ID, limit: number = 10): GoalContribution[] {
    return this.getContributions(goalId).slice(0, limit);
  }

  getProgress(id: ID, referenceDate: number = now()): GoalProgress {
    const goal = this.getByIdOrThrow(id);

    const remainingAmount = roundAmount(
      Math.max(0, goal.targetAmount - goal.currentAmount)
    );
    const percentage = calculatePercentage(goal.currentAmount, goal.targetAmount);

    let daysRemaining: number | undefined;
    let dailyRequiredAmount: number | undefined;
    let monthlyRequiredAmount: number | undefined;
    let isOnTrack = true;
    let estimatedCompletionDate: number | undefined;

    if (goal.deadline) {
      daysRemaining = Math.max(0, daysBetween(referenceDate, goal.deadline));
      if (daysRemaining > 0 && remainingAmount > 0) {
        dailyRequiredAmount = roundAmount(remainingAmount / daysRemaining);
        monthlyRequiredAmount = roundAmount(
          remainingAmount / Math.max(1, daysRemaining / 30)
        );
      }
    }

    if (goal.status === 'active') {
      const elapsedDays = daysBetween(goal.startDate, referenceDate);
      if (elapsedDays > 0 && goal.deadline) {
        const totalDays = daysBetween(goal.startDate, goal.deadline);
        const expectedProgress = (elapsedDays / totalDays) * 100;
        isOnTrack = percentage >= expectedProgress * 0.9;
      }

      const history = this.getContributions(id).filter((c) => c.amount > 0);
      if (history.length > 1 && remainingAmount > 0) {
        const totalDays = Math.max(1, daysBetween(history[history.length - 1].createdAt, now()));
        const totalSaved = history.reduce((sum, c) => sum + c.amount, 0);
        const avgDailySave = totalSaved / totalDays;
        if (avgDailySave > 0) {
          const daysNeeded = remainingAmount / avgDailySave;
          estimatedCompletionDate = now() + daysNeeded * MS_PER_DAY;
        }
      }
    }

    return {
      goalId: goal.id,
      name: goal.name,
      targetAmount: goal.targetAmount,
      currentAmount: roundAmount(goal.currentAmount),
      remainingAmount,
      percentage,
      daysRemaining,
      dailyRequiredAmount,
      monthlyRequiredAmount,
      isOnTrack,
      estimatedCompletionDate,
      status: goal.status,
    };
  }

  calculateGap(id: ID, referenceDate: number = now()): {
    remainingAmount: number;
    daysRemaining: number;
    dailyRequired: number;
    weeklyRequired: number;
    monthlyRequired: number;
  } {
    const goal = this.getByIdOrThrow(id);
    const progress = this.getProgress(id, referenceDate);

    const days = progress.daysRemaining ?? 0;
    const remaining = progress.remainingAmount;

    return {
      remainingAmount: remaining,
      daysRemaining: days,
      dailyRequired: days > 0 ? roundAmount(remaining / days) : remaining,
      weeklyRequired: days > 0 ? roundAmount((remaining / days) * 7) : remaining,
      monthlyRequired: days > 0 ? roundAmount((remaining / days) * 30) : remaining,
    };
  }

  getAllProgress(userId: ID, referenceDate: number = now()): GoalProgress[] {
    return this.listByUser(userId).map((g) => this.getProgress(g.id, referenceDate));
  }

  getActiveGoalsTotal(userId: ID): {
    count: number;
    totalTarget: number;
    totalSaved: number;
    overallPercentage: number;
  } {
    const active = this.listActive(userId);
    const totalTarget = active.reduce((sum, g) => sum + g.targetAmount, 0);
    const totalSaved = active.reduce((sum, g) => sum + g.currentAmount, 0);
    return {
      count: active.length,
      totalTarget: roundAmount(totalTarget),
      totalSaved: roundAmount(totalSaved),
      overallPercentage: calculatePercentage(totalSaved, totalTarget),
    };
  }

  processAutoContribute(referenceTime: number = now()): GoalContribution[] {
    const contributions: GoalContribution[] = [];

    this.storage.goals.forEach((goal) => {
      if (
        goal.status === 'active' &&
        goal.autoContribute?.enabled &&
        goal.autoContribute.nextContributionDate &&
        goal.autoContribute.nextContributionDate <= referenceTime
      ) {
        try {
          const contribution = this.addContribution({
            goalId: goal.id,
            userId: goal.userId,
            amount: goal.autoContribute.amount,
            note: '自动存款',
            sourceAccountId: goal.autoContribute.sourceAccountId,
            isAutoContribution: true,
          });
          contributions.push(contribution);

          goal.autoContribute.nextContributionDate = addFrequency(
            goal.autoContribute.nextContributionDate,
            goal.autoContribute.frequency
          );
          goal.updatedAt = now();
          this.storage.goals.set(goal.id, goal);
        } catch (e) {
          // Skip if insufficient balance
        }
      }
    });

    return contributions;
  }

  getTopPriorityGoals(userId: ID, limit: number = 3): Goal[] {
    return this.listActive(userId)
      .sort((a, b) => {
        const priorityDiff = (b.priority ?? 0) - (a.priority ?? 0);
        if (priorityDiff !== 0) return priorityDiff;
        return (a.deadline ?? Infinity) - (b.deadline ?? Infinity);
      })
      .slice(0, limit);
  }
}

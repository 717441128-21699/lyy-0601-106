import { InMemoryStorage } from '../storage';
import {
  Reminder,
  CreateReminderInput,
  UpdateReminderInput,
  ID,
  ReminderStatus,
  ReminderType,
} from '../types';
import { createBaseEntity, now, roundAmount, isBefore, addDays, addFrequency, daysBetween } from '../utils';
import { SplitModule } from './SplitModule';

export class ReminderModule {
  private storage: InMemoryStorage;
  private splits: SplitModule;

  constructor(storage: InMemoryStorage, splits: SplitModule) {
    this.storage = storage;
    this.splits = splits;
  }

  create(input: CreateReminderInput): Reminder {
    if (!input.userId) {
      throw new Error('用户ID不能为空');
    }
    if (!input.title || input.title.trim().length === 0) {
      throw new Error('提醒标题不能为空');
    }
    if (!input.dueDate) {
      throw new Error('截止日期不能为空');
    }
    if (input.isRecurring && !input.recurrenceFrequency) {
      throw new Error('重复提醒必须指定重复频率');
    }

    const reminder: Reminder = {
      ...createBaseEntity(),
      userId: input.userId,
      type: input.type,
      title: input.title.trim(),
      description: input.description,
      amount: input.amount,
      currency: input.currency as any,
      dueDate: input.dueDate,
      isRecurring: input.isRecurring ?? false,
      recurrenceFrequency: input.recurrenceFrequency,
      recurrenceEndDate: input.recurrenceEndDate,
      transactionId: input.transactionId,
      splitId: input.splitId,
      goalId: input.goalId,
      accountId: input.accountId,
      remindBeforeDays: input.remindBeforeDays ?? 3,
      status: 'pending',
      tags: input.tags,
    };

    this.storage.reminders.set(reminder.id, reminder);
    return reminder;
  }

  createBillReminder(input: {
    userId: ID;
    title: string;
    description?: string;
    amount: number;
    currency?: string;
    dueDate: number;
    accountId?: ID;
    isRecurring?: boolean;
    recurrenceFrequency?: any;
    recurrenceEndDate?: number;
    remindBeforeDays?: number;
    tags?: string[];
  }): Reminder {
    return this.create({
      ...input,
      type: 'bill',
      currency: input.currency as any,
      recurrenceFrequency: input.recurrenceFrequency,
    });
  }

  createRepaymentReminder(input: {
    userId: ID;
    title: string;
    description?: string;
    amount: number;
    currency?: string;
    dueDate: number;
    splitId: ID;
    remindBeforeDays?: number;
    tags?: string[];
  }): Reminder {
    return this.create({
      ...input,
      type: 'repayment',
      currency: input.currency as any,
    });
  }

  createSavingsReminder(input: {
    userId: ID;
    title: string;
    description?: string;
    amount: number;
    currency?: string;
    dueDate: number;
    goalId?: ID;
    isRecurring?: boolean;
    recurrenceFrequency?: any;
    recurrenceEndDate?: number;
    remindBeforeDays?: number;
    tags?: string[];
  }): Reminder {
    return this.create({
      ...input,
      type: 'savings',
      currency: input.currency as any,
      recurrenceFrequency: input.recurrenceFrequency,
    });
  }

  createRepaymentRemindersFromSplit(splitId: ID): Reminder[] {
    const split = this.splits.getByIdOrThrow(splitId);
    const reminders: Reminder[] = [];

    split.participants.forEach((p) => {
      if (p.userId !== split.paidBy && p.status !== 'paid' && p.status !== 'settled') {
        const remaining = roundAmount(p.amount - p.paidAmount);
        if (remaining <= 0) return;

        const reminder = this.createRepaymentReminder({
          userId: p.userId,
          title: `还款提醒: ${split.name}`,
          description: `请向 ${split.paidBy} 支付 ¥${remaining}`,
          amount: remaining,
          currency: split.currency,
          dueDate: split.dueDate ?? addDays(now(), 7).getTime(),
          splitId: split.id,
        });
        reminders.push(reminder);
      }
    });

    return reminders;
  }

  getById(id: ID): Reminder | null {
    return this.storage.reminders.get(id) ?? null;
  }

  getByIdOrThrow(id: ID): Reminder {
    const reminder = this.getById(id);
    if (!reminder) {
      throw new Error(`提醒不存在: ${id}`);
    }
    return reminder;
  }

  listByUser(
    userId: ID,
    options?: {
      status?: ReminderStatus;
      type?: ReminderType;
      startDate?: number;
      endDate?: number;
      includePast?: boolean;
    }
  ): Reminder[] {
    let result = Array.from(this.storage.reminders.values()).filter(
      (r) => r.userId === userId
    );

    if (options?.status) {
      result = result.filter((r) => r.status === options.status);
    }
    if (options?.type) {
      result = result.filter((r) => r.type === options.type);
    }
    if (options?.startDate) {
      result = result.filter((r) => r.dueDate >= options.startDate!);
    }
    if (options?.endDate) {
      result = result.filter((r) => r.dueDate <= options.endDate!);
    }
    if (options?.includePast === false) {
      result = result.filter((r) => r.dueDate >= now());
    }

    return result.sort((a, b) => a.dueDate - b.dueDate);
  }

  listPending(userId: ID, limit?: number): Reminder[] {
    const pending = this.listByUser(userId, {
      status: 'pending',
      includePast: false,
    });
    return limit ? pending.slice(0, limit) : pending;
  }

  listDueSoon(
    userId: ID,
    days: number = 7,
    limit?: number
  ): Reminder[] {
    const endDate = addDays(now(), days).getTime();
    const dueSoon = this.listByUser(userId, {
      status: 'pending',
      endDate,
      includePast: false,
    });
    return limit ? dueSoon.slice(0, limit) : dueSoon;
  }

  listOverdue(userId: ID): Reminder[] {
    return this.listByUser(userId, { status: 'pending' }).filter(
      (r) => isBefore(r.dueDate, now())
    );
  }

  listBySplit(splitId: ID): Reminder[] {
    return Array.from(this.storage.reminders.values()).filter(
      (r) => r.splitId === splitId
    );
  }

  listByGoal(goalId: ID): Reminder[] {
    return Array.from(this.storage.reminders.values()).filter(
      (r) => r.goalId === goalId
    );
  }

  update(id: ID, input: UpdateReminderInput): Reminder {
    const reminder = this.getByIdOrThrow(id);
    const updated: Reminder = {
      ...reminder,
      ...input,
      updatedAt: now(),
    };
    this.storage.reminders.set(id, updated);
    return updated;
  }

  markAsSent(id: ID, notifiedAt: number = now()): Reminder {
    return this.update(id, { status: 'sent', notifiedAt });
  }

  markAsCompleted(id: ID): Reminder {
    return this.update(id, { status: 'completed' });
  }

  dismiss(id: ID): Reminder {
    return this.update(id, { status: 'dismissed' });
  }

  snooze(id: ID, days: number = 1): Reminder {
    const reminder = this.getByIdOrThrow(id);
    return this.update(id, {
      dueDate: addDays(reminder.dueDate, days).getTime(),
      status: 'pending',
    });
  }

  delete(id: ID): boolean {
    return this.storage.reminders.delete(id);
  }

  checkDueReminders(referenceTime: number = now()): {
    toNotify: Reminder[];
    overdue: Reminder[];
  } {
    const toNotify: Reminder[] = [];
    const overdue: Reminder[] = [];

    this.storage.reminders.forEach((reminder) => {
      if (reminder.status !== 'pending') return;

      const remindDate = addDays(
        reminder.dueDate,
        -(reminder.remindBeforeDays ?? 3)
      ).getTime();

      if (
        referenceTime >= remindDate &&
        referenceTime < reminder.dueDate &&
        (!reminder.notifiedAt || reminder.status === 'pending')
      ) {
        toNotify.push(reminder);
      }

      if (isBefore(reminder.dueDate, referenceTime)) {
        overdue.push(reminder);
      }
    });

    return { toNotify, overdue };
  }

  processRecurringReminders(referenceTime: number = now()): Reminder[] {
    const newReminders: Reminder[] = [];

    this.storage.reminders.forEach((reminder) => {
      if (
        reminder.isRecurring &&
        reminder.recurrenceFrequency &&
        (reminder.status === 'completed' || reminder.status === 'sent') &&
        (!reminder.recurrenceEndDate ||
          isBefore(reminder.dueDate, reminder.recurrenceEndDate))
      ) {
        const nextDueDate = addFrequency(
          reminder.dueDate,
          reminder.recurrenceFrequency
        );

        if (nextDueDate <= referenceTime) {
          const newReminder: Reminder = {
            ...createBaseEntity(),
            userId: reminder.userId,
            type: reminder.type,
            title: reminder.title,
            description: reminder.description,
            amount: reminder.amount,
            currency: reminder.currency,
            dueDate: nextDueDate,
            isRecurring: true,
            recurrenceFrequency: reminder.recurrenceFrequency,
            recurrenceEndDate: reminder.recurrenceEndDate,
            splitId: reminder.splitId,
            goalId: reminder.goalId,
            accountId: reminder.accountId,
            remindBeforeDays: reminder.remindBeforeDays,
            status: 'pending',
            tags: reminder.tags,
          };
          this.storage.reminders.set(newReminder.id, newReminder);
          newReminders.push(newReminder);

          reminder.isRecurring = false;
          reminder.updatedAt = now();
          this.storage.reminders.set(reminder.id, reminder);
        }
      }
    });

    return newReminders;
  }

  getReminderSummary(userId: ID): {
    pendingCount: number;
    overdueCount: number;
    dueSoonCount: number;
    totalAmountDue: number;
    overdueAmount: number;
  } {
    const pending = this.listPending(userId);
    const overdue = this.listOverdue(userId);
    const dueSoon = this.listDueSoon(userId, 7);

    return {
      pendingCount: pending.length,
      overdueCount: overdue.length,
      dueSoonCount: dueSoon.length,
      totalAmountDue: pending.reduce((sum, r) => sum + (r.amount ?? 0), 0),
      overdueAmount: overdue.reduce((sum, r) => sum + (r.amount ?? 0), 0),
    };
  }
}

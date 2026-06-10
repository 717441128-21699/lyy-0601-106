import {
  StorageAdapter,
  Account,
  Transaction,
  Budget,
  Goal,
  GoalContribution,
  Split,
  Reminder,
  RecurrenceRule,
  ID,
} from '../types';

export class InMemoryStorage implements StorageAdapter {
  accounts: Map<ID, Account>;
  transactions: Map<ID, Transaction>;
  budgets: Map<ID, Budget>;
  goals: Map<ID, Goal>;
  goalContributions: Map<ID, GoalContribution[]>;
  splits: Map<ID, Split>;
  reminders: Map<ID, Reminder>;
  recurrenceRules: Map<ID, RecurrenceRule>;

  constructor() {
    this.accounts = new Map();
    this.transactions = new Map();
    this.budgets = new Map();
    this.goals = new Map();
    this.goalContributions = new Map();
    this.splits = new Map();
    this.reminders = new Map();
    this.recurrenceRules = new Map();
  }

  clear(): void {
    this.accounts.clear();
    this.transactions.clear();
    this.budgets.clear();
    this.goals.clear();
    this.goalContributions.clear();
    this.splits.clear();
    this.reminders.clear();
    this.recurrenceRules.clear();
  }

  toJSON(): {
    accounts: Account[];
    transactions: Transaction[];
    budgets: Budget[];
    goals: Goal[];
    goalContributions: { goalId: ID; contributions: GoalContribution[] }[];
    splits: Split[];
    reminders: Reminder[];
    recurrenceRules: RecurrenceRule[];
  } {
    return {
      accounts: Array.from(this.accounts.values()),
      transactions: Array.from(this.transactions.values()),
      budgets: Array.from(this.budgets.values()),
      goals: Array.from(this.goals.values()),
      goalContributions: Array.from(this.goalContributions.entries()).map(
        ([goalId, contributions]) => ({ goalId, contributions })
      ),
      splits: Array.from(this.splits.values()),
      reminders: Array.from(this.reminders.values()),
      recurrenceRules: Array.from(this.recurrenceRules.values()),
    };
  }

  loadFromJSON(data: {
    accounts?: Account[];
    transactions?: Transaction[];
    budgets?: Budget[];
    goals?: Goal[];
    goalContributions?: { goalId: ID; contributions: GoalContribution[] }[];
    splits?: Split[];
    reminders?: Reminder[];
    recurrenceRules?: RecurrenceRule[];
  }): void {
    if (data.accounts) {
      this.accounts = new Map(data.accounts.map((a) => [a.id, a]));
    }
    if (data.transactions) {
      this.transactions = new Map(data.transactions.map((t) => [t.id, t]));
    }
    if (data.budgets) {
      this.budgets = new Map(data.budgets.map((b) => [b.id, b]));
    }
    if (data.goals) {
      this.goals = new Map(data.goals.map((g) => [g.id, g]));
    }
    if (data.goalContributions) {
      this.goalContributions = new Map(
        data.goalContributions.map((gc) => [gc.goalId, gc.contributions])
      );
    }
    if (data.splits) {
      this.splits = new Map(data.splits.map((s) => [s.id, s]));
    }
    if (data.reminders) {
      this.reminders = new Map(data.reminders.map((r) => [r.id, r]));
    }
    if (data.recurrenceRules) {
      this.recurrenceRules = new Map(
        data.recurrenceRules.map((rr) => [rr.id, rr])
      );
    }
  }
}

import { InMemoryStorage } from './storage';
import { AccountModule } from './modules/AccountModule';
import { TransactionModule } from './modules/TransactionModule';
import { BudgetModule } from './modules/BudgetModule';
import { GoalModule } from './modules/GoalModule';
import { SplitModule } from './modules/SplitModule';
import { ReminderModule } from './modules/ReminderModule';
import { ReportModule } from './modules/ReportModule';
import {
  ID,
  Account,
  CreateAccountInput,
  UpdateAccountInput,
  AccountType,
  Transaction,
  CreateTransactionInput,
  UpdateTransactionInput,
  TransactionType,
  TransactionCategory,
  RecurrenceRule,
  CreateRecurrenceRuleInput,
  Budget,
  CreateBudgetInput,
  UpdateBudgetInput,
  BudgetProgress,
  Goal,
  CreateGoalInput,
  UpdateGoalInput,
  GoalProgress,
  GoalContribution,
  GoalStatus,
  Split,
  CreateSplitInput,
  UpdateSplitParticipantInput,
  SplitStatus,
  Reminder,
  CreateReminderInput,
  UpdateReminderInput,
  ReminderStatus,
  ReminderType,
  CategoryBreakdown,
  CashflowTrend,
  GoalProgressReport,
  AnomalyDetection,
  DashboardSummary,
  ReportConfig,
} from './types';

export * from './types';
export * from './constants';
export { formatCurrency, formatDate, roundAmount, getPeriodRange, calculatePercentage } from './utils';

export interface FinanceSDKOptions {
  persistence?: {
    save: (data: any) => Promise<void> | void;
    load: () => Promise<any> | any;
    autoSave?: boolean;
  };
}

export class FinanceSDK {
  private storage: InMemoryStorage;
  private options?: FinanceSDKOptions;

  accounts: AccountModule;
  transactions: TransactionModule;
  budgets: BudgetModule;
  goals: GoalModule;
  splits: SplitModule;
  reminders: ReminderModule;
  reports: ReportModule;

  constructor(options?: FinanceSDKOptions) {
    this.storage = new InMemoryStorage();
    this.options = options;

    this.accounts = new AccountModule(this.storage);
    this.transactions = new TransactionModule(this.storage, this.accounts);
    this.budgets = new BudgetModule(this.storage, this.transactions);
    this.goals = new GoalModule(this.storage, this.transactions, this.accounts);
    this.splits = new SplitModule(this.storage);
    this.reminders = new ReminderModule(this.storage, this.splits);
    this.reports = new ReportModule(
      this.storage,
      this.accounts,
      this.transactions,
      this.budgets,
      this.goals,
      this.splits,
      this.reminders
    );
  }

  async init(): Promise<void> {
    if (this.options?.persistence?.load) {
      try {
        const data = await this.options.persistence.load();
        if (data) {
          this.storage.loadFromJSON(data);
        }
      } catch (e) {
        console.warn('[FinanceSDK] Failed to load persisted data:', e);
      }
    }
  }

  async save(): Promise<void> {
    if (this.options?.persistence?.save) {
      try {
        await this.options.persistence.save(this.storage.toJSON());
      } catch (e) {
        console.warn('[FinanceSDK] Failed to save data:', e);
      }
    }
  }

  processScheduledTasks(referenceTime: number = Date.now()): {
    recurringTransactions: Transaction[];
    autoContributions: GoalContribution[];
    recurringReminders: Reminder[];
    dueReminders: {
      toNotify: Reminder[];
      overdue: Reminder[];
    };
  } {
    const recurringTransactions = this.transactions.processRecurrenceRules(referenceTime);
    const autoContributions = this.goals.processAutoContribute(referenceTime);
    const recurringReminders = this.reminders.processRecurringReminders(referenceTime);
    const dueReminders = this.reminders.checkDueReminders(referenceTime);

    if (this.options?.persistence?.autoSave) {
      this.save();
    }

    return {
      recurringTransactions,
      autoContributions,
      recurringReminders,
      dueReminders,
    };
  }

  clearAll(): void {
    this.storage.clear();
  }

  exportData(): ReturnType<InMemoryStorage['toJSON']> {
    return this.storage.toJSON();
  }

  importData(data: Parameters<InMemoryStorage['loadFromJSON']>[0]): void {
    this.storage.loadFromJSON(data);
  }
}

export function createFinanceSDK(options?: FinanceSDKOptions): FinanceSDK {
  return new FinanceSDK(options);
}

export default FinanceSDK;

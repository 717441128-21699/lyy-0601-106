export type ID = string;

export type AccountType = 'cash' | 'e-wallet' | 'bank' | 'credit-card' | 'investment';

export type Currency = 'CNY' | 'USD' | 'EUR' | 'JPY' | 'HKD';

export type TransactionType = 'income' | 'expense' | 'transfer' | 'refund';

export type TransactionCategory =
  | 'food'
  | 'transport'
  | 'shopping'
  | 'entertainment'
  | 'housing'
  | 'medical'
  | 'education'
  | 'salary'
  | 'bonus'
  | 'investment'
  | 'savings'
  | 'gift'
  | 'utility'
  | 'subscription'
  | 'travel'
  | 'other';

export type BudgetPeriod = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export type RecurrenceFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';

export type GoalStatus = 'active' | 'paused' | 'completed' | 'cancelled';

export type SplitStatus = 'pending' | 'paid' | 'partial' | 'settled';

export type ReminderType = 'bill' | 'repayment' | 'savings' | 'goal' | 'custom';

export type ReminderStatus = 'pending' | 'sent' | 'dismissed' | 'completed';

export interface BaseEntity {
  id: ID;
  createdAt: number;
  updatedAt: number;
}

export interface Account extends BaseEntity {
  userId: ID;
  name: string;
  type: AccountType;
  balance: number;
  initialBalance: number;
  currency: Currency;
  icon?: string;
  color?: string;
  description?: string;
  isDefault?: boolean;
  creditLimit?: number;
  billingDate?: number;
  isArchived?: boolean;
}

export interface CreateAccountInput {
  userId: ID;
  name: string;
  type: AccountType;
  initialBalance?: number;
  currency?: Currency;
  icon?: string;
  color?: string;
  description?: string;
  isDefault?: boolean;
  creditLimit?: number;
  billingDate?: number;
}

export interface UpdateAccountInput {
  name?: string;
  type?: AccountType;
  currency?: Currency;
  icon?: string;
  color?: string;
  description?: string;
  isDefault?: boolean;
  creditLimit?: number;
  billingDate?: number;
  isArchived?: boolean;
}

export interface Transaction extends BaseEntity {
  userId: ID;
  type: TransactionType;
  amount: number;
  currency: Currency;
  accountId: ID;
  toAccountId?: ID;
  category: TransactionCategory;
  subCategory?: string;
  note?: string;
  tags?: string[];
  date: number;
  isRecurring?: boolean;
  recurrenceRuleId?: ID;
  splitId?: ID;
  refundOfId?: ID;
  isRefunded?: boolean;
  attachmentUrl?: string;
  location?: string;
}

export interface CreateTransactionInput {
  userId: ID;
  type: TransactionType;
  amount: number;
  currency?: Currency;
  accountId: ID;
  toAccountId?: ID;
  category: TransactionCategory;
  subCategory?: string;
  note?: string;
  tags?: string[];
  date?: number;
  isRecurring?: boolean;
  recurrenceRuleId?: ID;
  splitId?: ID;
  refundOfId?: ID;
  attachmentUrl?: string;
  location?: string;
}

export interface UpdateTransactionInput {
  type?: TransactionType;
  amount?: number;
  currency?: Currency;
  accountId?: ID;
  toAccountId?: ID;
  category?: TransactionCategory;
  subCategory?: string;
  note?: string;
  tags?: string[];
  date?: number;
  attachmentUrl?: string;
  location?: string;
}

export interface RecurrenceRule extends BaseEntity {
  userId: ID;
  frequency: RecurrenceFrequency;
  interval: number;
  startDate: number;
  endDate?: number;
  nextOccurrence: number;
  count?: number;
  occurrencesGenerated: number;
  transactionTemplate: Omit<CreateTransactionInput, 'date'>;
}

export interface CreateRecurrenceRuleInput {
  userId: ID;
  frequency: RecurrenceFrequency;
  interval?: number;
  startDate?: number;
  endDate?: number;
  count?: number;
  transactionTemplate: Omit<CreateTransactionInput, 'date'>;
}

export interface Budget extends BaseEntity {
  userId: ID;
  name: string;
  period: BudgetPeriod;
  amount: number;
  currency: Currency;
  category?: TransactionCategory;
  categories?: TransactionCategory[];
  accountId?: ID;
  startDate: number;
  endDate: number;
  rollover?: boolean;
  alertThreshold?: number;
  isActive?: boolean;
}

export interface CreateBudgetInput {
  userId: ID;
  name: string;
  period: BudgetPeriod;
  amount: number;
  currency?: Currency;
  category?: TransactionCategory;
  categories?: TransactionCategory[];
  accountId?: ID;
  startDate?: number;
  rollover?: boolean;
  alertThreshold?: number;
}

export interface UpdateBudgetInput {
  name?: string;
  amount?: number;
  alertThreshold?: number;
  rollover?: boolean;
  isActive?: boolean;
}

export interface BudgetProgress {
  budgetId: ID;
  name: string;
  period: BudgetPeriod;
  budgetAmount: number;
  spentAmount: number;
  remainingAmount: number;
  percentage: number;
  isOverBudget: boolean;
  alertThreshold?: number;
  isAlertTriggered: boolean;
}

export interface Goal extends BaseEntity {
  userId: ID;
  name: string;
  description?: string;
  targetAmount: number;
  currentAmount: number;
  currency: Currency;
  deadline?: number;
  startDate: number;
  category?: string;
  icon?: string;
  color?: string;
  status: GoalStatus;
  linkedAccountId?: ID;
  contributors?: ID[];
  priority?: number;
  autoContribute?: {
    enabled: boolean;
    amount: number;
    frequency: RecurrenceFrequency;
    sourceAccountId?: ID;
    nextContributionDate?: number;
  };
}

export interface CreateGoalInput {
  userId: ID;
  name: string;
  description?: string;
  targetAmount: number;
  initialAmount?: number;
  currency?: Currency;
  deadline?: number;
  startDate?: number;
  category?: string;
  icon?: string;
  color?: string;
  linkedAccountId?: ID;
  contributors?: ID[];
  priority?: number;
  autoContribute?: {
    enabled: boolean;
    amount: number;
    frequency: RecurrenceFrequency;
    sourceAccountId?: ID;
  };
}

export interface UpdateGoalInput {
  name?: string;
  description?: string;
  targetAmount?: number;
  currency?: Currency;
  deadline?: number;
  category?: string;
  icon?: string;
  color?: string;
  status?: GoalStatus;
  linkedAccountId?: ID;
  contributors?: ID[];
  priority?: number;
  autoContribute?: {
    enabled: boolean;
    amount: number;
    frequency: RecurrenceFrequency;
    sourceAccountId?: ID;
  };
}

export interface GoalContribution extends BaseEntity {
  goalId: ID;
  userId: ID;
  amount: number;
  currency: Currency;
  note?: string;
  transactionId?: ID;
  isAutoContribution?: boolean;
}

export interface GoalProgress {
  goalId: ID;
  name: string;
  targetAmount: number;
  currentAmount: number;
  remainingAmount: number;
  percentage: number;
  daysRemaining?: number;
  dailyRequiredAmount?: number;
  monthlyRequiredAmount?: number;
  isOnTrack: boolean;
  estimatedCompletionDate?: number;
  status: GoalStatus;
}

export interface Participant {
  userId: ID;
  userName?: string;
  userAvatar?: string;
  shareType: 'equal' | 'percentage' | 'fixed';
  shareValue?: number;
  amount: number;
  paidAmount: number;
  status: SplitStatus;
}

export interface Split extends BaseEntity {
  userId: ID;
  name: string;
  description?: string;
  totalAmount: number;
  currency: Currency;
  transactionId?: ID;
  participants: Participant[];
  paidBy: ID;
  status: SplitStatus;
  dueDate?: number;
  isSettlement?: boolean;
  discrepancy?: number;
  discrepancyNote?: string;
}

export interface CreateSplitInput {
  userId: ID;
  name: string;
  description?: string;
  totalAmount: number;
  currency?: Currency;
  transactionId?: ID;
  participants: Array<{
    userId: ID;
    userName?: string;
    userAvatar?: string;
    shareType: 'equal' | 'percentage' | 'fixed';
    shareValue?: number;
  }>;
  paidBy: ID;
  dueDate?: number;
  isSettlement?: boolean;
}

export interface UpdateSplitParticipantInput {
  paidAmount?: number;
  status?: SplitStatus;
}

export interface Reminder extends BaseEntity {
  userId: ID;
  type: ReminderType;
  title: string;
  description?: string;
  amount?: number;
  currency?: Currency;
  dueDate: number;
  isRecurring?: boolean;
  recurrenceFrequency?: RecurrenceFrequency;
  recurrenceEndDate?: number;
  transactionId?: ID;
  splitId?: ID;
  goalId?: ID;
  accountId?: ID;
  remindBeforeDays?: number;
  status: ReminderStatus;
  notifiedAt?: number;
  tags?: string[];
}

export interface CreateReminderInput {
  userId: ID;
  type: ReminderType;
  title: string;
  description?: string;
  amount?: number;
  currency?: Currency;
  dueDate: number;
  isRecurring?: boolean;
  recurrenceFrequency?: RecurrenceFrequency;
  recurrenceEndDate?: number;
  transactionId?: ID;
  splitId?: ID;
  goalId?: ID;
  accountId?: ID;
  remindBeforeDays?: number;
  tags?: string[];
}

export interface UpdateReminderInput {
  title?: string;
  description?: string;
  amount?: number;
  currency?: Currency;
  dueDate?: number;
  isRecurring?: boolean;
  recurrenceFrequency?: RecurrenceFrequency;
  recurrenceEndDate?: number;
  remindBeforeDays?: number;
  status?: ReminderStatus;
  tags?: string[];
  notifiedAt?: number;
}

export interface CategoryBreakdownItem {
  category: TransactionCategory;
  categoryName: string;
  amount: number;
  percentage: number;
  count: number;
}

export interface CategoryBreakdown {
  period: string;
  startDate: number;
  endDate: number;
  totalIncome: number;
  totalExpense: number;
  netAmount: number;
  incomeByCategory: CategoryBreakdownItem[];
  expenseByCategory: CategoryBreakdownItem[];
}

export interface CashflowPoint {
  date: string;
  timestamp: number;
  income: number;
  expense: number;
  net: number;
  balance: number;
}

export interface CashflowTrend {
  period: string;
  startDate: number;
  endDate: number;
  points: CashflowPoint[];
  totalIncome: number;
  totalExpense: number;
  netAmount: number;
  averageDailyIncome: number;
  averageDailyExpense: number;
}

export interface GoalProgressReport {
  goal: Goal;
  progress: GoalProgress;
  contributions: GoalContribution[];
  recentContributions: GoalContribution[];
}

export interface AnomalyDetection {
  transactionId: ID;
  type: TransactionType;
  category: TransactionCategory;
  amount: number;
  date: number;
  note?: string;
  anomalyType: 'unusual_amount' | 'frequency_spike' | 'out_of_category' | 'late_night';
  severity: 'low' | 'medium' | 'high';
  description: string;
  comparedToAverage: number;
}

export interface DashboardSummary {
  totalBalance: number;
  totalAssets: number;
  totalLiabilities: number;
  monthlyIncome: number;
  monthlyExpense: number;
  monthlyNet: number;
  monthlySavingsRate: number;
  activeGoalsCount: number;
  goalsTotalTarget: number;
  goalsTotalSaved: number;
  goalsProgressPercentage: number;
  upcomingReminders: Reminder[];
  pendingSplits: Split[];
  budgetAlerts: BudgetProgress[];
  anomalies: AnomalyDetection[];
}

export interface ReportConfig {
  userId: ID;
  startDate?: number;
  endDate?: number;
  accountIds?: ID[];
  categories?: TransactionCategory[];
}

export interface GoalMemberDetail {
  userId: ID;
  userName?: string;
  userAvatar?: string;
  totalContributed: number;
  contributionCount: number;
  lastContributionDate?: number;
  lastContributionAmount?: number;
  remainingShare?: number;
  estimatedCompletionDate?: number;
  rank: number;
}

export interface GoalCardData {
  goalId: ID;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  category?: string;
  status: GoalStatus;
  targetAmount: number;
  currentAmount: number;
  remainingAmount: number;
  percentage: number;
  deadline?: number;
  daysRemaining?: number;
  isOnTrack: boolean;
  dailyRequiredAmount?: number;
  monthlyRequiredAmount?: number;
  estimatedCompletionDate?: number;
  memberCount: number;
  memberLeaderboard: GoalMemberDetail[];
  recentContributions: GoalContribution[];
  currency: Currency;
}

export interface SplitDebtRelation {
  fromUserId: ID;
  fromUserName?: string;
  toUserId: ID;
  toUserName?: string;
  amount: number;
  splitIds: ID[];
  splitNames: string[];
}

export interface TransferSuggestion {
  fromUserId: ID;
  fromUserName?: string;
  toUserId: ID;
  toUserName?: string;
  amount: number;
  isConsolidated: boolean;
  relatedDebts: SplitDebtRelation[];
}

export interface SplitSettlementSummary {
  splitId: ID;
  splitName: string;
  totalAmount: number;
  currency: Currency;
  paidBy: ID;
  paidByName?: string;
  status: SplitStatus;
  debts: SplitDebtRelation[];
  remainingPerPerson: Array<{
    userId: ID;
    userName?: string;
    totalOwed: number;
    totalOwedTo: Array<{
      toUserId: ID;
      toUserName?: string;
      amount: number;
    }>;
  }>;
}

export interface UserSettlementSummary {
  userId: ID;
  totalOwedByMe: number;
  totalOwedToMe: number;
  netBalance: number;
  debts: SplitDebtRelation[];
  suggestedTransfers: TransferSuggestion[];
  perSplitSummaries: SplitSettlementSummary[];
}

export interface AccountCashflowSummary {
  accountId: ID;
  accountName: string;
  accountType: AccountType;
  currency: Currency;
  openingBalance: number;
  closingBalance: number;
  totalIncome: number;
  totalExpense: number;
  netAmount: number;
  incomeByCategory: CategoryBreakdownItem[];
  expenseByCategory: CategoryBreakdownItem[];
  transferInTotal: number;
  transferOutTotal: number;
  refundTotal: number;
  transferInCount: number;
  transferOutCount: number;
}

export interface GoalDimensionReport {
  goalId: ID;
  goalName: string;
  targetAmount: number;
  currentAmount: number;
  percentage: number;
  contributionsInPeriod: number;
  contributionCount: number;
  memberDetails: GoalMemberDetail[];
  linkedAccountId?: ID;
  linkedAccountName?: string;
}

export interface DimensionReport {
  byAccount: AccountCashflowSummary[];
  byCategory: CategoryBreakdown;
  byGoal: GoalDimensionReport[];
}

export interface StorageAdapter {
  accounts: Map<ID, Account>;
  transactions: Map<ID, Transaction>;
  budgets: Map<ID, Budget>;
  goals: Map<ID, Goal>;
  goalContributions: Map<ID, GoalContribution[]>;
  splits: Map<ID, Split>;
  reminders: Map<ID, Reminder>;
  recurrenceRules: Map<ID, RecurrenceRule>;
}

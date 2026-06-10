import { InMemoryStorage } from '../storage';
import {
  CategoryBreakdown,
  CategoryBreakdownItem,
  CashflowTrend,
  CashflowPoint,
  GoalProgressReport,
  AnomalyDetection,
  DashboardSummary,
  ReportConfig,
  TransactionCategory,
  ID,
  Transaction,
} from '../types';
import {
  now,
  roundAmount,
  calculatePercentage,
  groupBy,
  sumBy,
  averageBy,
  standardDeviation,
  isLateNight,
  getMonthlyRange,
  getPeriodRange,
  formatDate,
  isInDateRange,
  daysBetween,
  addDays,
} from '../utils';
import { CATEGORY_NAMES, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../constants';
import { AccountModule } from './AccountModule';
import { TransactionModule } from './TransactionModule';
import { BudgetModule } from './BudgetModule';
import { GoalModule } from './GoalModule';
import { SplitModule } from './SplitModule';
import { ReminderModule } from './ReminderModule';

export class ReportModule {
  private storage: InMemoryStorage;
  private accounts: AccountModule;
  private transactions: TransactionModule;
  private budgets: BudgetModule;
  private goals: GoalModule;
  private splits: SplitModule;
  private reminders: ReminderModule;

  constructor(
    storage: InMemoryStorage,
    accounts: AccountModule,
    transactions: TransactionModule,
    budgets: BudgetModule,
    goals: GoalModule,
    splits: SplitModule,
    reminders: ReminderModule
  ) {
    this.storage = storage;
    this.accounts = accounts;
    this.transactions = transactions;
    this.budgets = budgets;
    this.goals = goals;
    this.splits = splits;
    this.reminders = reminders;
  }

  getCategoryBreakdown(config: ReportConfig): CategoryBreakdown {
    const { startDate, endDate } = this.getDateRange(config);
    const txs = this.transactions.listInDateRange(
      config.userId,
      startDate,
      endDate,
      config.accountIds
    );

    const incomeTxs = txs.filter(
      (t) => t.type === 'income' && this.matchesCategoryFilter(t, 'income', config.categories)
    );
    const expenseTxs = txs.filter(
      (t) => t.type === 'expense' && this.matchesCategoryFilter(t, 'expense', config.categories)
    );

    const totalIncome = sumBy(incomeTxs, (t) => t.amount);
    const totalExpense = sumBy(expenseTxs, (t) => t.amount);

    const incomeByCategory = this.buildCategoryBreakdownItems(
      incomeTxs,
      totalIncome,
      INCOME_CATEGORIES
    );
    const expenseByCategory = this.buildCategoryBreakdownItems(
      expenseTxs,
      totalExpense,
      EXPENSE_CATEGORIES
    );

    return {
      period: `${formatDate(startDate)} ~ ${formatDate(endDate)}`,
      startDate,
      endDate,
      totalIncome: roundAmount(totalIncome),
      totalExpense: roundAmount(totalExpense),
      netAmount: roundAmount(totalIncome - totalExpense),
      incomeByCategory,
      expenseByCategory,
    };
  }

  private matchesCategoryFilter(
    tx: Transaction,
    type: 'income' | 'expense',
    categories?: TransactionCategory[]
  ): boolean {
    if (!categories || categories.length === 0) return true;
    const validCategories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    return (
      categories.includes(tx.category) &&
      validCategories.includes(tx.category)
    );
  }

  private buildCategoryBreakdownItems(
    txs: Transaction[],
    total: number,
    allowedCategories: TransactionCategory[]
  ): CategoryBreakdownItem[] {
    const grouped = groupBy(txs, (t) => t.category);
    const items: CategoryBreakdownItem[] = [];

    Object.entries(grouped).forEach(([category, categoryTxs]) => {
      const cat = category as TransactionCategory;
      if (!allowedCategories.includes(cat)) return;

      const amount = sumBy(categoryTxs, (t) => t.amount);
      items.push({
        category: cat,
        categoryName: CATEGORY_NAMES[cat] ?? cat,
        amount: roundAmount(amount),
        percentage: calculatePercentage(amount, total),
        count: categoryTxs.length,
      });
    });

    return items.sort((a, b) => b.amount - a.amount);
  }

  getCashflowTrend(
    config: ReportConfig & {
      granularity?: 'daily' | 'weekly' | 'monthly';
    }
  ): CashflowTrend {
    const { startDate, endDate } = this.getDateRange(config);
    const granularity = config.granularity ?? 'daily';
    const txs = this.transactions.listInDateRange(
      config.userId,
      startDate,
      endDate,
      config.accountIds
    );

    const points: CashflowPoint[] = [];
    let currentPoint = startDate;
    const step = granularity === 'daily' ? 1 : granularity === 'weekly' ? 7 : 30;
    const stepMs = step * 24 * 60 * 60 * 1000;

    let runningBalance = 0;
    const periodStartTransactions = this.transactions.listInDateRange(
      config.userId,
      0,
      startDate - 1,
      config.accountIds
    );
    runningBalance = sumBy(periodStartTransactions, (t) => {
      if (t.type === 'income') return t.amount;
      if (t.type === 'expense') return -t.amount;
      return 0;
    });
    const initialAccountBalance = this.accounts.getTotalBalance(config.userId);

    while (currentPoint <= endDate) {
      const periodEnd = currentPoint + stepMs - 1;
      const periodTxs = txs.filter((t) => t.date >= currentPoint && t.date <= periodEnd);

      const income = sumBy(
        periodTxs.filter((t) => t.type === 'income'),
        (t) => t.amount
      );
      const expense = sumBy(
        periodTxs.filter((t) => t.type === 'expense'),
        (t) => t.amount
      );

      runningBalance += income - expense;

      points.push({
        date: formatDate(currentPoint, granularity === 'monthly' ? 'yyyy-MM' : 'yyyy-MM-dd'),
        timestamp: currentPoint,
        income: roundAmount(income),
        expense: roundAmount(expense),
        net: roundAmount(income - expense),
        balance: roundAmount(
          initialAccountBalance + runningBalance
        ),
      });

      currentPoint += stepMs;
    }

    const totalIncome = sumBy(
      txs.filter((t) => t.type === 'income'),
      (t) => t.amount
    );
    const totalExpense = sumBy(
      txs.filter((t) => t.type === 'expense'),
      (t) => t.amount
    );
    const totalDays = Math.max(1, daysBetween(startDate, endDate) + 1);

    return {
      period: `${formatDate(startDate)} ~ ${formatDate(endDate)}`,
      startDate,
      endDate,
      points,
      totalIncome: roundAmount(totalIncome),
      totalExpense: roundAmount(totalExpense),
      netAmount: roundAmount(totalIncome - totalExpense),
      averageDailyIncome: roundAmount(totalIncome / totalDays),
      averageDailyExpense: roundAmount(totalExpense / totalDays),
    };
  }

  getGoalProgressReports(userId: ID, goalIds?: ID[]): GoalProgressReport[] {
    const goals = goalIds && goalIds.length > 0
      ? goalIds.map((id) => this.goals.getByIdOrThrow(id))
      : this.goals.listByUser(userId);

    return goals.map((goal) => ({
      goal,
      progress: this.goals.getProgress(goal.id),
      contributions: this.goals.getContributions(goal.id),
      recentContributions: this.goals.getRecentContributions(goal.id, 5),
    }));
  }

  detectAnomalies(config: ReportConfig): AnomalyDetection[] {
    const { startDate, endDate } = this.getDateRange(config);
    const anomalies: AnomalyDetection[] = [];

    const txs = this.transactions
      .listInDateRange(config.userId, startDate, endDate, config.accountIds)
      .filter((t) => t.type === 'expense');

    const earlierStart = Math.max(0, startDate - 90 * 24 * 60 * 60 * 1000);
    const historicalTxs = this.transactions
      .listInDateRange(config.userId, earlierStart, startDate - 1, config.accountIds)
      .filter((t) => t.type === 'expense');

    const categoryStats: Record<string, { amounts: number[]; avg: number; std: number }> = {};
    const byHistoricalCategory = groupBy(historicalTxs, (t) => t.category);
    Object.entries(byHistoricalCategory).forEach(([cat, catTxs]) => {
      const amounts = catTxs.map((t) => t.amount);
      const avg = averageBy(catTxs, (t) => t.amount);
      const std = standardDeviation(amounts);
      categoryStats[cat] = { amounts, avg, std };
    });

    txs.forEach((tx) => {
      const stats = categoryStats[tx.category];
      if (stats && stats.std > 0) {
        const zScore = (tx.amount - stats.avg) / stats.std;
        if (zScore >= 2.5) {
          anomalies.push({
            transactionId: tx.id,
            type: tx.type,
            category: tx.category,
            amount: tx.amount,
            date: tx.date,
            note: tx.note,
            anomalyType: 'unusual_amount',
            severity: zScore >= 3.5 ? 'high' : 'medium',
            description: `该笔支出金额异常，超出${tx.category}平均水平的 ${Math.round(zScore)} 倍标准差`,
            comparedToAverage: roundAmount((tx.amount / (stats.avg || 1)) * 100),
          });
        }
      }

      if (isLateNight(tx.date)) {
        anomalies.push({
          transactionId: tx.id,
          type: tx.type,
          category: tx.category,
          amount: tx.amount,
          date: tx.date,
          note: tx.note,
          anomalyType: 'late_night',
          severity: 'low',
          description: '深夜消费，请注意账户安全',
          comparedToAverage: 0,
        });
      }
    });

    const recentTxs = txs.filter(
      (t) => t.date >= now() - 7 * 24 * 60 * 60 * 1000
    );
    const byCategoryRecent = groupBy(recentTxs, (t) => t.category);
    Object.entries(byCategoryRecent).forEach(([cat, catTxs]) => {
      const historicalCount = (byHistoricalCategory[cat] || []).length;
      const avgWeekly = historicalCount / Math.max(1, 90 / 7);
      if (catTxs.length > avgWeekly * 2 && avgWeekly >= 1) {
        catTxs.slice(0, 3).forEach((tx) => {
          if (!anomalies.find((a) => a.transactionId === tx.id)) {
            anomalies.push({
              transactionId: tx.id,
              type: tx.type,
              category: tx.category,
              amount: tx.amount,
              date: tx.date,
              note: tx.note,
              anomalyType: 'frequency_spike',
              severity: catTxs.length > avgWeekly * 3 ? 'high' : 'low',
              description: `${cat}类别本周消费频次异常，是平时的 ${Math.round(catTxs.length / avgWeekly)} 倍`,
              comparedToAverage: roundAmount((catTxs.length / avgWeekly) * 100),
            });
          }
        });
      }
    });

    return anomalies.sort((a, b) => {
      const severityOrder = { high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
  }

  getDashboardSummary(userId: ID, referenceDate: number = now()): DashboardSummary {
    const { startDate, endDate } = getMonthlyRange(referenceDate);

    const totalBalance = this.accounts.getTotalBalance(userId);
    const totalAssets = this.accounts.getTotalAssets(userId);
    const totalLiabilities = this.accounts.getTotalLiabilities(userId);

    const monthlyIncome = this.transactions.getTotalIncome(
      userId,
      startDate,
      endDate
    );
    const monthlyExpense = this.transactions.getTotalExpense(
      userId,
      startDate,
      endDate
    );
    const monthlyNet = monthlyIncome - monthlyExpense;
    const monthlySavingsRate = monthlyIncome > 0
      ? calculatePercentage(monthlyNet, monthlyIncome)
      : 0;

    const goalsTotal = this.goals.getActiveGoalsTotal(userId);
    const upcomingReminders = this.reminders.listDueSoon(userId, 7, 5);
    const pendingSplits = this.splits.listPending(userId).slice(0, 5);
    const budgetAlerts = this.budgets.getAlertBudgets(userId, referenceDate);
    const anomalies = this.detectAnomalies({
      userId,
      startDate,
      endDate,
    }).slice(0, 5);

    return {
      totalBalance: roundAmount(totalBalance),
      totalAssets: roundAmount(totalAssets),
      totalLiabilities: roundAmount(totalLiabilities),
      monthlyIncome: roundAmount(monthlyIncome),
      monthlyExpense: roundAmount(monthlyExpense),
      monthlyNet: roundAmount(monthlyNet),
      monthlySavingsRate,
      activeGoalsCount: goalsTotal.count,
      goalsTotalTarget: goalsTotal.totalTarget,
      goalsTotalSaved: goalsTotal.totalSaved,
      goalsProgressPercentage: goalsTotal.overallPercentage,
      upcomingReminders,
      pendingSplits,
      budgetAlerts,
      anomalies,
    };
  }

  getMonthlyReport(
    userId: ID,
    referenceDate: number = now()
  ): {
    summary: DashboardSummary;
    categoryBreakdown: CategoryBreakdown;
    cashflowTrend: CashflowTrend;
    goalReports: GoalProgressReport[];
    topExpenseCategories: CategoryBreakdownItem[];
    savingsRate: number;
  } {
    const { startDate, endDate } = getMonthlyRange(referenceDate);
    const config: ReportConfig = { userId, startDate, endDate };

    const summary = this.getDashboardSummary(userId, referenceDate);
    const categoryBreakdown = this.getCategoryBreakdown(config);
    const cashflowTrend = this.getCashflowTrend({ ...config, granularity: 'daily' });
    const goalReports = this.getGoalProgressReports(userId);

    return {
      summary,
      categoryBreakdown,
      cashflowTrend,
      goalReports,
      topExpenseCategories: categoryBreakdown.expenseByCategory.slice(0, 5),
      savingsRate: summary.monthlySavingsRate,
    };
  }

  exportReportData(config: ReportConfig) {
    const { startDate, endDate } = this.getDateRange(config);
    return {
      period: { startDate, endDate, label: `${formatDate(startDate)} ~ ${formatDate(endDate)}` },
      accounts: this.accounts.listByUserId(config.userId).map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        balance: a.balance,
        currency: a.currency,
      })),
      transactions: this.transactions.listInDateRange(
        config.userId,
        startDate,
        endDate,
        config.accountIds
      ),
      categoryBreakdown: this.getCategoryBreakdown(config),
      cashflowTrend: this.getCashflowTrend({ ...config, granularity: 'weekly' }),
    };
  }

  private getDateRange(config: ReportConfig): { startDate: number; endDate: number } {
    const endDate = config.endDate ?? now();
    const startDate = config.startDate ?? addDays(endDate, -30).getTime();
    return { startDate, endDate };
  }
}

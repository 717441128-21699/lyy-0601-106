import { createFinanceSDK, CreateAccountInput, CreateGoalInput, CreateTransactionInput } from '../src';

async function main() {
  const sdk = createFinanceSDK();
  await sdk.init();

  const USER_ID = 'user_001';

  console.log('=== 1. 创建账户 ===');
  const cashAccount = sdk.accounts.createCashAccount({
    userId: USER_ID,
    name: '我的钱包',
    initialBalance: 5000,
    isDefault: true,
    color: '#22C55E',
  });
  console.log('现金账户:', cashAccount.name, '余额:', cashAccount.balance);

  const ewalletAccount = sdk.accounts.createEWalletAccount({
    userId: USER_ID,
    name: '支付宝',
    initialBalance: 12000,
    color: '#3B82F6',
  });
  console.log('电子钱包:', ewalletAccount.name, '余额:', ewalletAccount.balance);

  const creditCard = sdk.accounts.createCreditCardAccount({
    userId: USER_ID,
    name: '招行信用卡',
    initialBalance: 0,
    creditLimit: 30000,
    billingDate: 10,
    color: '#EF4444',
  });
  console.log('信用卡:', creditCard.name, '额度:', creditCard.creditLimit);

  console.log('\n=== 2. 记录交易流水 ===');
  const salary = sdk.transactions.recordIncome({
    userId: USER_ID,
    accountId: ewalletAccount.id,
    amount: 15000,
    category: 'salary',
    note: '6月工资',
    tags: ['工资', '月入'],
  });
  console.log('收入:', salary.category, '金额:', salary.amount);

  const lunch = sdk.transactions.recordExpense({
    userId: USER_ID,
    accountId: cashAccount.id,
    amount: 45.5,
    category: 'food',
    subCategory: '午餐',
    note: '和同事聚餐',
    tags: ['餐饮', '同事'],
  });
  console.log('支出:', lunch.category, '-', lunch.subCategory, '金额:', lunch.amount);

  const transfer = sdk.transactions.recordTransfer({
    userId: USER_ID,
    fromAccountId: ewalletAccount.id,
    toAccountId: cashAccount.id,
    amount: 2000,
    note: '提取现金',
  });
  console.log('转账:', transfer.amount, 'from->to');

  console.log('\n更新后账户余额:');
  console.log('  现金:', sdk.accounts.getById(cashAccount.id)?.balance);
  console.log('  支付宝:', sdk.accounts.getById(ewalletAccount.id)?.balance);

  console.log('\n=== 3. 设置月度预算 ===');
  const foodBudget = sdk.budgets.createCategoryBudget({
    userId: USER_ID,
    name: '餐饮预算',
    amount: 2000,
    category: 'food',
    alertThreshold: 80,
  });
  console.log('预算:', foodBudget.name, '金额:', foodBudget.amount);

  const totalBudget = sdk.budgets.createMonthlyBudget({
    userId: USER_ID,
    name: '月度总预算',
    amount: 8000,
    rollover: true,
  });
  console.log('月度总预算:', totalBudget.name, '金额:', totalBudget.amount);

  const foodProgress = sdk.budgets.getProgress(foodBudget.id);
  console.log('餐饮预算进度:', foodProgress.percentage + '%', '已用:', foodProgress.spentAmount);

  console.log('\n=== 4. 建立储蓄目标 ===');
  const travelGoal = sdk.goals.create({
    userId: USER_ID,
    name: '日本旅行',
    description: '2026年底去日本旅行',
    targetAmount: 30000,
    initialAmount: 5000,
    deadline: new Date('2026-12-31').getTime(),
    category: 'travel',
    icon: '✈️',
    color: '#3B82F6',
    linkedAccountId: ewalletAccount.id,
    autoContribute: {
      enabled: true,
      amount: 1000,
      frequency: 'monthly',
      sourceAccountId: ewalletAccount.id,
    },
  } as CreateGoalInput);
  console.log('储蓄目标:', travelGoal.name, '目标:', travelGoal.targetAmount);

  const emergencyGoal = sdk.goals.createSavingsGoal({
    userId: USER_ID,
    name: '应急储备金',
    description: '保留3-6个月生活费',
    targetAmount: 50000,
    initialAmount: 10000,
    deadline: new Date('2026-12-31').getTime(),
    linkedAccountId: ewalletAccount.id,
    priority: 1,
  });
  console.log('应急基金:', emergencyGoal.name, '进度:', emergencyGoal.currentAmount + '/' + emergencyGoal.targetAmount);

  sdk.goals.addContribution({
    goalId: travelGoal.id,
    userId: USER_ID,
    amount: 2000,
    note: '奖金存入',
    sourceAccountId: ewalletAccount.id,
  });

  const travelProgress = sdk.goals.getProgress(travelGoal.id);
  console.log('旅行目标进度:');
  console.log('  已存:', travelProgress.currentAmount);
  console.log('  缺口:', travelProgress.remainingAmount);
  console.log('  进度:', travelProgress.percentage + '%');
  console.log('  剩余天数:', travelProgress.daysRemaining);
  console.log('  每月需存:', travelProgress.monthlyRequiredAmount);
  console.log('  是否按期:', travelProgress.isOnTrack ? '是' : '否');

  const gap = sdk.goals.calculateGap(travelGoal.id);
  console.log('缺口分析:');
  console.log('  每日需存:', gap.dailyRequired);
  console.log('  每周需存:', gap.weeklyRequired);
  console.log('  每月需存:', gap.monthlyRequired);

  console.log('\n=== 5. 多人分摊（代付） ===');
  const dinnerSplit = sdk.splits.createEqualSplit({
    userId: USER_ID,
    name: '周末聚餐',
    description: '4人聚餐AA',
    totalAmount: 880,
    paidBy: USER_ID,
    participantUserIds: [
      { userId: USER_ID, userName: '我' },
      { userId: 'user_002', userName: '小明' },
      { userId: 'user_003', userName: '小红' },
      { userId: 'user_004', userName: '小李' },
    ],
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).getTime(),
  });
  console.log('分摊:', dinnerSplit.name, '总额:', dinnerSplit.totalAmount);
  dinnerSplit.participants.forEach((p, i) => {
    console.log(`  参与者${i + 1}: ${p.userName} 应付:${p.amount} 已付:${p.paidAmount}`);
  });

  sdk.splits.recordPayment(dinnerSplit.id, 'user_002', 220);
  console.log('小明还款后:');
  const updatedSplit = sdk.splits.getById(dinnerSplit.id)!;
  updatedSplit.participants.forEach((p) => {
    if (p.userId !== USER_ID) {
      console.log(`  ${p.userName}: 待还 ${p.amount - p.paidAmount}`);
    }
  });

  console.log('\n我的债务:');
  console.log('  别人欠我:', sdk.splits.getTotalOwedToUser(USER_ID));
  console.log('  我欠别人:', sdk.splits.getTotalUserOwes(USER_ID));

  console.log('\n=== 6. 生成还款提醒 ===');
  const repaymentReminders = sdk.reminders.createRepaymentRemindersFromSplit(dinnerSplit.id);
  console.log('生成还款提醒数:', repaymentReminders.length);
  repaymentReminders.forEach((r) => {
    console.log(`  ${r.title} 金额:${r.amount} 截止:${new Date(r.dueDate).toLocaleDateString()}`);
  });

  const billReminder = sdk.reminders.createBillReminder({
    userId: USER_ID,
    title: '信用卡账单',
    description: '招行信用卡本月账单',
    amount: 5200,
    dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).getTime(),
    accountId: creditCard.id,
    isRecurring: true,
    recurrenceFrequency: 'monthly',
    remindBeforeDays: 5,
  });
  console.log('账单提醒:', billReminder.title, '每月重复');

  const dueReminders = sdk.reminders.checkDueReminders();
  console.log('到期检测:');
  console.log('  需通知数:', dueReminders.toNotify.length);
  console.log('  已逾期数:', dueReminders.overdue.length);

  const reminderSummary = sdk.reminders.getReminderSummary(USER_ID);
  console.log('提醒汇总:');
  console.log('  待处理:', reminderSummary.pendingCount);
  console.log('  已逾期:', reminderSummary.overdueCount);
  console.log('  7天内到期:', reminderSummary.dueSoonCount);

  console.log('\n=== 7. 生成报表数据 ===');
  const dashboard = sdk.reports.getDashboardSummary(USER_ID);
  console.log('Dashboard 摘要:');
  console.log('  总资产:', dashboard.totalBalance);
  console.log('  净资产:', dashboard.totalAssets - dashboard.totalLiabilities);
  console.log('  本月收入:', dashboard.monthlyIncome);
  console.log('  本月支出:', dashboard.monthlyExpense);
  console.log('  本月结余:', dashboard.monthlyNet);
  console.log('  储蓄率:', dashboard.monthlySavingsRate + '%');
  console.log('  活跃目标数:', dashboard.activeGoalsCount);
  console.log('  目标总进度:', dashboard.goalsProgressPercentage + '%');
  console.log('  即将到期提醒:', dashboard.upcomingReminders.length);
  console.log('  待处理分摊:', dashboard.pendingSplits.length);
  console.log('  预算告警:', dashboard.budgetAlerts.length);
  console.log('  异常支出:', dashboard.anomalies.length);

  const breakdown = sdk.reports.getCategoryBreakdown({ userId: USER_ID });
  console.log('\n分类占比:');
  console.log('  总收入:', breakdown.totalIncome);
  console.log('  总支出:', breakdown.totalExpense);
  console.log('  净结余:', breakdown.netAmount);
  console.log('  支出分类TOP3:');
  breakdown.expenseByCategory.slice(0, 3).forEach((c) => {
    console.log(`    ${c.categoryName}: ${c.amount} (${c.percentage}%)`);
  });

  const cashflow = sdk.reports.getCashflowTrend({
    userId: USER_ID,
    granularity: 'daily',
  });
  console.log('\n现金流趋势:');
  console.log('  数据点数:', cashflow.points.length);
  console.log('  日均收入:', cashflow.averageDailyIncome);
  console.log('  日均支出:', cashflow.averageDailyExpense);

  const monthlyReport = sdk.reports.getMonthlyReport(USER_ID);
  console.log('\n月度报告:');
  console.log('  储蓄率:', monthlyReport.savingsRate + '%');
  console.log('  TOP支出分类:');
  monthlyReport.topExpenseCategories.forEach((c) => {
    console.log(`    ${c.categoryName}: ${c.amount}`);
  });

  const goalReports = sdk.reports.getGoalProgressReports(USER_ID);
  console.log('\n目标进度报告:');
  goalReports.forEach((gr) => {
    console.log(`  ${gr.goal.name}: ${gr.progress.percentage}% - ${gr.progress.isOnTrack ? '按期' : '落后'}`);
  });

  const anomalies = sdk.reports.detectAnomalies({ userId: USER_ID });
  console.log('\n异常支出检测:', anomalies.length, '项');
  anomalies.slice(0, 3).forEach((a) => {
    console.log(`  [${a.severity}] ${a.category} - ${a.description}`);
  });

  console.log('\n=== 8. 持久化导出 ===');
  const exported = sdk.exportData();
  console.log('导出数据统计:');
  console.log('  账户:', exported.accounts.length);
  console.log('  交易:', exported.transactions.length);
  console.log('  预算:', exported.budgets.length);
  console.log('  目标:', exported.goals.length);
  console.log('  分摊:', exported.splits.length);
  console.log('  提醒:', exported.reminders.length);

  console.log('\n=== 示例运行完成 ===');
}

main().catch(console.error);

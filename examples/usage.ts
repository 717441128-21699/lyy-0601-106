import { createFinanceSDK, CreateGoalInput } from '../src';

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

  console.log('\n=== 2. 记录交易流水 ===');
  sdk.transactions.recordIncome({
    userId: USER_ID,
    accountId: ewalletAccount.id,
    amount: 15000,
    category: 'salary',
    note: '6月工资',
  });
  sdk.transactions.recordExpense({
    userId: USER_ID,
    accountId: cashAccount.id,
    amount: 45.5,
    category: 'food',
    subCategory: '午餐',
    note: '和同事聚餐',
  });
  console.log('交易记录完成');

  console.log('\n=== 3. 建立储蓄目标（验证初始存款修复） ===');
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
    contributors: ['user_001', 'user_002', 'user_003'],
    linkedAccountId: ewalletAccount.id,
  } as CreateGoalInput);

  console.log('初始存款验证:');
  console.log('  目标 currentAmount:', travelGoal.currentAmount, '(期望: 5000)');
  const contributions = sdk.goals.getContributions(travelGoal.id);
  console.log('  贡献明细条数:', contributions.length, '(期望: 1)');
  console.log('  贡献明细金额:', contributions[0]?.amount, '(期望: 5000)');
  const progress = sdk.goals.getProgress(travelGoal.id);
  console.log('  缺口 remainingAmount:', progress.remainingAmount, '(期望: 25000)');
  console.log('  进度百分比:', progress.percentage + '%', '(期望: ~16.67%)');

  sdk.goals.addContribution({
    goalId: travelGoal.id,
    userId: 'user_002',
    amount: 3000,
    note: '小明存入',
  });
  sdk.goals.addContribution({
    goalId: travelGoal.id,
    userId: 'user_003',
    amount: 1500,
    note: '小红存入',
  });

  console.log('\n=== 4. 多人共同存钱 - 成员明细视图 ===');
  const cardData = sdk.goals.getGoalCardData(travelGoal.id);
  console.log('目标卡片数据 (可直接渲染):');
  console.log('  目标名:', cardData.name);
  console.log('  目标金额:', cardData.targetAmount);
  console.log('  已存:', cardData.currentAmount);
  console.log('  缺口:', cardData.remainingAmount);
  console.log('  进度:', cardData.percentage + '%');
  console.log('  成员数:', cardData.memberCount);
  console.log('  是否按期:', cardData.isOnTrack);
  console.log('  成员排行:');
  cardData.memberLeaderboard.forEach((m) => {
    console.log(`    #${m.rank} ${m.userId}: 累计${m.totalContributed} (${m.contributionCount}次) 剩余份额${m.remainingShare ?? 'N/A'}`);
  });
  console.log('  最近存入:');
  cardData.recentContributions.forEach((c) => {
    console.log(`    ${c.userId}: ¥${c.amount} - ${c.note}`);
  });

  console.log('\n=== 5. 多人分摊（代付）+ 结算摘要 ===');
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
  console.log('均分验证: 总额880 / 4人');
  dinnerSplit.participants.forEach((p) => {
    console.log(`  ${p.userName}: 应付 ${p.amount}`);
  });
  const totalAllocated = dinnerSplit.participants.reduce((s, p) => s + p.amount, 0);
  console.log('  各人应付合计:', totalAllocated, '(期望: 880)');

  sdk.splits.recordPayment(dinnerSplit.id, 'user_002', 220);

  console.log('\n分摊结算摘要:');
  const settlement = sdk.splits.getSettlementSummary(dinnerSplit.id);
  console.log('  付款人:', settlement.paidByName);
  console.log('  谁欠谁:');
  settlement.debts.forEach((d) => {
    console.log(`    ${d.fromUserName} → ${d.toUserName}: ¥${d.amount}`);
  });
  console.log('  每人待还:');
  settlement.remainingPerPerson.forEach((p) => {
    console.log(`    ${p.userName}: 待还 ¥${p.totalOwed}`);
    p.totalOwedTo.forEach((t) => {
      console.log(`      → 还给 ${t.toUserName}: ¥${t.amount}`);
    });
  });

  const anotherSplit = sdk.splits.create({
    userId: USER_ID,
    name: 'KTV费用',
    totalAmount: 600,
    paidBy: 'user_003',
    participants: [
      { userId: USER_ID, userName: '我', shareType: 'fixed', shareValue: 150 },
      { userId: 'user_002', userName: '小明', shareType: 'fixed', shareValue: 150 },
      { userId: 'user_003', userName: '小红', shareType: 'fixed', shareValue: 150 },
      { userId: 'user_004', userName: '小李', shareType: 'fixed', shareValue: 150 },
    ],
  } as any);
  console.log('\n固定金额验证: 每人150');
  anotherSplit.participants.forEach((p) => {
    console.log(`  ${p.userName}: 应付 ${p.amount} (期望: 150)`);
  });

  console.log('\n用户结算总览 (建议转账路径):');
  const userSettlement = sdk.splits.getUserSettlementSummary(USER_ID);
  console.log('  我欠别人: ¥' + userSettlement.totalOwedByMe);
  console.log('  别人欠我: ¥' + userSettlement.totalOwedToMe);
  console.log('  净余额: ¥' + userSettlement.netBalance);
  console.log('  建议转账:');
  userSettlement.suggestedTransfers.forEach((t) => {
    console.log(`    ${t.fromUserName} → ${t.toUserName}: ¥${t.amount} ${t.isConsolidated ? '(合并)' : ''}`);
  });

  console.log('\n=== 6. 还款提醒（使用最终待还金额） ===');
  const repaymentReminders = sdk.reminders.createRepaymentRemindersFromSplit(dinnerSplit.id);
  console.log('还款提醒:');
  repaymentReminders.forEach((r) => {
    console.log(`  ${r.title} 金额: ¥${r.amount}`);
  });

  console.log('\n=== 7. 维度报表 ===');
  const dimensionReport = sdk.reports.getDimensionReport(USER_ID);
  console.log('按账户维度:');
  dimensionReport.byAccount.forEach((a) => {
    console.log(`  ${a.accountName} (${a.accountType}): 期初${a.openingBalance} → 期末${a.closingBalance} 收入${a.totalIncome} 支出${a.totalExpense}`);
  });
  console.log('按目标维度:');
  dimensionReport.byGoal.forEach((g) => {
    console.log(`  ${g.goalName}: 进度${g.percentage}% 期间存入¥${g.contributionsInPeriod} (${g.contributionCount}次)`);
    g.memberDetails.forEach((m) => {
      console.log(`    成员${m.userId}: 累计¥${m.totalContributed} 排名#${m.rank}`);
    });
  });

  const cashflow = sdk.reports.getCashflowTrend({ userId: USER_ID, granularity: 'daily' });
  console.log('\n现金流趋势 (余额验证):');
  if (cashflow.points.length > 0) {
    console.log('  期初余额:', cashflow.points[0].balance);
    console.log('  期末余额:', cashflow.points[cashflow.points.length - 1].balance);
    console.log('  当前账户总余额:', sdk.accounts.getTotalBalance(USER_ID));
  }

  console.log('\n=== 验证完成 ===');
}

main().catch(console.error);

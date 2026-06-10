# Finance SDK - 记账理财类库

面向社区互助类应用接入的个人目标储蓄与记账理财 SDK，提供完整的 7 大能力模块。

## 功能特性

### 1. 账户模块 (Account)
- 支持多种账户类型：现金、电子钱包、银行卡、信用卡、投资账户
- 账户 CRUD、余额调整、归档管理
- 默认账户、信用额度、账单日设置
- 总资产、总负债、总余额汇总

### 2. 流水模块 (Transaction)
- 收入、支出、转账、退款 4 种交易类型
- 16 种预设分类 + 自定义子分类
- 标签、备注、附件、地理位置
- 周期性账单自动生成（日/周/双周/月/季/年）
- 关键词搜索、多条件筛选、分页
- 交易自动关联账户余额变动

### 3. 预算模块 (Budget)
- 周度/月度/季度/年度预算
- 分类预算、多分类组合预算
- 预算进度实时追踪与超支预警
- 剩余金额滚转至下期
- 自动续约与周期性更新

### 4. 目标模块 (Goal)
- 储蓄目标创建与进度追踪
- 目标缺口计算（日/周/月需存金额）
- 截止日期倒计时、进度是否按期评估
- 自动存款功能（按周期自动存入）
- 多人贡献者、优先级排序
- 贡献历史记录

### 5. 分摊模块 (Split)
- 3 种分摊方式：均分、百分比、固定金额
- 多人代付、还款记录追踪
- 参与人还款状态管理
- 债务人/债权人视图
- 一键清算、批量标记已还

### 6. 提醒模块 (Reminder)
- 账单提醒、还款提醒、储蓄提醒、目标提醒、自定义
- 到期前 N 天自动触发通知
- 重复提醒（日/周/月/季/年循环）
- 逾期检测、延期、标记完成
- 从分摊单自动生成还款提醒

### 7. 报表模块 (Report)
- 分类占比分析（收入/支出）
- 现金流趋势图（日/周/月粒度）
- 目标进度报告（含贡献历史）
- 异常支出检测（金额异常、频次突增、深夜消费）
- Dashboard 页面摘要数据
- 月度综合报告

## 安装

```bash
npm install
```

## 快速开始

```typescript
import { createFinanceSDK } from 'finance-sdk';

// 1. 初始化 SDK（可选：配置持久化）
const sdk = createFinanceSDK({
  persistence: {
    save: async (data) => localStorage.setItem('finance_data', JSON.stringify(data)),
    load: async () => JSON.parse(localStorage.getItem('finance_data') || 'null'),
    autoSave: true,
  },
});

await sdk.init();
const USER_ID = 'current_user_id';

// 2. 创建账户
const wallet = sdk.accounts.createEWalletAccount({
  userId: USER_ID,
  name: '支付宝',
  initialBalance: 10000,
});

// 3. 记录支出
sdk.transactions.recordExpense({
  userId: USER_ID,
  accountId: wallet.id,
  amount: 68,
  category: 'food',
  subCategory: '晚餐',
  note: '和朋友吃饭',
});

// 4. 建立储蓄目标
const goal = sdk.goals.create({
  userId: USER_ID,
  name: '新款手机',
  targetAmount: 6000,
  initialAmount: 1000,
  deadline: new Date('2026-09-30').getTime(),
});

// 5. 查看 Dashboard
const summary = sdk.reports.getDashboardSummary(USER_ID);
console.log('本月储蓄率:', summary.monthlySavingsRate + '%');
```

## 模块使用示例

### 多人分摊

```typescript
// 创建 AA 制分摊单
const split = sdk.splits.createEqualSplit({
  userId: USER_ID,
  name: '周末聚餐',
  totalAmount: 600,
  paidBy: USER_ID,
  participantUserIds: [
    { userId: USER_ID, userName: '我' },
    { userId: 'user_a', userName: 'A' },
    { userId: 'user_b', userName: 'B' },
  ],
});

// 记录还款
sdk.splits.recordPayment(split.id, 'user_a', 200);

// 自动生成还款提醒
sdk.reminders.createRepaymentRemindersFromSplit(split.id);
```

### 周期性账单

```typescript
// 创建每月自动生成的房租账单
sdk.transactions.createRecurrenceRule({
  userId: USER_ID,
  frequency: 'monthly',
  transactionTemplate: {
    userId: USER_ID,
    type: 'expense',
    amount: 3500,
    accountId: wallet.id,
    category: 'housing',
    note: '每月房租',
  },
});

// 每次启动调用，自动生成到期的周期性交易
sdk.processScheduledTasks();
```

### 目标缺口计算

```typescript
const gap = sdk.goals.calculateGap(goalId);
console.log(`还需存: ¥${gap.remainingAmount}`);
console.log(`建议每月存: ¥${gap.monthlyRequired}`);
console.log(`建议每周存: ¥${gap.weeklyRequired}`);
console.log(`剩余天数: ${gap.daysRemaining} 天`);
```

### 异常支出检测

```typescript
const anomalies = sdk.reports.detectAnomalies({
  userId: USER_ID,
  startDate: oneMonthAgo,
  endDate: now,
});

anomalies.forEach((a) => {
  console.log(`[${a.severity}] ${a.category}: ${a.description}`);
});
```

## 定时任务处理

应用启动时和定时调用，自动处理周期性任务：

```typescript
// 在应用启动时或定时器中调用
const result = sdk.processScheduledTasks();

console.log('自动生成的周期性交易:', result.recurringTransactions);
console.log('自动存入的目标款项:', result.autoContributions);
console.log('需要发送的提醒:', result.dueReminders.toNotify);
```

## 数据持久化

```typescript
// 手动导出
const data = sdk.exportData();
// 保存到数据库...

// 导入数据
sdk.importData(loadedData);
```

## 项目结构

```
src/
├── types/          # TypeScript 类型定义
├── constants/      # 常量配置（分类、颜色、货币）
├── utils/          # 工具函数（日期、金额、统计）
├── storage/        # 内存存储适配器
├── modules/        # 7 大业务模块
│   ├── AccountModule.ts
│   ├── TransactionModule.ts
│   ├── BudgetModule.ts
│   ├── GoalModule.ts
│   ├── SplitModule.ts
│   ├── ReminderModule.ts
│   └── ReportModule.ts
└── index.ts        # SDK 主入口
```

## 开发命令

```bash
# 安装依赖
npm install

# 类型检查
npm run typecheck

# 编译构建
npm run build

# 监听模式开发
npm run dev
```

## License

MIT

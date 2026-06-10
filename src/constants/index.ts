import { TransactionCategory, Currency } from '../types';

export const DEFAULT_CURRENCY: Currency = 'CNY';

export const CATEGORY_NAMES: Record<TransactionCategory, string> = {
  food: '餐饮',
  transport: '交通',
  shopping: '购物',
  entertainment: '娱乐',
  housing: '住房',
  medical: '医疗',
  education: '教育',
  salary: '工资',
  bonus: '奖金',
  investment: '投资',
  savings: '储蓄',
  gift: '礼物',
  utility: '水电煤',
  subscription: '订阅',
  travel: '旅行',
  other: '其他',
};

export const CATEGORY_COLORS: Record<TransactionCategory, string> = {
  food: '#FF6B6B',
  transport: '#4ECDC4',
  shopping: '#A78BFA',
  entertainment: '#FBBF24',
  housing: '#3B82F6',
  medical: '#EF4444',
  education: '#10B981',
  salary: '#22C55E',
  bonus: '#F59E0B',
  investment: '#8B5CF6',
  savings: '#06B6D4',
  gift: '#EC4899',
  utility: '#6366F1',
  subscription: '#F97316',
  travel: '#14B8A6',
  other: '#9CA3AF',
};

export const INCOME_CATEGORIES: TransactionCategory[] = [
  'salary',
  'bonus',
  'investment',
  'gift',
  'savings',
  'other',
];

export const EXPENSE_CATEGORIES: TransactionCategory[] = [
  'food',
  'transport',
  'shopping',
  'entertainment',
  'housing',
  'medical',
  'education',
  'utility',
  'subscription',
  'travel',
  'other',
];

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  CNY: '¥',
  USD: '$',
  EUR: '€',
  JPY: '¥',
  HKD: 'HK$',
};

export const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const MS_PER_WEEK = 7 * MS_PER_DAY;
export const MS_PER_MONTH = 30 * MS_PER_DAY;
export const MS_PER_YEAR = 365 * MS_PER_DAY;

import { v4 as uuidv4 } from 'uuid';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  addDays,
  addWeeks,
  addMonths,
  addQuarters,
  addYears,
  differenceInDays,
  isAfter,
  isBefore,
  isEqual,
  getHours,
  differenceInMilliseconds,
} from 'date-fns';
import {
  ID,
  BudgetPeriod,
  RecurrenceFrequency,
  Currency,
  BaseEntity,
} from '../types';
import { DEFAULT_CURRENCY, MS_PER_DAY } from '../constants';

export function generateId(): ID {
  return uuidv4();
}

export function now(): number {
  return Date.now();
}

export function createBaseEntity(): BaseEntity {
  const id = generateId();
  const timestamp = now();
  return {
    id,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function formatCurrency(amount: number, currency: Currency = DEFAULT_CURRENCY): string {
  const formatter = new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return formatter.format(amount);
}

export function formatDate(timestamp: number, pattern: string = 'yyyy-MM-dd'): string {
  return format(new Date(timestamp), pattern);
}

export function roundAmount(amount: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(amount * factor) / factor;
}

export function getPeriodRange(
  period: BudgetPeriod,
  referenceDate: number = now()
): { startDate: number; endDate: number; periodLabel: string } {
  const date = new Date(referenceDate);
  let start: Date;
  let end: Date;
  let label: string;

  switch (period) {
    case 'weekly':
      start = startOfWeek(date, { weekStartsOn: 1 });
      end = endOfWeek(date, { weekStartsOn: 1 });
      label = `${format(start, 'yyyy/MM/dd')} - ${format(end, 'MM/dd')}`;
      break;
    case 'monthly':
      start = startOfMonth(date);
      end = endOfMonth(date);
      label = format(date, 'yyyy年MM月');
      break;
    case 'quarterly':
      start = startOfQuarter(date);
      end = endOfQuarter(date);
      const quarter = Math.floor(date.getMonth() / 3) + 1;
      label = `${format(date, 'yyyy')}年Q${quarter}`;
      break;
    case 'yearly':
      start = startOfYear(date);
      end = endOfYear(date);
      label = format(date, 'yyyy年');
      break;
  }

  return {
    startDate: start.getTime(),
    endDate: end.getTime(),
    periodLabel: label,
  };
}

export function addFrequency(
  date: number,
  frequency: RecurrenceFrequency,
  interval: number = 1
): number {
  const d = new Date(date);
  switch (frequency) {
    case 'daily':
      return addDays(d, interval).getTime();
    case 'weekly':
      return addWeeks(d, interval).getTime();
    case 'biweekly':
      return addWeeks(d, interval * 2).getTime();
    case 'monthly':
      return addMonths(d, interval).getTime();
    case 'quarterly':
      return addQuarters(d, interval).getTime();
    case 'yearly':
      return addYears(d, interval).getTime();
  }
}

export function isInDateRange(
  timestamp: number,
  startDate: number,
  endDate: number
): boolean {
  return (
    (isEqual(timestamp, startDate) || isAfter(timestamp, startDate)) &&
    (isEqual(timestamp, endDate) || isBefore(timestamp, endDate))
  );
}

export function daysBetween(from: number, to: number): number {
  return differenceInDays(new Date(to), new Date(from));
}

export function msBetween(from: number, to: number): number {
  return differenceInMilliseconds(new Date(to), new Date(from));
}

export function isLateNight(timestamp: number): boolean {
  const hour = getHours(new Date(timestamp));
  return hour >= 23 || hour < 5;
}

export function calculatePercentage(part: number, total: number): number {
  if (total === 0) return 0;
  return roundAmount((part / total) * 100, 2);
}

export function getMonthlyRange(referenceDate: number = now()): {
  startDate: number;
  endDate: number;
} {
  return {
    startDate: startOfMonth(new Date(referenceDate)).getTime(),
    endDate: endOfMonth(new Date(referenceDate)).getTime(),
  };
}

export function groupBy<T, K extends keyof any>(
  array: T[],
  keyFn: (item: T) => K
): Record<string, T[]> {
  return array.reduce((result, item) => {
    const key = keyFn(item) as unknown as string;
    if (!result[key]) {
      result[key] = [];
    }
    result[key].push(item);
    return result;
  }, {} as Record<string, T[]>);
}

export function sumBy<T>(array: T[], fn: (item: T) => number): number {
  return array.reduce((sum, item) => sum + fn(item), 0);
}

export function averageBy<T>(array: T[], fn: (item: T) => number): number {
  if (array.length === 0) return 0;
  return sumBy(array, fn) / array.length;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = averageBy(values, (v) => v);
  const squareDiffs = values.map((v) => Math.pow(v - avg, 2));
  return Math.sqrt(averageBy(squareDiffs, (v) => v));
}

export {
  addDays,
  addWeeks,
  addMonths,
  addQuarters,
  addYears,
  differenceInDays,
  isAfter,
  isBefore,
  isEqual,
  format,
  startOfMonth,
  endOfMonth,
  MS_PER_DAY,
};

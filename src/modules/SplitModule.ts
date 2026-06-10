import { InMemoryStorage } from '../storage';
import {
  Split,
  CreateSplitInput,
  UpdateSplitParticipantInput,
  ID,
  Participant,
  SplitStatus,
  SplitSettlementSummary,
  SplitDebtRelation,
  TransferSuggestion,
  UserSettlementSummary,
} from '../types';
import { createBaseEntity, now, roundAmount } from '../utils';
import { DEFAULT_CURRENCY } from '../constants';

export class SplitModule {
  private storage: InMemoryStorage;

  constructor(storage: InMemoryStorage) {
    this.storage = storage;
  }

  create(input: CreateSplitInput): Split {
    if (!input.userId) {
      throw new Error('用户ID不能为空');
    }
    if (!input.name || input.name.trim().length === 0) {
      throw new Error('分摊名称不能为空');
    }
    if (!input.totalAmount || input.totalAmount <= 0) {
      throw new Error('总金额必须大于0');
    }
    if (!input.participants || input.participants.length < 2) {
      throw new Error('至少需要2个参与人');
    }
    if (!input.paidBy) {
      throw new Error('必须指定付款人');
    }

    const { participants, discrepancy, discrepancyNote } = this.calculateShares(
      input.totalAmount,
      input.participants
    );

    const split: Split = {
      ...createBaseEntity(),
      userId: input.userId,
      name: input.name.trim(),
      description: input.description,
      totalAmount: roundAmount(input.totalAmount),
      currency: input.currency ?? DEFAULT_CURRENCY,
      transactionId: input.transactionId,
      participants,
      paidBy: input.paidBy,
      status: participants.every((p) => p.status === 'settled')
        ? 'settled'
        : participants.some((p) => p.status === 'partial' || p.paidAmount > 0)
        ? 'partial'
        : 'pending',
      dueDate: input.dueDate,
      isSettlement: input.isSettlement ?? false,
      discrepancy,
      discrepancyNote,
    };

    this.storage.splits.set(split.id, split);
    return split;
  }

  private calculateShares(
    totalAmount: number,
    participants: CreateSplitInput['participants']
  ): { participants: Participant[]; discrepancy?: number; discrepancyNote?: string } {
    const count = participants.length;
    const result: Participant[] = [];
    let allocated = 0;

    participants.forEach((p, index) => {
      let amount = 0;
      const isLast = index === participants.length - 1;

      switch (p.shareType) {
        case 'equal':
          if (isLast) {
            amount = roundAmount(totalAmount - allocated);
          } else {
            amount = roundAmount(totalAmount / count);
          }
          break;
        case 'percentage':
          amount = roundAmount(totalAmount * ((p.shareValue ?? 0) / 100));
          break;
        case 'fixed':
          amount = roundAmount(p.shareValue ?? 0);
          break;
      }

      allocated += amount;

      result.push({
        userId: p.userId,
        userName: p.userName,
        userAvatar: p.userAvatar,
        shareType: p.shareType,
        shareValue: p.shareValue,
        amount,
        paidAmount: 0,
        status: 'pending',
      });
    });

    let discrepancy: number | undefined;
    let discrepancyNote: string | undefined;
    const diff = roundAmount(totalAmount - allocated);
    if (Math.abs(diff) > 0.005) {
      discrepancy = diff;
      if (diff > 0) {
        discrepancyNote = `各人分摊金额合计 ¥${roundAmount(allocated)}，比总金额 ¥${totalAmount} 少 ¥${diff}，请确认比例是否正确或补充差额`;
      } else {
        discrepancyNote = `各人分摊金额合计 ¥${roundAmount(allocated)}，比总金额 ¥${totalAmount} 多 ¥${Math.abs(diff)}，请确认比例是否正确`;
      }
    }

    return { participants: result, discrepancy, discrepancyNote };
  }

  createEqualSplit(input: {
    userId: ID;
    name: string;
    description?: string;
    totalAmount: number;
    currency?: string;
    transactionId?: ID;
    participantUserIds: Array<{
      userId: ID;
      userName?: string;
      userAvatar?: string;
    }>;
    paidBy: ID;
    dueDate?: number;
  }): Split {
    return this.create({
      userId: input.userId,
      name: input.name,
      description: input.description,
      totalAmount: input.totalAmount,
      currency: input.currency as any,
      transactionId: input.transactionId,
      paidBy: input.paidBy,
      dueDate: input.dueDate,
      participants: input.participantUserIds.map((p) => ({
        ...p,
        shareType: 'equal',
      })),
    });
  }

  getById(id: ID): Split | null {
    return this.storage.splits.get(id) ?? null;
  }

  getByIdOrThrow(id: ID): Split {
    const split = this.getById(id);
    if (!split) {
      throw new Error(`分摊不存在: ${id}`);
    }
    return split;
  }

  listByUser(userId: ID, includeSettled: boolean = true): Split[] {
    return Array.from(this.storage.splits.values())
      .filter((s) =>
        s.userId === userId ||
        s.participants.some((p) => p.userId === userId)
      )
      .filter((s) => includeSettled || s.status !== 'settled');
  }

  listByStatus(userId: ID, status: SplitStatus): Split[] {
    return this.listByUser(userId).filter((s) => s.status === status);
  }

  listPending(userId: ID): Split[] {
    return this.listByUser(userId).filter(
      (s) => s.status === 'pending' || s.status === 'partial'
    );
  }

  listAsPayer(userId: ID): Split[] {
    return this.listByUser(userId).filter((s) => s.paidBy === userId);
  }

  listAsParticipant(userId: ID): Split[] {
    return this.listByUser(userId).filter(
      (s) => s.participants.some((p) => p.userId === userId)
    );
  }

  listAsDebtor(userId: ID): Split[] {
    return this.listByUser(userId).filter((s) => {
      const p = s.participants.find((pp) => pp.userId === userId);
      return p && p.amount > p.paidAmount && s.status !== 'settled';
    });
  }

  updateParticipant(
    splitId: ID,
    userId: ID,
    input: UpdateSplitParticipantInput
  ): Split {
    const split = this.getByIdOrThrow(splitId);
    const participant = split.participants.find((p) => p.userId === userId);
    if (!participant) {
      throw new Error('用户不是该分摊的参与人');
    }

    if (input.paidAmount !== undefined) {
      if (input.paidAmount < 0 || input.paidAmount > participant.amount) {
        throw new Error('已付金额不能为负数或超过应付金额');
      }
      participant.paidAmount = roundAmount(input.paidAmount);
    }

    if (input.status) {
      participant.status = input.status;
    }

    if (participant.paidAmount >= participant.amount) {
      participant.status = 'paid';
    } else if (participant.paidAmount > 0) {
      participant.status = 'partial';
    }

    const allPaid = split.participants.every((p) => p.status === 'paid' || p.status === 'settled');
    if (allPaid) {
      split.status = 'settled';
    } else if (split.participants.some((p) => p.paidAmount > 0)) {
      split.status = 'partial';
    } else {
      split.status = 'pending';
    }

    split.updatedAt = now();
    this.storage.splits.set(splitId, split);
    return split;
  }

  recordPayment(
    splitId: ID,
    userId: ID,
    amount: number
  ): Split {
    const split = this.getByIdOrThrow(splitId);
    const participant = split.participants.find((p) => p.userId === userId);
    if (!participant) {
      throw new Error('用户不是该分摊的参与人');
    }

    const newPaid = roundAmount(Math.min(participant.paidAmount + amount, participant.amount));
    return this.updateParticipant(splitId, userId, { paidAmount: newPaid });
  }

  settleSplit(splitId: ID): Split {
    const split = this.getByIdOrThrow(splitId);
    split.participants.forEach((p) => {
      p.paidAmount = p.amount;
      p.status = 'paid';
    });
    split.status = 'settled';
    split.updatedAt = now();
    this.storage.splits.set(splitId, split);
    return split;
  }

  markSettled(splitId: ID, userId: ID): Split {
    return this.updateParticipant(splitId, userId, {
      paidAmount: (this.getByIdOrThrow(splitId).participants.find(p => p.userId === userId))?.amount ?? 0,
      status: 'settled',
    });
  }

  delete(id: ID): boolean {
    return this.storage.splits.delete(id);
  }

  getParticipantDebts(userId: ID): Array<{
    splitId: ID;
    splitName: string;
    totalAmount: number;
    owedAmount: number;
    paidAmount: number;
    remainingAmount: number;
    dueDate?: number;
    isPayer: boolean;
  }> {
    const debts: Array<{
      splitId: ID;
      splitName: string;
      totalAmount: number;
      owedAmount: number;
      paidAmount: number;
      remainingAmount: number;
      dueDate?: number;
      isPayer: boolean;
    }> = [];

    this.listAsDebtor(userId).forEach((split) => {
      const p = split.participants.find((pp) => pp.userId === userId);
      if (p) {
        debts.push({
          splitId: split.id,
          splitName: split.name,
          totalAmount: split.totalAmount,
          owedAmount: p.amount,
          paidAmount: p.paidAmount,
          remainingAmount: roundAmount(p.amount - p.paidAmount),
          dueDate: split.dueDate,
          isPayer: split.paidBy === userId,
        });
      }
    });

    return debts;
  }

  getTotalOwedToUser(userId: ID): number {
    const splits = this.listAsPayer(userId);
    let total = 0;
    splits.forEach((split) => {
      split.participants.forEach((p) => {
        if (p.userId !== userId) {
          total += Math.max(0, p.amount - p.paidAmount);
        }
      });
    });
    return roundAmount(total);
  }

  getTotalUserOwes(userId: ID): number {
    let total = 0;
    this.listAsDebtor(userId).forEach((split) => {
      const p = split.participants.find((pp) => pp.userId === userId);
      if (p && split.paidBy !== userId) {
        total += Math.max(0, p.amount - p.paidAmount);
      }
    });
    return roundAmount(total);
  }

  getSettlementSummary(splitId: ID): SplitSettlementSummary {
    const split = this.getByIdOrThrow(splitId);
    const debts: SplitDebtRelation[] = [];

    split.participants.forEach((p) => {
      const remaining = roundAmount(p.amount - p.paidAmount);
      if (remaining > 0 && p.userId !== split.paidBy) {
        debts.push({
          fromUserId: p.userId,
          fromUserName: p.userName,
          toUserId: split.paidBy,
          toUserName: split.participants.find((pp) => pp.userId === split.paidBy)?.userName,
          amount: remaining,
          splitIds: [split.id],
          splitNames: [split.name],
        });
      }
    });

    const remainingPerPerson = split.participants
      .filter((p) => p.userId !== split.paidBy)
      .map((p) => ({
        userId: p.userId,
        userName: p.userName,
        totalOwed: roundAmount(Math.max(0, p.amount - p.paidAmount)),
        totalOwedTo: [{
          toUserId: split.paidBy,
          toUserName: split.participants.find((pp) => pp.userId === split.paidBy)?.userName,
          amount: roundAmount(Math.max(0, p.amount - p.paidAmount)),
        }],
      }));

    return {
      splitId: split.id,
      splitName: split.name,
      totalAmount: split.totalAmount,
      currency: split.currency,
      paidBy: split.paidBy,
      paidByName: split.participants.find((p) => p.userId === split.paidBy)?.userName,
      status: split.status,
      debts,
      remainingPerPerson,
    };
  }

  getUserSettlementSummary(userId: ID): UserSettlementSummary {
    const allSplits = this.listByUser(userId).filter(
      (s) => s.status !== 'settled'
    );

    const debts: SplitDebtRelation[] = [];
    const perSplitSummaries: SplitSettlementSummary[] = [];

    allSplits.forEach((split) => {
      const summary = this.getSettlementSummary(split.id);
      perSplitSummaries.push(summary);

      summary.debts.forEach((debt) => {
        if (debt.fromUserId === userId || debt.toUserId === userId) {
          debts.push(debt);
        }
      });
    });

    const suggestedTransfers = this.calculateSuggestedTransfers(userId, allSplits);

    const totalOwedByMe = roundAmount(
      debts
        .filter((d) => d.fromUserId === userId)
        .reduce((sum, d) => sum + d.amount, 0)
    );
    const totalOwedToMe = roundAmount(
      debts
        .filter((d) => d.toUserId === userId)
        .reduce((sum, d) => sum + d.amount, 0)
    );

    return {
      userId,
      totalOwedByMe,
      totalOwedToMe,
      netBalance: roundAmount(totalOwedToMe - totalOwedByMe),
      debts,
      suggestedTransfers,
      perSplitSummaries,
    };
  }

  private calculateSuggestedTransfers(
    userId: ID,
    splits: Split[]
  ): TransferSuggestion[] {
    const netBalances = new Map<ID, number>();
    const userNames = new Map<ID, string | undefined>();
    const rawDebts: SplitDebtRelation[] = [];

    splits.forEach((split) => {
      split.participants.forEach((p) => {
        userNames.set(p.userId, p.userName);
        if (!netBalances.has(p.userId)) netBalances.set(p.userId, 0);

        const remaining = roundAmount(p.amount - p.paidAmount);
        if (remaining < 0.01) return;

        if (p.userId === split.paidBy) {
          netBalances.set(p.userId, (netBalances.get(p.userId) ?? 0) + remaining);
        } else {
          netBalances.set(p.userId, (netBalances.get(p.userId) ?? 0) - remaining);
          rawDebts.push({
            fromUserId: p.userId,
            fromUserName: p.userName,
            toUserId: split.paidBy,
            toUserName: split.participants.find((pp) => pp.userId === split.paidBy)?.userName,
            amount: remaining,
            splitIds: [split.id],
            splitNames: [split.name],
          });
        }
      });
    });

    const debtors: Array<{ userId: ID; amount: number }> = [];
    const creditors: Array<{ userId: ID; amount: number }> = [];

    netBalances.forEach((balance, uid) => {
      const rounded = roundAmount(balance);
      if (rounded < -0.01) {
        debtors.push({ userId: uid, amount: Math.abs(rounded) });
      } else if (rounded > 0.01) {
        creditors.push({ userId: uid, amount: rounded });
      }
    });

    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const suggestions: TransferSuggestion[] = [];
    let di = 0;
    let ci = 0;

    while (di < debtors.length && ci < creditors.length) {
      const debtor = debtors[di];
      const creditor = creditors[ci];
      const transferAmount = roundAmount(Math.min(debtor.amount, creditor.amount));

      if (transferAmount > 0.01) {
        const related = rawDebts.filter(
          (d) => d.fromUserId === debtor.userId && d.toUserId === creditor.userId
        );

        let allocatedFromRelated = 0;
        const mappedDebts: SplitDebtRelation[] = related.map((d) => {
          const alloc = Math.min(d.amount, transferAmount - allocatedFromRelated);
          allocatedFromRelated += alloc;
          return {
            ...d,
            amount: roundAmount(alloc),
          };
        });

        if (allocatedFromRelated < transferAmount - 0.01) {
          mappedDebts.push({
            fromUserId: debtor.userId,
            fromUserName: userNames.get(debtor.userId),
            toUserId: creditor.userId,
            toUserName: userNames.get(creditor.userId),
            amount: roundAmount(transferAmount - allocatedFromRelated),
            splitIds: [],
            splitNames: [],
          });
        }

        suggestions.push({
          fromUserId: debtor.userId,
          fromUserName: userNames.get(debtor.userId),
          toUserId: creditor.userId,
          toUserName: userNames.get(creditor.userId),
          amount: transferAmount,
          isConsolidated: mappedDebts.length > 1,
          relatedDebts: mappedDebts,
        });
      }

      debtor.amount = roundAmount(debtor.amount - transferAmount);
      creditor.amount = roundAmount(creditor.amount - transferAmount);

      if (debtor.amount < 0.01) di++;
      if (creditor.amount < 0.01) ci++;
    }

    return suggestions;
  }
}

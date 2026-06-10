import { InMemoryStorage } from '../storage';
import {
  Split,
  CreateSplitInput,
  UpdateSplitParticipantInput,
  ID,
  Participant,
  SplitStatus,
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

    const participants = this.calculateShares(
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
    };

    this.storage.splits.set(split.id, split);
    return split;
  }

  private calculateShares(
    totalAmount: number,
    participants: CreateSplitInput['participants']
  ): Participant[] {
    const count = participants.length;
    const result: Participant[] = [];
    let allocated = 0;

    participants.forEach((p, index) => {
      let amount = 0;
      switch (p.shareType) {
        case 'equal':
          amount = roundAmount(totalAmount / count);
          break;
        case 'percentage':
          amount = roundAmount(totalAmount * ((p.shareValue ?? 0) / 100));
          break;
        case 'fixed':
          amount = roundAmount(p.shareValue ?? 0);
          break;
      }

      if (index === participants.length - 1) {
        amount = roundAmount(totalAmount - allocated);
      } else {
        allocated += amount;
      }

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

    return result;
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
}

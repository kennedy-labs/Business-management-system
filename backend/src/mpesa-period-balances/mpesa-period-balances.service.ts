import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MpesaPeriodBalance } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RecordMpesaBalanceDto } from './dto/record-mpesa-balance.dto';

/** The period's balance reading pair, plus the delta that matters to the owner. */
export type MpesaBalanceView = {
  openingBalance: number;
  openingAt: Date;
  closingBalance: number | null;
  closingAt: Date | null;
  /** closing - opening. Null until the closing reading exists. */
  amount: number | null;
  isComplete: boolean;
};

/**
 * M-Pesa, reduced to its simplest true form: read the balance when the period
 * starts (6,005 at 08:43), read it again when it ends (16,005 at 09:31), and
 * the money taken is `16005 - 6005 = 10000`. One row per period. Nothing else.
 *
 * Both readings are frozen once the period is closed so a balance cannot be
 * edited after the owner has confirmed it.
 */
@Injectable()
export class MpesaPeriodBalancesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Loads a period and verifies it belongs to the caller's business.
   * Balances are always scoped through the shift, never trusted from input.
   */
  private async loadShift(businessId: string, shiftId: string, openOnly: boolean) {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      include: { branch: true },
    });

    if (!shift) throw new NotFoundException('Shift not found');
    if (shift.branch.businessId !== businessId) {
      throw new NotFoundException('Shift not found in this business');
    }
    if (openOnly && shift.closedAt) {
      throw new BadRequestException(
        'This period is already closed, so its balances can no longer change',
      );
    }
    return shift;
  }

  private toView(row: MpesaPeriodBalance): MpesaBalanceView {
    const opening = Number(row.openingBalance);
    const closing =
      row.closingBalance === null ? null : Number(row.closingBalance);
    return {
      openingBalance: opening,
      openingAt: row.openingAt,
      closingBalance: closing,
      closingAt: row.closingAt,
      amount: closing === null ? null : closing - opening,
      // No closing reading yet means no trustworthy delta exists.
      isComplete: closing !== null,
    };
  }

  /** Sums the deltas of every completed reading pair. */
  private totals(balances: MpesaBalanceView[]) {
    return {
      declaredMpesa: balances.reduce((sum, b) => sum + (b.amount ?? 0), 0),
      isComplete: balances.every((b) => b.isComplete),
    };
  }

  /**
   * Records the balance the worker reads when the period starts, e.g. 6,005
   * at 08:43. Re-recording simply corrects the reading while the period is
   * still open.
   */
  async recordOpening(
    businessId: string,
    shiftId: string,
    dto: RecordMpesaBalanceDto,
  ) {
    const shift = await this.loadShift(businessId, shiftId, true);
    const openingAt = dto.recordedAt ? new Date(dto.recordedAt) : new Date();

    const row = await this.prisma.mpesaPeriodBalance.upsert({
      where: { shiftId },
      create: {
        businessId,
        branchId: shift.branchId,
        shiftId,
        openingBalance: dto.balance,
        openingAt,
      },
      update: {
        openingBalance: dto.balance,
        openingAt,
      },
    });

    return this.toView(row);
  }

  /**
   * Records the balance the worker reads when the period ends, e.g. 16,005 at
   * 09:31. Together with the opening reading this yields the money taken:
   * `16005 - 6005 = 10000`.
   *
   * A decrease is permitted rather than rejected, because money genuinely can
   * leave the account (owner withdrawal, a send-money payment). It shows up as
   * a negative delta and is caught during owner confirmation.
   */
  async recordClosing(
    businessId: string,
    shiftId: string,
    dto: RecordMpesaBalanceDto,
  ) {
    await this.loadShift(businessId, shiftId, true);

    const existing = await this.prisma.mpesaPeriodBalance.findUnique({
      where: { shiftId },
    });

    if (!existing) {
      throw new BadRequestException(
        'Record the opening balance before the closing balance',
      );
    }

    const closingAt = dto.recordedAt ? new Date(dto.recordedAt) : new Date();
    if (closingAt.getTime() < existing.openingAt.getTime()) {
      throw new BadRequestException(
        'The closing balance cannot be recorded before the opening balance',
      );
    }

    const row = await this.prisma.mpesaPeriodBalance.update({
      where: { id: existing.id },
      data: {
        closingBalance: dto.balance,
        closingAt,
      },
    });

    return this.toView(row);
  }

  /**
   * The period's reading pair plus the delta, which is what the owner reviews
   * when confirming the worker's money.
   */
  async list(businessId: string, shiftId: string) {
    await this.loadShift(businessId, shiftId, false);

    const row = await this.prisma.mpesaPeriodBalance.findUnique({
      where: { shiftId },
    });

    const balances = row ? [this.toView(row)] : [];
    return { shiftId, balances, totals: this.totals(balances) };
  }

  /**
   * The period's total M-Pesa money, used when building a reconciliation.
   * Kept separate so a reconciliation and the balance screen can never
   * disagree about how the figure was derived.
   */
  async getDeclaredMpesa(businessId: string, shiftId: string) {
    const { totals } = await this.list(businessId, shiftId);
    return totals.declaredMpesa;
  }
}

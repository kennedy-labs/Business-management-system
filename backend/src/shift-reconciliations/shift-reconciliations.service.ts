import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ShiftReconciliation } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DiscrepanciesService } from '../discrepancies/discrepancies.service';
import { MpesaPeriodBalancesService } from '../mpesa-period-balances/mpesa-period-balances.service';
import { ConfirmReconciliationDto } from './dto/confirm-reconciliation.dto';
import { DisputeReconciliationDto } from './dto/dispute-reconciliation.dto';
import { SubmitReconciliationDto } from './dto/submit-reconciliation.dto';

/** One product's line on the owner's review table. */
export type ReconciliationItemView = {
  productId: string;
  productName: string;
  unit: string;
  openingQuantity: number;
  addedQuantity: number;
  soldQuantity: number;
  closingQuantity: number;
  sellingPrice: number;
  unitCost: number;
  revenue: number;
  cost: number;
  grossProfit: number;
};

/**
 * The owner confirming the worker's work.
 *
 * The loop this closes is the whole point of the system: "I give you stock,
 * you sell, time ends, you bring back the remaining stock plus the money you
 * sold, and I confirm by comparing stock against money."
 *
 * Expected revenue comes from stock movement (`soldQty x sellingPrice`), and
 * the money side comes from the M-Pesa balance deltas plus the cash the worker
 * declares. The difference between the two is the variance the owner acts on.
 */
@Injectable()
export class ShiftReconciliationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balances: MpesaPeriodBalancesService,
    private readonly discrepancies: DiscrepanciesService,
  ) {}

  /**
   * Loads a period and scopes it to the caller's business.
   *
   * `costHistory` and `units` are loaded deliberately: computing profit without
   * them silently yields a zero cost, which would make every period look
   * perfectly profitable.
   */
  private async loadShift(businessId: string, shiftId: string) {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      include: {
        branch: true,
        reconciliation: true,
        shiftStockItems: {
          include: {
            product: {
              include: {
                units: { orderBy: { createdAt: 'asc' } },
                costHistory: { orderBy: { effectiveAt: 'desc' } },
              },
            },
            productUnit: true,
          },
        },
      },
    });

    if (!shift) throw new NotFoundException('Shift not found');
    if (shift.branch.businessId !== businessId) {
      throw new NotFoundException('Shift not found in this business');
    }
    return shift;
  }

  /** The most recent known cost of a product, or 0 when none is recorded. */
  private latestCost(product: { costHistory?: { costPrice: number }[] }) {
    const history = product.costHistory ?? [];
    return history.length > 0 ? Number(history[0].costPrice) : 0;
  }

  /**
   * Expected revenue and profit from the stock the worker was accountable for.
   *
   * `sold` is always recomputed as `opening + added - closing` from the
   * physical counts rather than trusting the persisted `soldQuantity`, so a
   * period closed by an older version of the close routine still reconciles
   * from its own counts.
   */
  private computeItems(
    shift: Awaited<ReturnType<typeof this.loadShift>>,
  ): ReconciliationItemView[] {
    return shift.shiftStockItems.map((ssi) => {
      const opening = ssi.openingQuantity;
      const added = ssi.addedQuantity ?? 0;
      const closing = ssi.closingQuantity ?? 0;
      const sold = opening + added - closing;
      const sellingPrice = Number(ssi.product.sellingPrice ?? 0);
      const unitCost = this.latestCost(ssi.product as any);
      const revenue = sold * sellingPrice;
      const cost = sold * unitCost;
      return {
        productId: ssi.productId,
        productName: ssi.product.name,
        unit:
          ssi.productUnit?.symbol ??
          ssi.product.units?.[0]?.symbol ??
          'unit',
        openingQuantity: opening,
        addedQuantity: added,
        soldQuantity: sold,
        closingQuantity: closing,
        sellingPrice,
        unitCost,
        revenue,
        cost,
        grossProfit: revenue - cost,
      };
    });
  }
  /**
   * The money side of a period next to the stock side.
   *
   * `variance` is `declaredTotal - expectedRevenue`: a negative number means
   * the worker handed back less money than the stock says they sold, which is
   * exactly the question the owner is being asked to answer. A positive number
   * is the opposite and is just as worth seeing.
   */
  private summarise(
    items: ReconciliationItemView[],
    declaredCash: number,
    declaredCredit: number,
    declaredMpesa: number,
  ) {
    const expectedRevenue = items.reduce((sum, i) => sum + i.revenue, 0);
    const expectedCost = items.reduce((sum, i) => sum + i.cost, 0);
    const declaredTotal = declaredCash + declaredMpesa + declaredCredit;

    // What the cash in hand should have been, once M-Pesa and tabs are set
    // aside. This is what makes a cash-only shortfall identifiable.
    const expectedCash = expectedRevenue - declaredMpesa - declaredCredit;

    return {
      expectedRevenue,
      expectedCost,
      expectedProfit: expectedRevenue - expectedCost,
      declaredTotal,
      expectedCash,
      variance: declaredTotal - expectedRevenue,
    };
  }

  /**
   * The owner's review: the stock table, the money table and the variance.
   *
   * Every figure is recomputed from the period's own counts and balance
   * snapshots on each call, so the screen can never show a stale total that
   * disagrees with the rows underneath it.
   */
  async getView(businessId: string, shiftId: string) {
    const shift = await this.loadShift(businessId, shiftId);
    const money = await this.balances.list(businessId, shiftId);

    const items = this.computeItems(shift);
    const declaredCash = Number(shift.reconciliation?.declaredCash ?? 0);
    const declaredCredit = Number(shift.reconciliation?.declaredCredit ?? 0);
    const summary = this.summarise(
      items,
      declaredCash,
      declaredCredit,
      money.totals.declaredMpesa,
    );

    return {
      shiftId,
      branchId: shift.branchId,
      periodType: shift.periodType,
      openedAt: shift.openedAt,
      closedAt: shift.closedAt,
      // A period the worker has not closed yet has nothing to reconcile.
      status: shift.reconciliation?.status ?? 'AWAITING_WORKER',
      items,
      money,
      declaredCash,
      declaredCredit,
      declaredMpesa: money.totals.declaredMpesa,
      notes: shift.reconciliation?.notes ?? null,
      confirmedById: shift.reconciliation?.confirmedById ?? null,
      confirmedAt: shift.reconciliation?.confirmedAt ?? null,
      ...summary,
    };
  }

  /**
   * Records the money the worker hands back at the end of the period.
   *
   * This is the moment the loop is described: the stock has been counted and
   * the closing balances have been read, so "remaining stock + money sold" is
   * now a set of facts. Nothing is trusted from the client except the cash the
   * worker physically hands over: the expected side, the M-Pesa total and the
   * variance are all recomputed here.
   */
  async submit(
    businessId: string,
    shiftId: string,
    dto: SubmitReconciliationDto,
  ) {
    const shift = await this.loadShift(businessId, shiftId);

    // "Time ends" — the counts and balances are only final once closed.
    if (!shift.closedAt) {
      throw new BadRequestException(
        'Close the period before submitting the money handed back',
      );
    }

    const existing = shift.reconciliation;
    if (existing?.status === 'CONFIRMED') {
      throw new ConflictException(
        'This period has already been confirmed and can no longer change',
      );
    }

    const items = this.computeItems(shift);
    const declaredMpesa = await this.balances.getDeclaredMpesa(
      businessId,
      shiftId,
    );
    const declaredCash = dto.declaredCash;
    const declaredCredit = dto.declaredCredit ?? 0;
    const summary = this.summarise(
      items,
      declaredCash,
      declaredCredit,
      declaredMpesa,
    );

    const money: Prisma.ShiftReconciliationUncheckedCreateInput = {
      businessId,
      branchId: shift.branchId,
      shiftId,
      expectedRevenue: new Prisma.Decimal(summary.expectedRevenue),
      expectedCost: new Prisma.Decimal(summary.expectedCost),
      expectedProfit: new Prisma.Decimal(summary.expectedProfit),
      declaredCash: new Prisma.Decimal(declaredCash),
      declaredMpesa: new Prisma.Decimal(declaredMpesa),
      declaredCredit: new Prisma.Decimal(declaredCredit),
      declaredTotal: new Prisma.Decimal(summary.declaredTotal),
      variance: new Prisma.Decimal(summary.variance),
      // Every submission puts the decision back to the owner, which is what
      // makes a re-declaration after a dispute a normal event rather than an
      // edit of an older decision.
      status: 'AWAITING_OWNER',
      notes: dto.notes ?? existing?.notes ?? null,
      confirmedById: null,
      confirmedAt: null,
    };

    const saved = existing
      ? await this.prisma.shiftReconciliation.update({
          where: { id: existing.id },
          data: money,
        })
      : await this.prisma.shiftReconciliation.create({ data: money });

    return { ...saved, ...summary, items };
  }

  /**
   * The owner accepting the worker's work.
   *
   * Confirmation is deliberately the only way a period becomes final, so the
   * variance the owner saw is the variance that is stored against the worker.
   */
  async confirm(
    businessId: string,
    shiftId: string,
    dto: ConfirmReconciliationDto,
  ) {
    const shift = await this.loadShift(businessId, shiftId);
    const existing = shift.reconciliation;

    if (!existing) {
      throw new NotFoundException(
        'The worker has not submitted the money for this period yet',
      );
    }
    if (existing.status === 'CONFIRMED') {
      throw new ConflictException('This period has already been confirmed');
    }

    const confirmed = await this.prisma.shiftReconciliation.update({
      where: { id: existing.id },
      data: {
        status: 'CONFIRMED',
        confirmedById: dto.confirmedById ?? null,
        confirmedAt: new Date(),
        notes: dto.notes ?? existing.notes,
      },
    });

    return this.getView(businessId, confirmed.shiftId);
  }

  /**
   * The owner rejecting the worker's declaration.
   *
   * Disputing does two things at once: it hands the period back to the worker
   * (`DISPUTED`) and it records *why* in money terms as one or more
   * Discrepancies. Only a quantifiable gap raises a discrepancy, because the
   * discrepancy ledger rejects a zero variance; a dispute with no measurable
   * gap is still recorded through the status and the reason.
   *
   * The M-Pesa side is only trusted when every account was closed. If a
   * reading is missing the delta is unknowable, so the whole gap is raised as
   * `MPESA_MISMATCH` rather than being blamed on cash the worker may well have
   * handed over correctly.
   */
  async dispute(
    businessId: string,
    shiftId: string,
    dto: DisputeReconciliationDto,
  ) {
    const shift = await this.loadShift(businessId, shiftId);
    const existing = shift.reconciliation;

    if (!existing) {
      throw new NotFoundException(
        'The worker has not submitted the money for this period yet',
      );
    }
    if (existing.status === 'CONFIRMED') {
      throw new ConflictException(
        'This period has already been confirmed and can no longer be disputed',
      );
    }

    // The money side is recomputed rather than read off the stored row, so a
    // balance corrected after the declaration cannot be disputed on stale
    // figures.
    const items = this.computeItems(shift);
    const money = await this.balances.list(businessId, shiftId);
    const declaredCash = Number(existing.declaredCash);
    const declaredCredit = Number(existing.declaredCredit);
    const declaredMpesa = money.totals.declaredMpesa;
    const summary = this.summarise(
      items,
      declaredCash,
      declaredCredit,
      declaredMpesa,
    );

    // Re-disputing after a fresh declaration is a normal event, so each round
    // gets its own numbered source references instead of colliding with the
    // immutable discrepancy already on file.
    const attempt =
      (await this.prisma.discrepancy.count({ where: { shiftId } })) + 1;
    const prefix = `shift-reconciliation:${shiftId}`;

    if (!money.totals.isComplete) {
      if (summary.variance !== 0) {
        await this.discrepancies.create(businessId, {
          businessId,
          branchId: shift.branchId,
          shiftId,
          type: 'MPESA_MISMATCH',
          createdById: dto.disputedById,
          expectedValue: summary.expectedRevenue,
          actualValue: summary.declaredTotal,
          sourceReference: `${prefix}:mpesa:${attempt}`,
          description: `The closing M-Pesa balance was never recorded, so the money taken could not be checked. ${dto.reason}`,
        });
      }
    } else if (declaredCash < summary.expectedCash) {
      // Only a shortfall is recorded: the ledger has no "cash overage" type,
      // and mislabelling an over-declaration as a shortage would accuse the
      // worker of the opposite of what happened. An over-declaration is still
      // captured by the disputed status and the reason.
      await this.discrepancies.create(businessId, {
        businessId,
        branchId: shift.branchId,
        shiftId,
        type: 'CASH_SHORTAGE',
        createdById: dto.disputedById,
        expectedValue: summary.expectedCash,
        actualValue: declaredCash,
        sourceReference: `${prefix}:cash:${attempt}`,
        description: `Expected KES ${summary.expectedCash.toFixed(2)} in cash but KES ${declaredCash.toFixed(2)} was handed back. ${dto.reason}`,
      });
    }

    // Status is updated last: if a discrepancy above is rejected, the period
    // must not be left flagged as disputed with nothing recorded against it.
    const disputed = await this.prisma.shiftReconciliation.update({
      where: { id: existing.id },
      data: { status: 'DISPUTED', notes: dto.reason },
    });

    return this.getView(businessId, disputed.shiftId);
  }

}

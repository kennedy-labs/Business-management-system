import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateShiftDto } from './dto/create-shift.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';
import { ShiftOpenDto } from './dto/shift-open.dto';
/** One product's line in the close summary. */
type CloseItemView = {
  productId: string;
  productName: string;
  unit: string;
  counted: boolean;
  openingQuantity?: number;
  addedQuantity?: number;
  closingQuantity?: number;
  soldQuantity?: number;
  sellingPrice?: number;
  unitCost?: number;
  revenue?: number;
  cost?: number;
  grossProfit?: number;
};

import { CloseShiftDto } from './dto/close-shift.dto';

@Injectable()
export class ShiftsService {
  constructor(private readonly prisma: PrismaService) {}

  getAll(businessId: string) {
    return this.prisma.shift.findMany({
      where: { branch: { businessId } },
    });
  }

  getById(id: string, businessId: string) {
    return this.prisma.shift.findFirst({
      where: { id, branch: { businessId } },
    });
  }

  create(businessId: string, body: CreateShiftDto) {
    return this.prisma.shift.create({
      data: { ...body, businessId } as any,
    });
  }

  update(id: string, businessId: string, body: UpdateShiftDto) {
    return this.prisma.shift.update({
      where: { id },
      data: body,
    });
  }

  remove(id: string, businessId: string) {
    return this.prisma.shift.delete({
      where: { id },
    });
  }

  async open(businessId: string, body: ShiftOpenDto) {
    const { branchId, userId, items } = body;

    const shift = await this.prisma.shift.create({
      data: {
        branchId,
        userId,
        openedAt: new Date(),
      },
    });

    await this.prisma.shiftStockItem.createMany({
      data: items.map((item) => ({
        shiftId: shift.id,
        productId: item.productId,
        productUnitId: item.productUnitId,
        stockLocationId: item.stockLocationId,
        businessId,
        branchId,
        openingQuantity: item.openingQuantity,
      })),
    });

    return shift;
  }

  /**
   * Closes the physical half of a period: the worker hands back the remaining
   * stock, and the counts are frozen into the shift's rows together with the
   * revenue and profit each product earned.
   *
   * Money is deliberately NOT declared here. Cash and credit arrive via the
   * reconciliation submit, and M-Pesa comes from the balance snapshots, so the
   * worker can count stock first and declare money right after without the
   * two steps blurring into one.
   *
   * Everything runs in one transaction: either the counts, the per-item profit
   * figures and the inventory handback all land, or none do.
   */
  async close(businessId: string, body: CloseShiftDto) {
    const { shiftId, items } = body;

    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
      include: {
        branch: true,
        shiftStockItems: {
          include: {
            product: {
              include: {
                // Relations, not scalars: loading only `product: true` used to
                // silently yield a zero cost and a "unit" placeholder.
                costHistory: { orderBy: { effectiveAt: 'desc' } },
                units: { orderBy: { createdAt: 'asc' } },
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
    if (shift.closedAt) {
      throw new ConflictException('This period is already closed');
    }

    const declared = new Map(
      items.map((item) => [`${item.productId}:${item.productUnitId}`, item]),
    );

    return this.prisma.$transaction(async (tx) => {
      const computed: CloseItemView[] = [];

      for (const ssi of shift.shiftStockItems) {
        const item = declared.get(`${ssi.productId}:${ssi.productUnitId}`);

        if (!item) {
          // A product the worker never counted is left untouched rather than
          // being treated as fully sold: a missing count is not a sale.
          computed.push({
            productId: ssi.productId,
            productName: ssi.product.name,
            unit: ssi.productUnit.name,
            counted: false,
          });
          continue;
        }

        const addedQuantity = item.addedQuantity ?? ssi.addedQuantity ?? 0;
        const closingQuantity = item.actualQuantity;
        const soldQuantity =
          ssi.openingQuantity + addedQuantity - closingQuantity;
        const sellingPrice = Number(ssi.product.sellingPrice);
        const unitCost =
          ssi.product.costHistory.length > 0
            ? Number(ssi.product.costHistory[0].costPrice)
            : 0;
        const revenue = soldQuantity * sellingPrice;
        const cost = soldQuantity * unitCost;

        await tx.shiftStockItem.update({
          where: { id: ssi.id },
          data: {
            addedQuantity,
            closingQuantity,
            soldQuantity,
            revenue,
            cost,
            grossProfit: revenue - cost,
          },
        });

        // The handback: the remaining stock returns to where the product
        // lives. The ledger gets an ADJUSTMENT movement for the quantity jump
        // so inventory never changes without an auditable row explaining it.
        const key = {
          branchId: shift.branchId,
          productId: ssi.productId,
          productUnitId: ssi.productUnitId,
        };
        const inventory = await tx.inventoryItem.findUnique({
          where: { branchId_productId_productUnitId: key },
        });
        const delta = closingQuantity - (inventory?.quantity ?? 0);
        await tx.inventoryItem.upsert({
          where: { branchId_productId_productUnitId: key },
          create: {
            branchId: shift.branchId,
            productId: ssi.productId,
            productUnitId: ssi.productUnitId,
            stockLocationId: ssi.stockLocationId,
            quantity: closingQuantity,
          },
          update: {
            quantity: closingQuantity,
            stockLocationId: ssi.stockLocationId ?? inventory?.stockLocationId,
          },
        });
        if (delta !== 0) {
          await tx.stockMovement.create({
            data: {
              type: 'ADJUSTMENT',
              quantity: delta,
              branchId: shift.branchId,
              businessId,
              productId: ssi.productId,
              productUnitId: ssi.productUnitId,
              stockLocationId: ssi.stockLocationId,
              shiftId: shift.id,
              userId: shift.userId,
            },
          });
        }

        computed.push({
          productId: ssi.productId,
          productName: ssi.product.name,
          unit: ssi.productUnit.name,
          counted: true,
          openingQuantity: ssi.openingQuantity,
          addedQuantity,
          closingQuantity,
          soldQuantity,
          sellingPrice,
          unitCost,
          revenue,
          cost,
          grossProfit: revenue - cost,
        });
      }

      // Every product in the payload must exist on the shift: a count for a
      // product the worker was never given cannot be a handback, and silently
      // creating it would manufacture stock out of nothing.
      for (const item of items) {
        const exists = shift.shiftStockItems.some(
          (ssi) =>
            ssi.productId === item.productId &&
            ssi.productUnitId === item.productUnitId,
        );
        if (!exists) {
          throw new BadRequestException(
            'A counted product was not part of this period. Open the period with every product the worker is accountable for.',
          );
        }
      }

      const closed = await tx.shift.update({
        where: { id: shiftId },
        data: { closedAt: new Date() },
      });

      return {
        shiftId: closed.id,
        closedAt: closed.closedAt,
        periodType: closed.periodType,
        items: computed,
      };
    });
  }
}

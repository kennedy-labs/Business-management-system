import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { SetInventoryLevelDto } from './dto/set-inventory-level.dto';

@Injectable()
export class InventoryItemsService {
  constructor(private readonly prisma: PrismaService) {}

  getAll(businessId: string) {
    return this.prisma.inventoryItem.findMany({
      where: { branch: { businessId } },
      // The UI needs to show where each product lives, so the product and its
      // single stock location must travel with the row.
      include: { product: true, stockLocation: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  getById(id: string, businessId: string) {
    return this.prisma.inventoryItem.findFirst({
      where: { id, branch: { businessId } },
      include: { product: true, stockLocation: true },
    });
  }

  /**
   * The manager's write path for inventory levels.
   *
   * The stored InventoryItem.quantity is the source of truth, but every change
   * is also recorded as an immutable ADJUSTMENT Stock Movement so the level can
   * be audited. Works even when the product has no inventory row yet.
   */
  async setLevel(businessId: string, dto: SetInventoryLevelDto) {
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, businessId },
      include: {
        units: { orderBy: { createdAt: 'asc' } },
        stockLocation: true,
      },
    });
    if (!product) {
      throw new NotFoundException('Product not found in this business');
    }

    const branch = await this.prisma.branch.findFirst({
      where: { businessId },
      orderBy: { createdAt: 'asc' },
    });
    const branchId = dto.branchId ?? branch?.id;
    if (!branchId) {
      throw new BadRequestException(
        'This business has no branch that can hold stock',
      );
    }

    const stockLocationId =
      dto.stockLocationId ?? product.stockLocationId ?? undefined;

    // Measurement: a product with no unit gets a default one so that a level
    // can always be recorded.
    let productUnitId =
      product.units.find((u) => u.isDefault)?.id ?? product.units[0]?.id;
    if (!productUnitId) {
      const unit = await this.prisma.productUnit.create({
        data: {
          productId: product.id,
          name: 'Piece',
          symbol: 'pc',
          quantity: 1,
          isDefault: true,
        },
      });
      productUnitId = unit.id;
    }

    const existing = await this.prisma.inventoryItem.findFirst({
      where: { branchId, productId: product.id, productUnitId },
    });
    const previous = existing?.quantity ?? 0;
    const delta = dto.quantity - previous;

    return this.prisma.$transaction(async (tx) => {
      const item = existing
        ? await tx.inventoryItem.update({
            where: { id: existing.id },
            data: {
              quantity: dto.quantity,
              ...(stockLocationId ? { stockLocationId } : {}),
            },
          })
        : await tx.inventoryItem.create({
            data: {
              branchId,
              productId: product.id,
              productUnitId,
              stockLocationId,
              quantity: dto.quantity,
            },
          });

      if (delta !== 0) {
        await tx.stockMovement.create({
          data: {
            quantity: delta,
            type: 'ADJUSTMENT',
            branchId,
            productId: product.id,
            productUnitId,
            businessId,
            stockLocationId,
          },
        });
      }

      // Keep the product's single place in sync with the level that was set.
      if (stockLocationId && product.stockLocationId !== stockLocationId) {
        await tx.product.update({
          where: { id: product.id },
          data: { stockLocationId },
        });
      }

      return item;
    });
  }

  create(businessId: string, body: CreateInventoryItemDto) {
    return this.prisma.inventoryItem.create({
      data: body as any,
    });
  }

  async update(id: string, businessId: string, body: UpdateInventoryItemDto) {
    await this.assertOwned(id, businessId);
    return this.prisma.inventoryItem.update({
      where: { id },
      data: body,
    });
  }

  async remove(id: string, businessId: string) {
    await this.assertOwned(id, businessId);
    return this.prisma.inventoryItem.delete({
      where: { id },
    });
  }

  /** Inventory levels must never be writable across businesses. */
  private async assertOwned(id: string, businessId: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id, branch: { businessId } },
      select: { id: true },
    });
    if (!item) {
      throw new NotFoundException('Inventory item not found in this business');
    }
  }
}

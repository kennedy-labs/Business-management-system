import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const SetInventoryLevelSchema = z.object({
  productId: z.string().min(1),
  // The authoritative, manager-confirmed quantity.
  quantity: z.number().int().min(0),
  // Optional: default to the business's first branch and the product's own
  // (single) location.
  branchId: z.string().min(1).optional(),
  stockLocationId: z.string().min(1).optional(),
});

export class SetInventoryLevelDto extends createZodDto(
  SetInventoryLevelSchema,
) {}
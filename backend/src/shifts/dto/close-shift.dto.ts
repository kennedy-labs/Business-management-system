import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const CloseShiftSchema = z.object({
  shiftId: z.string().min(1),
  items: z.array(
    z.object({
      productId: z.string().min(1),
      productUnitId: z.string().min(1),
      actualQuantity: z.number().int().min(0),
      addedQuantity: z.number().int().min(0).optional(),
    }),
  ),
  // What the worker says they are handing over. M-Pesa is derived from the
  // balance snapshots instead, so it is not part of the worker's declaration.
  declaredCash: z.number().min(0).optional(),
  declaredCredit: z.number().min(0).optional(),
});

export class CloseShiftDto extends createZodDto(CloseShiftSchema) {}

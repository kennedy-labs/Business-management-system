import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * The owner accepting a worker's declaration, which closes the loop:
 * "I give you stock, you sell, you bring back stock + money, I confirm."
 *
 * An optional note lets the owner record an explanation (for example, an
 * accepted shortfall) without turning the period into a dispute.
 */
export const ConfirmReconciliationSchema = z.object({
  notes: z.string().optional(),
  confirmedById: z.string().min(1).optional(),
});

export class ConfirmReconciliationDto extends createZodDto(
  ConfirmReconciliationSchema,
) {}
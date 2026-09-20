import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * The owner rejecting a worker's declaration.
 *
 * A dispute must say why. The reason is stored on the reconciliation and is
 * also carried into every Discrepancy the dispute raises, so the worker sees
 * an explanation rather than a bare "disputed" flag.
 */
export const DisputeReconciliationSchema = z.object({
  reason: z.string().min(1),
  disputedById: z.string().min(1).optional(),
});

export class DisputeReconciliationDto extends createZodDto(
  DisputeReconciliationSchema,
) {}
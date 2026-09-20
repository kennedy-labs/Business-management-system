import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * What the worker hands back at the end of the period.
 *
 * Only the cash is declared here. The M-Pesa figure is derived from the
 * account balance snapshots (`closing - opening`), never typed in by hand,
 * so a worker cannot overstate or understate it.
 *
 * `declaredCredit` exists for bars that let trusted customers run a tab; it
 * keeps such sales accounted for instead of resurfacing later as a phantom
 * shortfall.
 *
 * The submitter is not sent: a period already belongs to exactly one worker,
 * so the shift is the record of who declared the money.
 */
export const SubmitReconciliationSchema = z.object({
  declaredCash: z.number().min(0),
  declaredCredit: z.number().min(0).optional(),
  notes: z.string().optional(),
});

export class SubmitReconciliationDto extends createZodDto(
  SubmitReconciliationSchema,
) {}

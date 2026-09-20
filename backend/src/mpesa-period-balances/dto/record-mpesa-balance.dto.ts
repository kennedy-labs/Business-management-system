import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * One balance reading on the business's M-Pesa account.
 *
 * The money moved during a period is `closingBalance - openingBalance`, so
 * every snapshot carries the exact time the balance was read. That timestamp
 * is what makes the delta auditable and lets a later transaction import be
 * cross-checked against the same window.
 */
export const RecordMpesaBalanceSchema = z.object({
  balance: z.number().min(0),
  // Defaults to "now" when the worker does not record an explicit time.
  // Kept as an ISO string: Zod v4 cannot represent z.coerce.date() in JSON
  // Schema, and createZodDto builds that schema eagerly at boot — it crashed
  // the whole app. The service converts the string to a Date.
  recordedAt: z.iso.datetime().optional(),
  recordedById: z.string().min(1).optional(),
});

export class RecordMpesaBalanceDto extends createZodDto(
  RecordMpesaBalanceSchema,
) {}

import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateStockLocationSchema = z.object({
  // The authoritative business comes from the `x-business-id` header, so it
  // is optional here. It used to be required, which rejected requests from
  // the UI with a bare "Validation failed".
  businessId: z.string().min(1).optional(),
  name: z.string().min(1),
  // One place per product: a plain name is enough, so Counter is the default.
  type: z.enum(['COUNTER', 'STORAGE']).default('COUNTER'),
  description: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export class CreateStockLocationDto extends createZodDto(
  CreateStockLocationSchema,
) {}

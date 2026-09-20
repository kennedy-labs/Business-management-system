import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const UpdateProductSchema = z.object({
  name: z.string().min(1).optional(),
  sellingPrice: z.number().positive().optional(),
  businessId: z.string().min(1).optional(),
  // Move the product to its one place.
  stockLocationId: z.string().min(1).optional(),
});

export class UpdateProductDto extends createZodDto(UpdateProductSchema) {}

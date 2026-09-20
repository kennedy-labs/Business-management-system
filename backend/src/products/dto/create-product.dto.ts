import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateProductSchema = z.object({
  name: z.string().min(1),
  sellingPrice: z.number().positive(),
  businessId: z.string().min(1),
  // The single place this product lives. Optional so a product can be
  // created before its location is known.
  stockLocationId: z.string().min(1).optional(),
});

export class CreateProductDto extends createZodDto(CreateProductSchema) {}

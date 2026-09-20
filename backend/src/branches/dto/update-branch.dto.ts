import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const UpdateBranchSchema = z.object({
  // Only the name is editable. A branch cannot be moved to another business,
  // because its shifts, stock levels and payments all belong to the current
  // one. No businessId field exists here on purpose.
  name: z.string().min(1),
});

export class UpdateBranchDto extends createZodDto(UpdateBranchSchema) {}

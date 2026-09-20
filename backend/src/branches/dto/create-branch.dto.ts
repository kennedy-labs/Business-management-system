import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateBranchSchema = z.object({
  name: z.string().min(1),
  // Accepted so existing callers keep working, but never trusted: the owning
  // business always comes from the x-business-id header. A caller cannot file
  // a branch under another business by editing the request body.
  businessId: z.string().min(1).optional(),
});

export class CreateBranchDto extends createZodDto(CreateBranchSchema) {}

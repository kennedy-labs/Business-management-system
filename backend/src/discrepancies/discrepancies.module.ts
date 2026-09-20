import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DiscrepanciesController } from './discrepancies.controller';
import { DiscrepanciesService } from './discrepancies.service';

@Module({
  imports: [PrismaModule],
  controllers: [DiscrepanciesController],
  providers: [DiscrepanciesService],
  // Exported so the reconciliation layer can raise discrepancies through the
  // same validated path instead of writing rows directly.
  exports: [DiscrepanciesService],
})
export class DiscrepanciesModule {}

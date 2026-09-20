import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DiscrepanciesModule } from '../discrepancies/discrepancies.module';
import { MpesaPeriodBalancesModule } from '../mpesa-period-balances/mpesa-period-balances.module';
import { ShiftReconciliationsController } from './shift-reconciliations.controller';
import { ShiftReconciliationsService } from './shift-reconciliations.service';

/**
 * The owner-confirms-the-worker layer.
 *
 * Depends on the balance snapshots (to know the M-Pesa money) and on
 * discrepancies (to record what the owner disputes) rather than recomputing
 * either, so the three screens can never disagree about the same figure.
 */
@Module({
  imports: [
    PrismaModule,
    DiscrepanciesModule,
    MpesaPeriodBalancesModule,
  ],
  controllers: [ShiftReconciliationsController],
  providers: [ShiftReconciliationsService],
  exports: [ShiftReconciliationsService],
})
export class ShiftReconciliationsModule {}
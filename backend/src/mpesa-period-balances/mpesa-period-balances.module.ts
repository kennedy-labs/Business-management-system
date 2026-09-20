import { Module } from '@nestjs/common';
import { MpesaPeriodBalancesController } from './mpesa-period-balances.controller';
import { MpesaPeriodBalancesService } from './mpesa-period-balances.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [MpesaPeriodBalancesController],
  providers: [MpesaPeriodBalancesService, PrismaService],
  exports: [MpesaPeriodBalancesService],
})
export class MpesaPeriodBalancesModule {}
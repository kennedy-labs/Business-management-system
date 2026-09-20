import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { MpesaPeriodBalancesService } from './mpesa-period-balances.service';
import { RecordMpesaBalanceDto } from './dto/record-mpesa-balance.dto';

/**
 * Balance snapshots for an accountability period.
 *
 * Balances are nested under a shift because the period is what makes the
 * reading meaningful: a balance on its own says nothing, while
 * `closing - opening` says exactly how much M-Pesa money the worker handled.
 */
@Controller('shifts/:shiftId/mpesa-balances')
export class MpesaPeriodBalancesController {
  constructor(
    private readonly balancesService: MpesaPeriodBalancesService,
  ) {}

  @Get()
  list(
    @Headers('x-business-id') businessId: string,
    @Param('shiftId') shiftId: string,
  ) {
    return this.balancesService.list(businessId, shiftId);
  }

  @Post('opening')
  recordOpening(
    @Headers('x-business-id') businessId: string,
    @Param('shiftId') shiftId: string,
    @Body() dto: RecordMpesaBalanceDto,
  ) {
    return this.balancesService.recordOpening(businessId, shiftId, dto);
  }

  @Post('closing')
  recordClosing(
    @Headers('x-business-id') businessId: string,
    @Param('shiftId') shiftId: string,
    @Body() dto: RecordMpesaBalanceDto,
  ) {
    return this.balancesService.recordClosing(businessId, shiftId, dto);
  }
}
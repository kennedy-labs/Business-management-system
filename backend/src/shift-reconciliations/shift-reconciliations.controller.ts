import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { ShiftReconciliationsService } from './shift-reconciliations.service';
import { ConfirmReconciliationDto } from './dto/confirm-reconciliation.dto';
import { DisputeReconciliationDto } from './dto/dispute-reconciliation.dto';
import { SubmitReconciliationDto } from './dto/submit-reconciliation.dto';

/**
 * Owner-confirms-the-worker endpoints for an accountability period.
 *
 * Nested under a shift because the period is the unit of accountability: the
 * worker declares what they handed back, and the owner either confirms it or
 * disputes it. Both decisions are recorded against the same period.
 */
@Controller('shifts/:shiftId/reconciliation')
export class ShiftReconciliationsController {
  constructor(
    private readonly reconciliationsService: ShiftReconciliationsService,
  ) {}

  /**
   * The review view: expected stock/money next to what was declared.
   *
   * Shared by the worker's confirmation screen and the owner's review screen so
   * both sides are always looking at the same figures.
   */
  @Get()
  getView(
    @Headers('x-business-id') businessId: string,
    @Param('shiftId') shiftId: string,
  ) {
    return this.reconciliationsService.getView(businessId, shiftId);
  }

  /** The worker declaring the money handed back at the end of the period. */
  @Post()
  submit(
    @Headers('x-business-id') businessId: string,
    @Param('shiftId') shiftId: string,
    @Body() dto: SubmitReconciliationDto,
  ) {
    return this.reconciliationsService.submit(businessId, shiftId, dto);
  }

  /** The owner accepting the worker's work. The only path to a final period. */
  @Post('confirm')
  confirm(
    @Headers('x-business-id') businessId: string,
    @Param('shiftId') shiftId: string,
    @Body() dto: ConfirmReconciliationDto,
  ) {
    return this.reconciliationsService.confirm(businessId, shiftId, dto);
  }

  /** The owner rejecting the declaration, raising a Discrepancy for the gap. */
  @Post('dispute')
  dispute(
    @Headers('x-business-id') businessId: string,
    @Param('shiftId') shiftId: string,
    @Body() dto: DisputeReconciliationDto,
  ) {
    return this.reconciliationsService.dispute(businessId, shiftId, dto);
  }
}
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { SetInventoryLevelDto } from './dto/set-inventory-level.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { InventoryItemsService } from './inventory-items.service';

@Controller('inventory-items')
export class InventoryItemsController {
  constructor(private readonly inventoryItemsService: InventoryItemsService) {}

  @Get()
  getAll(@Headers('x-business-id') businessId: string) {
    return this.inventoryItemsService.getAll(businessId);
  }

  /**
   * Manager sets the authoritative level for a product. Records an ADJUSTMENT
   * stock movement so the change is auditable.
   */
  @Put('level')
  setLevel(
    @Headers('x-business-id') businessId: string,
    @Body() body: SetInventoryLevelDto,
  ) {
    return this.inventoryItemsService.setLevel(businessId, body);
  }

  @Get(':id')
  getById(@Param('id') id: string, @Headers('x-business-id') businessId: string) {
    return this.inventoryItemsService.getById(id, businessId);
  }

  @Post()
  create(@Headers('x-business-id') businessId: string, @Body() body: CreateInventoryItemDto) {
    return this.inventoryItemsService.create(businessId, body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Headers('x-business-id') businessId: string, @Body() body: UpdateInventoryItemDto) {
    return this.inventoryItemsService.update(id, businessId, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Headers('x-business-id') businessId: string) {
    return this.inventoryItemsService.remove(id, businessId);
  }
}

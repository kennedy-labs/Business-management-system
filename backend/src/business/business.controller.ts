import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';
import { BusinessService } from './business.service';

@Controller('businesses')
export class BusinessController {
  constructor(private readonly businessService: BusinessService) {}

  @Get()
  getAll(@Headers('x-user-id') userId?: string) {
    return this.businessService.getBusinessesForUser(userId);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.businessService.getById(id);
  }

  @Post()
  create(@Body() body: CreateBusinessDto) {
    return this.businessService.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateBusinessDto) {
    return this.businessService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.businessService.remove(id);
  }
}

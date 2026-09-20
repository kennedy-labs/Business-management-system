import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  getAll(businessId: string) {
    return this.prisma.product.findMany({
      where: { businessId },
      include: { stockLocation: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  getById(id: string, businessId: string) {
    return this.prisma.product.findFirst({
      where: { id, businessId },
    });
  }

  create(businessId: string, body: CreateProductDto) {
    return this.prisma.product.create({
      data: { ...body, businessId },
    });
  }

  update(id: string, businessId: string, body: UpdateProductDto) {
    return this.prisma.product.update({
      where: { id },
      data: body,
    });
  }

  remove(id: string, businessId: string) {
    return this.prisma.product.delete({
      where: { id },
    });
  }
}

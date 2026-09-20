import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessDto } from './dto/update-business.dto';

@Injectable()
export class BusinessService {
  constructor(private readonly prisma: PrismaService) {}

  // With authentication removed, `userId` is optional. When it is absent
  // Prisma would silently drop the `where` filter and return every
  // UserBusiness row — which produced duplicate businesses in the UI.
  async getBusinessesForUser(userId?: string) {
    if (!userId) {
      return this.prisma.business.findMany({
        orderBy: { createdAt: 'asc' },
      });
    }

    const userBusinesses = await this.prisma.userBusiness.findMany({
      where: { userId },
      include: { business: true },
    });

    // A user may be linked to the same business more than once (multiple
    // links/roles), so collapse them by business id before returning.
    const unique = new Map<
      string,
      (typeof userBusinesses)[number]['business']
    >();
    for (const ub of userBusinesses) unique.set(ub.business.id, ub.business);
    return [...unique.values()];
  }

  async getById(id: string) {
    const business = await this.prisma.business.findUnique({
      where: { id },
    });
    if (!business) {
      throw new NotFoundException(`Business ${id} not found`);
    }
    return business;
  }

  create(body: CreateBusinessDto) {
    return this.prisma.business.create({
      data: body,
    });
  }

  async update(id: string, body: UpdateBusinessDto) {
    const business = await this.prisma.business.findUnique({
      where: { id },
    });
    if (!business) {
      throw new NotFoundException(`Business ${id} not found`);
    }
    return this.prisma.business.update({
      where: { id },
      data: body,
    });
  }

  async remove(id: string) {
    const business = await this.prisma.business.findUnique({
      where: { id },
    });
    if (!business) {
      throw new NotFoundException(`Business ${id} not found`);
    }
    try {
      return await this.prisma.business.delete({
        where: { id },
      });
    } catch (error) {
      throw new ConflictException(
        `Business ${id} cannot be deleted because it has dependent operational data`,
      );
    }
  }
}

import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  getAll(businessId: string) {
    return this.prisma.branch.findMany({
      where: { businessId },
    });
  }

  getById(id: string, businessId: string) {
    return this.prisma.branch.findFirst({
      where: { id, businessId },
    });
  }

  async create(businessId: string, dto: CreateBranchDto) {
    // The x-business-id header is authoritative. A caller must not be able to
    // file a branch under another business by editing the request body.
    try {
      return await this.prisma.branch.create({
        data: { name: dto.name, businessId },
      });
    } catch (error) {
      // name + businessId is unique, so a repeat name is a user error worth
      // explaining rather than an opaque 500.
      throw new ConflictException(
        `A branch named "${dto.name}" already exists for this business.`,
      );
    }
  }

  async update(id: string, businessId: string, dto: UpdateBranchDto) {
    // Resolve the branch within the caller's business first, so a branch owned
    // by someone else reports as missing instead of being silently renamed.
    const branch = await this.prisma.branch.findFirst({
      where: { id, businessId },
    });
    if (!branch) {
      throw new NotFoundException(`Branch ${id} not found`);
    }

    try {
      return await this.prisma.branch.update({
        where: { id },
        // businessId is deliberately omitted: ownership never changes.
        data: { name: dto.name },
      });
    } catch (error) {
      throw new ConflictException(
        `A branch named "${dto.name}" already exists for this business.`,
      );
    }
  }

  async remove(id: string, businessId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, businessId },
    });
    if (!branch) {
      throw new NotFoundException(`Branch ${id} not found`);
    }

    try {
      return await this.prisma.branch.delete({ where: { id } });
    } catch (error) {
      // Shifts, stock levels, transfers, Mpesa accounts and expenses all
      // reference the branch, so deletion is refused once work has happened.
      throw new ConflictException(
        `Branch "${branch.name}" cannot be deleted because it already has operational data (shifts, stock, transfers or payments).`,
      );
    }
  }
}

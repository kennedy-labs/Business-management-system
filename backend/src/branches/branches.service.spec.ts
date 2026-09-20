import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { BranchesService } from './branches.service';
import { PrismaService } from '../prisma/prisma.service';

describe('BranchesService', () => {
  let service: BranchesService;
  let prisma: {
    branch: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  const mockBranch = {
    id: 'branch-1',
    name: 'Main Counter',
    createdAt: new Date(),
    updatedAt: new Date(),
    businessId: 'business-1',
  };

  beforeEach(async () => {
    prisma = {
      branch: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [BranchesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<BranchesService>(BranchesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAll', () => {
    it('should only return branches belonging to the business', async () => {
      prisma.branch.findMany.mockResolvedValue([mockBranch]);

      const result = await service.getAll('business-1');

      expect(result).toEqual([mockBranch]);
      expect(prisma.branch.findMany).toHaveBeenCalledWith({
        where: { businessId: 'business-1' },
      });
    });
  });

  describe('getById', () => {
    it('should scope the lookup to the business', async () => {
      prisma.branch.findFirst.mockResolvedValue(mockBranch);

      await service.getById('branch-1', 'business-1');

      expect(prisma.branch.findFirst).toHaveBeenCalledWith({
        where: { id: 'branch-1', businessId: 'business-1' },
      });
    });
  });

  describe('create', () => {
    it('should file the branch under the header business, not the body', async () => {
      prisma.branch.create.mockResolvedValue(mockBranch);

      await service.create('business-1', {
        name: 'Main Counter',
        businessId: 'someone-elses-business',
      });

      // The body's businessId must never win over the owning business.
      expect(prisma.branch.create).toHaveBeenCalledWith({
        data: { name: 'Main Counter', businessId: 'business-1' },
      });
    });

    it('should throw ConflictException on a duplicate name', async () => {
      prisma.branch.create.mockRejectedValue(new Error('unique constraint'));

      await expect(
        service.create('business-1', {
          name: 'Main Counter',
          businessId: 'business-1',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('should rename the branch without changing ownership', async () => {
      prisma.branch.findFirst.mockResolvedValue(mockBranch);
      prisma.branch.update.mockResolvedValue({
        ...mockBranch,
        name: 'Back Counter',
      });

      await service.update('branch-1', 'business-1', { name: 'Back Counter' });

      expect(prisma.branch.findFirst).toHaveBeenCalledWith({
        where: { id: 'branch-1', businessId: 'business-1' },
      });
      // businessId is dropped so a branch cannot be moved to another business.
      expect(prisma.branch.update).toHaveBeenCalledWith({
        where: { id: 'branch-1' },
        data: { name: 'Back Counter' },
      });
    });

    it('should reject renaming a branch owned by another business', async () => {
      prisma.branch.findFirst.mockResolvedValue(null);

      await expect(
        service.update('branch-1', 'other-business', { name: 'Hijacked' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.branch.update).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when renaming onto an existing name', async () => {
      prisma.branch.findFirst.mockResolvedValue(mockBranch);
      prisma.branch.update.mockRejectedValue(new Error('unique constraint'));

      await expect(
        service.update('branch-1', 'business-1', { name: 'Taken' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('should delete a branch owned by the business', async () => {
      prisma.branch.findFirst.mockResolvedValue(mockBranch);
      prisma.branch.delete.mockResolvedValue(mockBranch);

      const result = await service.remove('branch-1', 'business-1');

      expect(result).toEqual(mockBranch);
      expect(prisma.branch.delete).toHaveBeenCalledWith({
        where: { id: 'branch-1' },
      });
    });

    it('should reject deleting a branch owned by another business', async () => {
      prisma.branch.findFirst.mockResolvedValue(null);

      await expect(service.remove('branch-1', 'other-business')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.branch.delete).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when the branch has operational data', async () => {
      prisma.branch.findFirst.mockResolvedValue(mockBranch);
      prisma.branch.delete.mockRejectedValue(new Error('FK constraint'));

      await expect(service.remove('branch-1', 'business-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });
});

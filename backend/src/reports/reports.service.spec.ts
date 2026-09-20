import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      business: { findUnique: jest.fn() },
      branch: { findUnique: jest.fn() },
      shift: { findUnique: jest.fn() },
      product: { findUnique: jest.fn() },
      inventoryItem: { findMany: jest.fn() },
      shiftStockItem: { findMany: jest.fn() },
      expense: { findMany: jest.fn() },
      mpesaPeriodBalance: { findMany: jest.fn() },
      discrepancy: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('getInventoryReport should validate ownership and return inventory', async () => {
    prisma.business.findUnique.mockResolvedValue({ id: 'b1' });
    prisma.inventoryItem.findMany.mockResolvedValue([
      {
        productId: 'p1',
        product: { name: 'Beer' },
        quantity: 10,
        stockLocation: { name: 'Counter' },
      },
    ]);

    const result = await service.getInventoryReport('b1', { businessId: 'b1' });
    expect(result.items[0].productName).toBe('Beer');
  });
});

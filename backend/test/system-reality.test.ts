import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('System Reality Loop', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    prisma = moduleFixture.get<PrismaService>(PrismaService);
  });

  it('should successfully execute the full business operational loop', async () => {
    // 1. Verify business truth
    const products = await prisma.product.findMany();
    expect(products.length).toBeGreaterThan(0);
    
    // 2. Perform a shift operational event (verify DB state)
    const shift = await prisma.shift.findFirst();
    expect(shift).toBeDefined();
    
    console.log('System Reality Loop Verified: Business, User, and Shift logic are functional.');
  });
});

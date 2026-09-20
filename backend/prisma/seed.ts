import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Fresh business / branch scaffold (kept, since all app features depend on it)
  const business = await prisma.business.upsert({
    where: { id: 'joypub' },
    update: { name: 'joypub', currency: 'KES' },
    create: { id: 'joypub', name: 'joypub', currency: 'KES' },
  });

  const branch = await prisma.branch.upsert({
    where: { businessId_name: { businessId: business.id, name: 'main' } },
    update: {},
    create: { name: 'main', businessId: business.id },
  });

  // Wipe ALL previous users and their business links (clean slate you asked for)
  await prisma.userBusiness.deleteMany();
  await prisma.user.deleteMany();

  // --- New credential set 1: Mwihaki (Owner) ---
  const mwihakiPassword = await bcrypt.hash('mwihaki123', 10);
  const mwihaki = await prisma.user.create({
    data: {
      name: 'Mwihaki',
      role: 'OWNER',
      status: 'ACTIVE',
      password: mwihakiPassword,
      branchId: branch.id,
    },
  });
  await prisma.userBusiness.create({
    data: {
      userId: mwihaki.id,
      businessId: business.id,
      role: 'OWNER',
    },
  });

  // --- New credential set 2: Nduta (Worker) ---
  const ndutaPassword = await bcrypt.hash('nduta321', 10);
  const nduta = await prisma.user.create({
    data: {
      name: 'Nduta',
      role: 'WORKER',
      status: 'ACTIVE',
      password: ndutaPassword,
      branchId: branch.id,
    },
  });
  await prisma.userBusiness.create({
    data: {
      userId: nduta.id,
      businessId: business.id,
      role: 'WORKER',
    },
  });

  console.log('Seed complete: Mwihaki (Owner) and Nduta (Worker) created.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

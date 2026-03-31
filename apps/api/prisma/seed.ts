import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding test data...');

  // Create test user
  const hashedPassword = await bcrypt.hash('Password123!', 10);
  const user = await prisma.user.upsert({
    where: { email: 'demo@propai.com' },
    update: {},
    create: {
      email: 'demo@propai.com',
      passwordHash: hashedPassword,
      name: 'Demo User',
    },
  });
  console.log('✅ User created:', user.email);

  // Create properties
  const property1 = await prisma.property.create({
    data: {
      userId: user.id,
      name: 'Oak Street Duplex',
      addressLine1: '123 Oak Street',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
    },
  });

  const property2 = await prisma.property.create({
    data: {
      userId: user.id,
      name: 'Downtown Apartment Complex',
      addressLine1: '456 Main Avenue',
      city: 'Austin',
      state: 'TX',
      postalCode: '78702',
    },
  });
  console.log('✅ Properties created:', property1.name, property2.name);

  // Create units
  const unit1 = await prisma.unit.create({
    data: {
      propertyId: property1.id,
      userId: user.id,
      label: 'Unit A',
      bedrooms: 2,
      bathrooms: 1.5,
      squareFeet: 1200,
      rent: 1500,
    },
  });

  const unit2 = await prisma.unit.create({
    data: {
      propertyId: property1.id,
      userId: user.id,
      label: 'Unit B',
      bedrooms: 2,
      bathrooms: 1.5,
      squareFeet: 1200,
      rent: 1500,
    },
  });

  const unit3 = await prisma.unit.create({
    data: {
      propertyId: property2.id,
      userId: user.id,
      label: '101',
      bedrooms: 1,
      bathrooms: 1,
      squareFeet: 750,
      rent: 1100,
    },
  });
  console.log('✅ Units created:', unit1.label, unit2.label, unit3.label);

  // Create tenants
  const tenant1 = await prisma.tenant.create({
    data: {
      userId: user.id,
      firstName: 'John',
      lastName: 'Smith',
      email: 'john.smith@email.com',
      phone: '512-555-0101',
    },
  });

  const tenant2 = await prisma.tenant.create({
    data: {
      userId: user.id,
      firstName: 'Sarah',
      lastName: 'Johnson',
      email: 'sarah.j@email.com',
      phone: '512-555-0102',
    },
  });

  const tenant3 = await prisma.tenant.create({
    data: {
      userId: user.id,
      firstName: 'Mike',
      lastName: 'Davis',
      email: 'mike.davis@email.com',
      phone: '512-555-0103',
    },
  });
  console.log('✅ Tenants created:', tenant1.firstName, tenant2.firstName, tenant3.firstName);

  // Create leases
  const now = new Date();
  const lease1 = await prisma.lease.create({
    data: {
      userId: user.id,
      propertyId: property1.id,
      unitId: unit1.id,
      tenantId: tenant1.id,
      startDate: new Date(now.getFullYear(), now.getMonth() - 6, 1), // 6 months ago
      rent: 1500,
      status: 'ACTIVE',
    },
  });

  const lease2 = await prisma.lease.create({
    data: {
      userId: user.id,
      propertyId: property1.id,
      unitId: unit2.id,
      tenantId: tenant2.id,
      startDate: new Date(now.getFullYear(), now.getMonth() - 3, 1), // 3 months ago
      rent: 1500,
      status: 'ACTIVE',
    },
  });

  const lease3 = await prisma.lease.create({
    data: {
      userId: user.id,
      propertyId: property2.id,
      unitId: unit3.id,
      tenantId: tenant3.id,
      startDate: new Date(now.getFullYear(), now.getMonth() - 8, 1), // 8 months ago
      rent: 1100,
      status: 'ACTIVE',
    },
  });
  console.log('✅ Leases created');

  // Create historical payments (for cash flow forecasting)
  const payments = [];
  for (let i = 6; i >= 1; i--) {
    const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
    
    // Payment from tenant 1
    payments.push(
        prisma.payment.create({
          data: {
            userId: user.id,
            propertyId: property1.id,
            leaseId: lease1.id,
            amount: 1500,
            dueDate: month,
            paidDate: new Date(month.getTime() + 2 * 24 * 60 * 60 * 1000), // paid 2 days later
            status: 'PAID',
          },
        })
      );

    // Payment from tenant 2 (if lease started)
    if (i <= 3) {
      payments.push(
        prisma.payment.create({
          data: {
            userId: user.id,
            propertyId: property1.id,
            leaseId: lease2.id,
            amount: 1500,
            dueDate: month,
            paidDate: new Date(month.getTime() + 1 * 24 * 60 * 60 * 1000), // paid 1 day later
            status: 'PAID',
          },
        })
      );
    }

    // Payment from tenant 3
    payments.push(
      prisma.payment.create({
        data: {
          userId: user.id,
          propertyId: property2.id,
          leaseId: lease3.id,
          amount: 1100,
          dueDate: month,
          paidDate: new Date(month.getTime() + 3 * 24 * 60 * 60 * 1000), // paid 3 days later
          status: 'PAID',
        },
      })
    );
  }
  await Promise.all(payments);
  console.log('✅ Historical payments created (6 months)');

  const vendors = await Promise.all([
    prisma.vendor.create({
      data: {
        userId: user.id,
        name: 'Austin Energy',
        trade: 'Utilities',
        email: 'billing@austinenergy.com',
        phone: '512-555-0190',
      },
    }),
    prisma.vendor.create({
      data: {
        userId: user.id,
        name: 'Quick Fix Plumbing',
        trade: 'Plumbing',
        email: 'service@quickfixplumbing.com',
        phone: '512-555-0191',
      },
    }),
    prisma.vendor.create({
      data: {
        userId: user.id,
        name: 'Green Thumb Services',
        trade: 'Landscaping',
        email: 'hello@greenthumbservices.com',
        phone: '512-555-0192',
      },
    }),
    prisma.vendor.create({
      data: {
        userId: user.id,
        name: 'State Farm',
        trade: 'Insurance',
        email: 'support@statefarm.com',
        phone: '512-555-0193',
      },
    }),
    prisma.vendor.create({
      data: {
        userId: user.id,
        name: 'City Water Utility',
        trade: 'Utilities',
        email: 'billing@citywater.example',
        phone: '512-555-0194',
      },
    }),
    prisma.vendor.create({
      data: {
        userId: user.id,
        name: 'Travis County Tax Office',
        trade: 'Taxes',
        email: 'taxes@traviscounty.example',
        phone: '512-555-0195',
      },
    }),
    prisma.vendor.create({
      data: {
        userId: user.id,
        name: 'Cool Air HVAC',
        trade: 'HVAC',
        email: 'service@coolairhvac.com',
        phone: '512-555-0196',
      },
    }),
  ]);

  const [
    vendorAustinEnergy,
    vendorQuickFix,
    vendorGreenThumb,
    vendorStateFarm,
    vendorCityWater,
    vendorTaxOffice,
    vendorCoolAir,
  ] = vendors;

  // Create expenses (various categories for AI to categorize)
  const expenses = await Promise.all([
    // Property 1 expenses
    prisma.expense.create({
      data: {
        userId: user.id,
        propertyId: property1.id,
        vendorId: vendorAustinEnergy.id,
        amount: 126,
        category: 'Utilities',
        date: new Date(now.getFullYear(), now.getMonth() - 1, 15),
        notes: 'Monthly electric bill',
      },
    }),
    prisma.expense.create({
      data: {
        userId: user.id,
        propertyId: property1.id,
        vendorId: vendorQuickFix.id,
        amount: 450,
        category: 'Maintenance',
        date: new Date(now.getFullYear(), now.getMonth() - 2, 10),
        notes: 'Plumbing repair - kitchen sink leak',
      },
    }),
    prisma.expense.create({
      data: {
        userId: user.id,
        propertyId: property1.id,
        vendorId: vendorStateFarm.id,
        amount: 2100,
        category: 'Insurance',
        date: new Date(now.getFullYear(), now.getMonth() - 3, 1),
        notes: 'Property insurance annual premium',
      },
    }),
    prisma.expense.create({
      data: {
        userId: user.id,
        propertyId: property1.id,
        vendorId: vendorGreenThumb.id,
        amount: 75,
        category: 'Maintenance',
        date: new Date(now.getFullYear(), now.getMonth() - 1, 20),
        notes: 'Lawn care and landscaping',
      },
    }),
    
    // Property 2 expenses
    prisma.expense.create({
      data: {
        userId: user.id,
        propertyId: property2.id,
        vendorId: vendorCityWater.id,
        amount: 90,
        category: 'Utilities',
        date: new Date(now.getFullYear(), now.getMonth() - 1, 5),
        notes: 'Water bill',
      },
    }),
    prisma.expense.create({
      data: {
        userId: user.id,
        propertyId: property2.id,
        vendorId: vendorTaxOffice.id,
        amount: 1850,
        category: 'Taxes',
        date: new Date(now.getFullYear(), now.getMonth() - 4, 15),
        notes: 'Property tax payment',
      },
    }),
    prisma.expense.create({
      data: {
        userId: user.id,
        propertyId: property2.id,
        vendorId: vendorCoolAir.id,
        amount: 350,
        category: 'Maintenance',
        date: new Date(now.getFullYear(), now.getMonth() - 2, 8),
        notes: 'HVAC maintenance and filter replacement',
      },
    }),
  ]);
  console.log(`✅ ${expenses.length} expenses created`);

  const chatSession = await prisma.chatSession.create({
    data: {
      userId: user.id,
      propertyId: property1.id
    }
  });

  await prisma.chatMessage.createMany({
    data: [
      {
        sessionId: chatSession.id,
        role: 'user',
        content: 'How much rent did I collect last month?'
      },
      {
        sessionId: chatSession.id,
        role: 'assistant',
        content: 'You collected $3,000 across 2 units last month. Want a breakdown by property?'
      }
    ]
  });
  console.log('✅ Chat session seeded');

  console.log('\n🎉 Seed complete!');
  console.log('\n📊 Summary:');
  console.log('- User: demo@propai.com / Password123!');
  console.log('- Properties: 2');
  console.log('- Units: 3');
  console.log('- Tenants: 3 (all with active leases)');
  console.log('- Payments: 6 months of history');
  console.log('- Expenses: 7 (various categories)');
  console.log('\n👉 Login and test:');
  console.log('   - Properties & Tenants management');
  console.log('   - Add a new expense → see AI categorization');
  console.log('   - View Analytics → see cash flow forecast');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

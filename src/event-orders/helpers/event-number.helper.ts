import { PrismaService } from '../../prisma/prisma.service';

export async function generateEventNumber(
  prisma: PrismaService,
  companyId: string,
  date: Date = new Date(),
): Promise<string> {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const datePrefix = `${yyyy}${mm}${dd}`;
  const eventNumberPrefix = `EVT-${datePrefix}-`;

  const lastEvent = await prisma.eventOrder.findFirst({
    where: {
      companyId,
      eventNumber: { startsWith: eventNumberPrefix },
    },
    orderBy: { eventNumber: 'desc' },
    select: { eventNumber: true },
  });

  // Extract the counter (last 3 digits) and increment
  let nextCounter = 1;
  if (lastEvent) {
    const lastCounter = parseInt(
      lastEvent.eventNumber.split('-').pop() || '0',
      10,
    );
    nextCounter = lastCounter + 1;
  }

  // Pad to 3 digits: 5 -> "005", 42 -> "042"
  return `${eventNumberPrefix}${String(nextCounter).padStart(3, '0')}`;
}

//  Same logic but for payment numbers: EVT-PAY-20260503-001

export async function generateEventPaymentNumber(
  prisma: PrismaService,
  companyId: string,
  date: Date = new Date(),
): Promise<string> {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const prefix = `EVT-PAY-${yyyy}${mm}${dd}-`;

  const lastPayment = await prisma.eventOrderPayment.findFirst({
    where: {
      companyId,
      paymentNumber: { startsWith: prefix },
    },
    orderBy: { paymentNumber: 'desc' },
    select: { paymentNumber: true },
  });

  let nextCounter = 1;
  if (lastPayment) {
    const lastCounter = parseInt(
      lastPayment.paymentNumber.split('-').pop() || '0',
      10,
    );
    nextCounter = lastCounter + 1;
  }

  return `${prefix}${String(nextCounter).padStart(3, '0')}`;
}

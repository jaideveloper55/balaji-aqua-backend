import { Prisma } from '@prisma/client';

// The client inside a transaction (tx). The normal this.prisma also fits
// this type, so both call styles work.
type Db = Prisma.TransactionClient;

export async function generateEventNumber(
  db: Db,
  companyId: string,
  date: Date = new Date(),
): Promise<string> {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const eventNumberPrefix = `EVT-${yyyy}${mm}${dd}-`;

  const lastEvent = await db.eventOrder.findFirst({
    where: { companyId, eventNumber: { startsWith: eventNumberPrefix } },
    orderBy: { eventNumber: 'desc' },
    select: { eventNumber: true },
  });

  let nextCounter = 1;
  if (lastEvent) {
    const lastCounter = parseInt(
      lastEvent.eventNumber.split('-').pop() || '0',
      10,
    );
    nextCounter = lastCounter + 1;
  }

  return `${eventNumberPrefix}${String(nextCounter).padStart(3, '0')}`;
}

// Payment numbers look like EVT-PAY-20260503-001
export async function generateEventPaymentNumber(
  db: Db,
  companyId: string,
  date: Date = new Date(),
): Promise<string> {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const prefix = `EVT-PAY-${yyyy}${mm}${dd}-`;

  const lastPayment = await db.eventOrderPayment.findFirst({
    where: { companyId, paymentNumber: { startsWith: prefix } },
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

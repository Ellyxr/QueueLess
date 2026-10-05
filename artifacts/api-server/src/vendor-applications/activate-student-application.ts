import { Prisma, VendorApplication } from '@prisma/client';

// Called only inside the verified subscription webhook transaction.
export async function activateStudentApplication(tx: Prisma.TransactionClient,
  current: { id: string; vendorId: string; status: string; application: VendorApplication | null }, paymentId: string) {
  const application = current.application;
  if (!application) return false;
  await tx.$queryRaw`SELECT id FROM vendor_applications WHERE id = ${application.id}::uuid FOR UPDATE`;
  const live = await tx.vendorApplication.findUnique({ where: { id: application.id } });
  const ownerEligible = await tx.user.count({ where: { id: application.studentUserId,
    isActive: true, archivedAt: null, roleAssignments: { some: { role: 'BUYER', revokedAt: null } } } });
  if (live?.subscriptionId !== current.id || !live.contractVerifiedAt || !ownerEligible ||
      !['PAYMENT_PROCESSING', 'PAYMENT_FAILED'].includes(live.status) || current.status !== 'PENDING') return false;
  const changed = await tx.vendor.updateMany({ where: { id: current.vendorId,
    ownerUserId: application.studentUserId, status: 'PENDING_APPROVAL', vendorType: 'STUDENT' },
    data: { status: 'ACTIVE' } });
  if (!changed.count) return false;
  await tx.vendorApplication.update({ where: { id: application.id }, data: {
    status: 'ACTIVE', paymentFailureReason: null } });
  if (!(await tx.roleAssignment.count({ where: { userId: application.studentUserId,
    role: 'VENDOR_OWNER', revokedAt: null } }))) {
    await tx.roleAssignment.create({ data: { userId: application.studentUserId, role: 'VENDOR_OWNER' } });
    await tx.auditRecord.create({ data: { actorUserId: null, actionType: 'USER_ROLE_GRANTED',
      entityType: 'User', entityId: application.studentUserId,
      afterState: { role: 'VENDOR_OWNER', source: 'VERIFIED_VENDOR_APPLICATION' } } });
  }
  await tx.auditRecord.create({ data: { actorUserId: null, actionType: 'VENDOR_APPLICATION_ACTIVATED',
    entityType: 'VendorApplication', entityId: application.id, beforeState: { status: live.status },
    afterState: { status: 'ACTIVE', paymentId, source: 'PAYMONGO_WEBHOOK' } } });
  await tx.auditRecord.create({ data: { actorUserId: null, actionType: 'VENDOR_APPROVED',
    entityType: 'Vendor', entityId: current.vendorId, beforeState: { status: 'PENDING_APPROVAL' },
    afterState: { status: 'ACTIVE', applicationId: application.id } } });
  return true;
}

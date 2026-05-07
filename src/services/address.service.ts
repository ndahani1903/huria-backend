import { prisma } from '../config/db';

export class AddressService {
  static async addAddress(userId: string, data: { label: string; address: string; lat: number; lng: number; isDefault?: boolean }) {
    if (data.isDefault) {
      await prisma.address.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false }
      });
    }
    
    return prisma.address.create({
      data: {
        userId,
        label: data.label,
        address: data.address,
        lat: data.lat,
        lng: data.lng,
        isDefault: data.isDefault || false
      }
    });
  }

  static async getUserAddresses(userId: string) {
    return prisma.address.findMany({
      where: { userId },
      orderBy: { isDefault: 'desc' }
    });
  }

  static async setDefaultAddress(userId: string, addressId: string) {
    await prisma.address.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false }
    });
    
    return prisma.address.update({
      where: { id: addressId, userId },
      data: { isDefault: true }
    });
  }

  static async deleteAddress(userId: string, addressId: string) {
    const address = await prisma.address.findFirst({
      where: { id: addressId, userId }
    });
    if (!address) throw new Error("Address not found");
    if (address.isDefault) throw new Error("Cannot delete default address");
    
    return prisma.address.delete({ where: { id: addressId } });
  }
}
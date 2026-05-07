import { prisma } from '../config/db';
import { redis } from '../config/redis';
import axios from 'axios';

interface RouteInfo {
  distance: string;
  duration: string;
  distanceMeters: number;
  durationSeconds: number;
  polyline: string;
  steps: any[];
}

interface DeliveryAssignment {
  deliveryId: string;
  pickup: { lat: number; lng: number; address: string };
  dropoff: { lat: number; lng: number; address: string };
  customerName: string;
  customerPhone: string;
  otp: string;
  items: any[];
  estimatedDuration: number;
}

export class DriverCoPilotService {
  private readonly GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
  
  async getNextDelivery(driverId: string): Promise<DeliveryAssignment | null> {
    // Get next pending delivery for this driver
    const order = await prisma.order.findFirst({
      where: {
        driverId: driverId,
        status: { in: ['assigned', 'paid'] }
      },
      include: {
        user: { select: { name: true, phone: true } },
        items: { include: { product: true } },
        merchant: { select: { pickupLat: true, pickupLng: true, name: true, address: true } }
      },
      orderBy: { createdAt: 'asc' }
    });
    
    if (!order) return null;
    
    return {
      deliveryId: order.id,
      pickup: {
        lat: order.pickupLat || order.merchant?.pickupLat || -6.8,
        lng: order.pickupLng || order.merchant?.pickupLng || 39.25,
        address: order.pickupAddress || order.merchant?.address || 'Pickup Location'
      },
      dropoff: {
        lat: order.deliveryLat || -6.8,
        lng: order.deliveryLng || 39.28,
        address: order.deliveryAddress || 'Delivery Location'
      },
      customerName: order.user.name || 'Customer',
      customerPhone: order.user.phone || 'N/A',
      otp: order.otp || Math.floor(100000 + Math.random() * 900000).toString(),
      items: order.items.map(item => ({
        name: item.product.name,
        quantity: item.quantity,
        price: item.price
      })),
      estimatedDuration: 1800 // 30 minutes default
    };
  }
  
  async getRoute(origin: { lat: number; lng: number }, destination: { lat: number; lng: number }): Promise<RouteInfo | null> {
    try {
      const cacheKey = `route:${origin.lat},${origin.lng}:${destination.lat},${destination.lng}`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached as string);
      }
      
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&key=${this.GOOGLE_MAPS_API_KEY}`;
      
      const response = await axios.get(url);
      const data = response.data;
      
      if (data.routes && data.routes[0]) {
        const leg = data.routes[0].legs[0];
        const routeInfo: RouteInfo = {
          distance: leg.distance.text,
          duration: leg.duration.text,
          distanceMeters: leg.distance.value,
          durationSeconds: leg.duration.value,
          polyline: data.routes[0].overview_polyline.points,
          steps: leg.steps.map((step: any) => ({
            instruction: step.html_instructions.replace(/<[^>]*>/g, ''),
            distance: step.distance.text,
            duration: step.duration.text,
            startLocation: step.start_location,
            endLocation: step.end_location
          }))
        };
        
        await redis.setex(cacheKey, 3600, JSON.stringify(routeInfo));
        return routeInfo;
      }
      
      return null;
    } catch (error) {
      console.error('Route fetch error:', error);
      return null;
    }
  }
  
  async updateLocation(driverId: string, lat: number, lng: number): Promise<void> {
    await redis.setex(`driver:location:${driverId}`, 30, JSON.stringify({ lat, lng, updatedAt: new Date() }));
    
    // Broadcast to customers tracking this driver
    const orders = await prisma.order.findMany({
      where: { driverId, status: { in: ['assigned', 'picked_up'] } },
      select: { userId: true }
    });
    
    // Emit via socket
    const io = require('socket.io').io;
    orders.forEach(order => {
      io.to(`user:${order.userId}`).emit('driver_location_update', { driverId, lat, lng });
    });
  }
  
  async completeDelivery(deliveryId: string, driverId: string, otp: string, photoBase64?: string): Promise<{ success: boolean; message: string }> {
    const order = await prisma.order.findFirst({
      where: { id: deliveryId, driverId }
    });
    
    if (!order) {
      return { success: false, message: 'Delivery not found' };
    }
    
    if (order.otp !== otp) {
      return { success: false, message: 'Invalid OTP' };
    }
    
    // Update order status
    await prisma.order.update({
      where: { id: deliveryId },
      data: { status: 'completed', completedAt: new Date() }
    });
    
 {/*   // Store proof photo if provided
    if (photoBase64) {
      await prisma.deliveryVerification.create({
        data: {
          id: crypto.randomUUID(),
          orderId: deliveryId,
          driverId,
          verified: true,
          confidence: 0.95,
          productMatch: true,
          locationMatch: true,
          imageHash: photoBase64.substring(0, 100),
          verifiedAt: new Date()
        }
      });
    }
         */}
    // Update driver earnings
    await prisma.driver.update({
      where: { id: driverId },
      data: { totalEarnings: { increment: order.driverEarning || 5000 } }
    });
    
    return { success: true, message: 'Delivery completed successfully' };
  }
  
  async getVoiceCommands(): Promise<string[]> {
    return [
      'eta - Get estimated arrival time',
      'arrived - Confirm arrival at destination',
      'otp - Read OTP code',
      'call customer - Call the customer',
      'need help - Contact support',
      'traffic - Check for alternative routes',
      'next - Go to next delivery',
      'status - Get current delivery status'
    ];
  }
  
  async processVoiceCommand(command: string, driverId: string, deliveryId: string): Promise<{ response: string; action: string; data?: any }> {
    const lowerCommand = command.toLowerCase();
    
    // Get current delivery info
    const delivery = await prisma.order.findFirst({
      where: { id: deliveryId, driverId },
      include: { user: true }
    });
    
    if (lowerCommand.includes('eta')) {
      // Get current location and calculate ETA
      const location = await redis.get(`driver:location:${driverId}`);
      if (location && delivery) {
        const { lat, lng } = JSON.parse(location as string);
        const route = await this.getRoute(
          { lat, lng },
          { lat: delivery.deliveryLat || -6.8, lng: delivery.deliveryLng || 39.28 }
        );
        return { response: `Estimated arrival in ${route?.duration || '30 minutes'}`, action: 'speak' };
      }
      return { response: 'Unable to calculate ETA', action: 'speak' };
    }
    
    if (lowerCommand.includes('arrived')) {
      return { response: 'Please confirm arrival and enter OTP', action: 'confirm_arrival', data: { deliveryId } };
    }
    
    if (lowerCommand.includes('otp') && delivery) {
      return { response: `The OTP code is ${delivery.otp}`, action: 'speak' };
    }
    
    if (lowerCommand.includes('call customer') && delivery) {
      return { response: `Calling ${delivery.user?.name}`, action: 'call', data: { phone: delivery.user?.phone } };
    }
    
    if (lowerCommand.includes('need help')) {
      return { response: 'Connecting you to support', action: 'call_support' };
    }
    
    if (lowerCommand.includes('traffic')) {
      return { response: 'Checking for alternative routes', action: 'recalculate_route' };
    }
    
    if (lowerCommand.includes('status')) {
      return { response: `You are delivering to ${delivery?.user?.name || 'customer'}`, action: 'speak' };
    }
    
    return { response: 'Command not recognized. Try: ETA, Arrived, OTP, Call Customer, Need Help', action: 'speak' };
  }
}

export default new DriverCoPilotService();
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { createClient } from 'redis';
import configuredRedis from '../config/redis';

export class WebSocketManager {
  private io: Server;
  private pubClient: Redis;
  private subClient: Redis;
  private userSockets: Map<string, Set<string>> = new Map();
  private connectionStates: Map<string, { status: string; lastPing: number }> = new Map();
  
  constructor(server: any) {
    this.initializeRedis();
    this.initializeSocket(server);
    this.setupHeartbeat();
  }
  
  private initializeRedis() {
     // Use the same Redis URL as your configured client
    const redisUrl = process.env.REDIS_URL;
    
    if (!redisUrl) {
      throw new Error('REDIS_URL not configured');
    }
    
    // Create Redis clients with proper IPv6 support
    this.pubClient = new Redis(redisUrl, {
      family: 0, // KEY FIX: Enable both IPv4 and IPv6
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      connectTimeout: 10000,
      lazyConnect: true // Don't connect immediately
    });
    
    this.subClient = this.pubClient.duplicate();
    
    // Connect manually
    this.pubClient.connect().catch(err => {
      console.error('WebSocketManager Redis connection error:', err.message);
    });
  }
  
  private initializeSocket(server: any) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.FRONTEND_URL,
        credentials: true
      },
      transports: ['websocket', 'polling'], // Polling as fallback
      allowEIO3: true,
      pingTimeout: 60000,
      pingInterval: 25000,
      connectTimeout: 45000,
      maxHttpBufferSize: 1e6
    });
    
    // Use Redis adapter for horizontal scaling
    this.io.adapter(createAdapter(this.pubClient, this.subClient));
    
    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) {
          return next(new Error('Authentication required'));
        }
        
        const decoded = await this.verifyToken(token);
        socket.data.userId = decoded.userId;
        socket.data.role = decoded.role;
        
        next();
      } catch (error) {
        next(new Error('Invalid token'));
      }
    });
    
    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });
  }
  
  private handleConnection(socket: any) {
    const userId = socket.data.userId;
    
    // Store user socket
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId).add(socket.id);
    
    // Set connection state
    this.connectionStates.set(socket.id, {
      status: 'connected',
      lastPing: Date.now()
    });
    
    console.log(`User ${userId} connected with socket ${socket.id}`);
    
    // Send initial state
    socket.emit('connected', {
      socketId: socket.id,
      timestamp: new Date().toISOString(),
      heartbeatInterval: 30000
    });
    
    // Handle joining rooms
    socket.on('join:room', (room: string) => {
      socket.join(room);
      socket.emit('joined:room', { room });
    });
    
    socket.on('leave:room', (room: string) => {
      socket.leave(room);
    });
    
    // Handle driver location
    socket.on('driver:location', async (data) => {
      const { lat, lng, driverId } = data;
      
      // Store in Redis for recovery
      await this.pubClient.setex(
        `driver:location:${driverId}`,
        300,
        JSON.stringify({ lat, lng, updatedAt: Date.now() })
      );
      
      // Broadcast to relevant rooms
      socket.to(`driver:${driverId}:tracking`).emit('location:update', {
        driverId,
        lat,
        lng,
        timestamp: Date.now()
      });
    });
    
    // Handle order updates
    socket.on('order:status', async (data) => {
      const { orderId, status } = data;
      
      // Store order state
      await this.pubClient.setex(
        `order:status:${orderId}`,
        3600,
        JSON.stringify({ status, updatedAt: Date.now() })
      );
      
      // Notify customer
      this.io.to(`order:${orderId}:customer`).emit('order:update', {
        orderId,
        status,
        timestamp: Date.now()
      });
      
      // Notify merchant
      this.io.to(`order:${orderId}:merchant`).emit('order:update', {
        orderId,
        status,
        timestamp: Date.now()
      });
    });
    
    // Handle ping/pong for connection health
    socket.on('ping', () => {
      const state = this.connectionStates.get(socket.id);
      if (state) {
        state.lastPing = Date.now();
        this.connectionStates.set(socket.id, state);
      }
      socket.emit('pong', { timestamp: Date.now() });
    });
    
    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log(`Socket ${socket.id} disconnected: ${reason}`);
      
      // Update connection state
      const state = this.connectionStates.get(socket.id);
      if (state) {
        state.status = 'disconnected';
        this.connectionStates.set(socket.id, state);
      }
      
      // Remove from user sockets
      const userSockets = this.userSockets.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          this.userSockets.delete(userId);
        }
      }
      
      // Clean up after delay
      setTimeout(() => {
        this.connectionStates.delete(socket.id);
      }, 60000);
    });
  }
  
  private setupHeartbeat() {
    setInterval(() => {
      const now = Date.now();
      for (const [socketId, state] of this.connectionStates) {
        if (state.status === 'connected' && now - state.lastPing > 60000) {
          const socket = this.io.sockets.sockets.get(socketId);
          if (socket) {
            socket.disconnect(true);
          }
        }
      }
    }, 30000);
  }
  
  async sendToUser(userId: string, event: string, data: any) {
    const sockets = this.userSockets.get(userId);
    if (sockets && sockets.size > 0) {
      for (const socketId of sockets) {
        this.io.to(socketId).emit(event, data);
      }
    }
    
    // Store for offline users to retrieve on reconnection
    await this.storeOfflineMessage(userId, event, data);
  }
  
  private async storeOfflineMessage(userId: string, event: string, data: any) {
    const key = `offline:${userId}`;
    const message = {
      event,
      data,
      timestamp: Date.now()
    };
    
    await this.pubClient.lpush(key, JSON.stringify(message));
    await this.pubClient.expire(key, 86400); // 24 hours
  }
  
  async getOfflineMessages(userId: string): Promise<any[]> {
    const key = `offline:${userId}`;
    const messages = await this.pubClient.lrange(key, 0, -1);
    await this.pubClient.del(key);
    
    return messages.map(msg => JSON.parse(msg));
  }
  
  private async verifyToken(token: string): Promise<any> {
    // Implement your JWT verification
    const jwt = require('jsonwebtoken');
    return jwt.verify(token, process.env.JWT_SECRET);
  }
  
  getIO(): Server {
    return this.io;
  }
}
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { AddressService } from '../services/address.service';
import { MapsService } from '../services/maps.service';

export class AddressController {
  static async getAddresses(req: AuthRequest, res: Response) {
    try {
      const addresses = await AddressService.getUserAddresses(req.user.id);
      res.json(addresses);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async addAddress(req: AuthRequest, res: Response) {
    try {
      const { label, address, lat, lng, isDefault } = req.body;
      const result = await AddressService.addAddress(req.user.id, { label, address, lat, lng, isDefault });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async setDefault(req: AuthRequest, res: Response) {
    try {
      const addressId = Array.isArray(req.params.addressId)
  ? req.params.addressId[0]
  : req.params.addressId;
      const result = await AddressService.setDefaultAddress(req.user.id, addressId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async deleteAddress(req: AuthRequest, res: Response) {
    try {
      const addressId = Array.isArray(req.params.addressId)
  ? req.params.addressId[0]
  : req.params.addressId;
      const result = await AddressService.deleteAddress(req.user.id, addressId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async searchAddress(req: AuthRequest, res: Response) {
    try {
      const { q } = req.query;
      if (!q) return res.json([]);
      const results = await MapsService.searchAddress(q as string);
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}
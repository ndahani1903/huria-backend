import axios from "axios";

const MAPBOX_API_KEY = process.env.MAPBOX_API_KEY;

export class MapsService {
  static async reverseGeocode(lat: number, lng: number) {
    try {
      const response = await axios.get(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json`,
        {
          params: {
            access_token: MAPBOX_API_KEY,
          },
        }
      );

      const place = response.data.features[0];
      return place ? place.place_name : "Unknown location";
    } catch (error) {
      console.error("Mapbox error:", error);
      return "Unknown location";
    }
  }

  static async searchAddress(query: string) {
    try {
      const response = await axios.get(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`,
        { params: { access_token: MAPBOX_API_KEY, limit: 5 } }
      );
      return response.data.features.map((feature: any) => ({
        address: feature.place_name,
        lat: feature.center[1],
        lng: feature.center[0]
      }));
    } catch (error) {
      console.error("Search error:", error);
      return [];
    }
  }

  static async getRoute(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
    try {
      const response = await axios.get(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${from.lng},${from.lat};${to.lng},${to.lat}`,
        { params: { access_token: MAPBOX_API_KEY, geometries: 'geojson' } }
      );
      
      if (response.data.routes && response.data.routes[0]) {
        return {
          geometry: response.data.routes[0].geometry,
          distance: response.data.routes[0].distance / 1000,
          duration: Math.round(response.data.routes[0].duration / 60)
        };
      }
      return null;
    } catch (error) {
      console.error("Route error:", error);
      return null;
    }
  }
}
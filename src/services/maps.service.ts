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
}
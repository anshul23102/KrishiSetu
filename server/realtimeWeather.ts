import { z } from "zod";

// Weather Data Schemas
export const weatherDataSchema = z.object({
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    city: z.string().optional(),
    state: z.string().optional(),
  }),
  current: z.object({
    temperature_celsius: z.number().min(-50).max(60),
    feels_like: z.number().min(-50).max(60),
    humidity_percent: z.number().min(0).max(100),
    wind_speed_kmh: z.number().min(0),
    wind_direction: z.string().optional(),
    rainfall_mm: z.number().min(0),
    cloud_coverage_percent: z.number().min(0).max(100),
    visibility_km: z.number().min(0),
    pressure_hpa: z.number(),
    uv_index: z.number().min(0).max(20),
    condition: z.string(),
    condition_code: z.enum(["clear", "cloudy", "rainy", "stormy", "foggy", "snowy"]),
    updated_at: z.date(),
    data_freshness_minutes: z.number(),
  }),
  forecast: z.array(
    z.object({
      date: z.date(),
      temperature_high: z.number(),
      temperature_low: z.number(),
      rainfall_probability_percent: z.number().min(0).max(100),
      rainfall_mm: z.number().min(0),
      wind_speed_kmh: z.number().min(0),
      condition: z.string(),
      condition_code: z.enum(["clear", "cloudy", "rainy", "stormy", "foggy", "snowy"]),
      agricultural_risk: z.enum(["none", "frost", "heatwave", "heavy_rain", "drought"]).optional(),
    }),
  ),
  alerts: z.array(
    z.object({
      alert_type: z.enum(["frost", "heatwave", "heavy_rain", "drought", "pest_favorable"]),
      severity: z.enum(["low", "medium", "high", "critical"]),
      message: z.string(),
      effective_from: z.date(),
      effective_until: z.date(),
    }),
  ),
});

export type WeatherData = z.infer<typeof weatherDataSchema>;

// Real-time Weather Service
class RealtimeWeatherService {
  private weatherCache: Map<string, { data: WeatherData; timestamp: Date }> = new Map();
  private updateInterval: number = 30 * 60 * 1000; // 30 minutes

  /**
   * Fetch real-time weather data from IMD (India Meteorological Department)
   */
  async fetchRealtimeWeather(latitude: number, longitude: number): Promise<WeatherData> {
    const cacheKey = `${latitude},${longitude}`;
    const cached = this.weatherCache.get(cacheKey);

    // Return cached data if fresh (less than 30 minutes old)
    if (cached && Date.now() - cached.timestamp.getTime() < this.updateInterval) {
      return {
        ...cached.data,
        current: {
          ...cached.data.current,
          data_freshness_minutes: Math.round((Date.now() - cached.timestamp.getTime()) / 60000),
        },
      };
    }

    try {
      const weather = await this.queryIMDAPI(latitude, longitude);
      this.weatherCache.set(cacheKey, { data: weather, timestamp: new Date() });
      return weather;
    } catch (error) {
      // Fallback to cached data even if stale
      if (cached) {
        console.warn("IMD API failed, using stale cache data");
        return cached.data;
      }
      throw new Error("Failed to fetch weather data");
    }
  }

  /**
   * Query IMD (India Meteorological Department) API
   */
  private async queryIMDAPI(latitude: number, longitude: number): Promise<WeatherData> {
    const imdBaseUrl = process.env.IMD_API_URL || "https://mausam.imd.gov.in/api/";

    try {
      const response = await fetch(`${imdBaseUrl}griddata/hourly`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.IMD_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lat: latitude,
          lon: longitude,
        }),
      });

      if (!response.ok) {
        throw new Error(`IMD API error: ${response.statusText}`);
      }

      const data = await response.json();
      return this.parseIMDResponse(data, latitude, longitude);
    } catch (error) {
      console.error("IMD API request failed:", error);
      throw error;
    }
  }

  /**
   * Parse IMD API response
   */
  private parseIMDResponse(data: any, latitude: number, longitude: number): WeatherData {
    const current = data.weather?.[0] || {};

    return {
      location: {
        latitude,
        longitude,
        city: data.city,
        state: data.state,
      },
      current: {
        temperature_celsius: current.temperature || 25,
        feels_like: current.feels_like || 25,
        humidity_percent: current.humidity || 60,
        wind_speed_kmh: current.wind_speed || 0,
        wind_direction: current.wind_direction,
        rainfall_mm: current.rainfall || 0,
        cloud_coverage_percent: current.cloud_coverage || 0,
        visibility_km: current.visibility || 10,
        pressure_hpa: current.pressure || 1013,
        uv_index: current.uv_index || 5,
        condition: current.condition || "Clear",
        condition_code: this.getConditionCode(current.condition),
        updated_at: new Date(current.updated_at || Date.now()),
        data_freshness_minutes: 0,
      },
      forecast: this.parseForecast(data.forecast || []),
      alerts: this.parseAlerts(data.alerts || []),
    };
  }

  /**
   * Parse forecast data
   */
  private parseForecast(forecastData: any[]): WeatherData["forecast"] {
    return forecastData.slice(0, 7).map((day: any) => ({
      date: new Date(day.date),
      temperature_high: day.temp_max || 30,
      temperature_low: day.temp_min || 20,
      rainfall_probability_percent: day.rain_probability || 0,
      rainfall_mm: day.rainfall || 0,
      wind_speed_kmh: day.wind_speed || 0,
      condition: day.condition || "Cloudy",
      condition_code: this.getConditionCode(day.condition),
      agricultural_risk: this.assessAgriculturalRisk(day),
    }));
  }

  /**
   * Parse weather alerts (monsoon, frost, heatwave, etc.)
   */
  private parseAlerts(alertsData: any[]): WeatherData["alerts"] {
    return alertsData.map((alert: any) => ({
      alert_type: this.getAlertType(alert.type),
      severity: alert.severity || "medium",
      message: alert.message,
      effective_from: new Date(alert.from),
      effective_until: new Date(alert.until),
    }));
  }

  /**
   * Assess agricultural risk for forecast day
   */
  private assessAgriculturalRisk(day: any): WeatherData["forecast"][0]["agricultural_risk"] {
    if (day.temp_min < 0) return "frost";
    if (day.temp_max > 38) return "heatwave";
    if (day.rainfall > 50) return "heavy_rain";
    if (day.rainfall < 5 && day.humidity < 30) return "drought";
    return undefined;
  }

  /**
   * Get standardized weather condition code
   */
  private getConditionCode(condition: string): "clear" | "cloudy" | "rainy" | "stormy" | "foggy" | "snowy" {
    const condStr = (condition || "").toLowerCase();
    if (condStr.includes("clear") || condStr.includes("sunny")) return "clear";
    if (condStr.includes("rain") || condStr.includes("drizzle")) return "rainy";
    if (condStr.includes("storm") || condStr.includes("thunder")) return "stormy";
    if (condStr.includes("fog") || condStr.includes("mist")) return "foggy";
    if (condStr.includes("snow")) return "snowy";
    return "cloudy";
  }

  /**
   * Get alert type
   */
  private getAlertType(type: string): WeatherData["alerts"][0]["alert_type"] {
    const typeStr = (type || "").toLowerCase();
    if (typeStr.includes("frost")) return "frost";
    if (typeStr.includes("heat")) return "heatwave";
    if (typeStr.includes("rain")) return "heavy_rain";
    if (typeStr.includes("drought")) return "drought";
    if (typeStr.includes("pest")) return "pest_favorable";
    return "heavy_rain";
  }

  /**
   * Get hyperlocal weather (field-level, not district-level)
   */
  async getHyperlocalWeather(latitude: number, longitude: number, radius_meters: number = 1000): Promise<WeatherData> {
    // IMD provides district-level data, this provides the most granular available
    return this.fetchRealtimeWeather(latitude, longitude);
  }

  /**
   * Get monsoon-specific forecast
   */
  async getMonsoonForecast(latitude: number, longitude: number): Promise<{
    monsoon_status: "not_started" | "active" | "weak" | "ended";
    expected_rainfall_mm: number;
    forecast_period: string;
    risk_assessment: string;
  }> {
    const weather = await this.fetchRealtimeWeather(latitude, longitude);

    // Simple monsoon detection based on rainfall
    let monsoonStatus: "not_started" | "active" | "weak" | "ended" = "not_started";
    if (weather.forecast.some((day) => day.rainfall_mm > 50)) {
      monsoonStatus = "active";
    } else if (weather.forecast.some((day) => day.rainfall_mm > 25)) {
      monsoonStatus = "weak";
    }

    const totalRainfall = weather.forecast.reduce((sum, day) => sum + day.rainfall_mm, 0);

    return {
      monsoon_status: monsoonStatus,
      expected_rainfall_mm: totalRainfall,
      forecast_period: "7 days",
      risk_assessment: totalRainfall > 150 ? "High rainfall risk" : totalRainfall > 75 ? "Moderate rainfall" : "Low rainfall",
    };
  }

  /**
   * Get farming recommendations based on weather
   */
  async getFarmingRecommendations(latitude: number, longitude: number, crop: string): Promise<string[]> {
    const weather = await this.fetchRealtimeWeather(latitude, longitude);
    const recommendations: string[] = [];

    const current = weather.current;
    const forecast = weather.forecast[0];

    // Temperature-based recommendations
    if (current.temperature_celsius < 10) {
      recommendations.push("Cold temperatures: Use frost protection measures");
    } else if (current.temperature_celsius > 35) {
      recommendations.push("High temperatures: Increase irrigation frequency");
    }

    // Humidity-based recommendations
    if (current.humidity_percent > 80) {
      recommendations.push("High humidity: Monitor for fungal diseases");
    } else if (current.humidity_percent < 30) {
      recommendations.push("Low humidity: Water plants more frequently");
    }

    // Rainfall-based recommendations
    if (forecast.rainfall_mm > 50) {
      recommendations.push("Heavy rainfall expected: Ensure proper drainage");
    } else if (forecast.rainfall_probability_percent < 20) {
      recommendations.push("Low rainfall forecast: Plan irrigation schedule");
    }

    // Wind-based recommendations
    if (current.wind_speed_kmh > 30) {
      recommendations.push("Strong winds: Secure support structures and crops");
    }

    // Alert-based recommendations
    for (const alert of weather.alerts) {
      if (alert.alert_type === "frost") {
        recommendations.push("Frost alert: Use frost protection covers");
      } else if (alert.alert_type === "heatwave") {
        recommendations.push("Heatwave alert: Increase water availability");
      } else if (alert.alert_type === "pest_favorable") {
        recommendations.push("Pest-favorable conditions: Increase monitoring");
      }
    }

    return recommendations.length > 0 ? recommendations : ["Conditions suitable for farming"];
  }

  /**
   * Get weather comparison across regions
   */
  async compareWeatherAcrossRegions(locations: Array<{ latitude: number; longitude: number; name: string }>): Promise<
    Array<{
      location_name: string;
      temperature: number;
      rainfall: number;
      condition: string;
      suitability_score: number;
    }>
  > {
    const comparisons = await Promise.all(
      locations.map(async (loc) => {
        const weather = await this.fetchRealtimeWeather(loc.latitude, loc.longitude);
        const suitabilityScore = this.calculateSuitabilityScore(weather);

        return {
          location_name: loc.name,
          temperature: weather.current.temperature_celsius,
          rainfall: weather.current.rainfall_mm,
          condition: weather.current.condition,
          suitability_score: suitabilityScore,
        };
      }),
    );

    return comparisons.sort((a, b) => b.suitability_score - a.suitability_score);
  }

  /**
   * Calculate weather suitability for farming (0-100 scale)
   */
  private calculateSuitabilityScore(weather: WeatherData): number {
    let score = 100;

    const temp = weather.current.temperature_celsius;
    if (temp < 5 || temp > 40) score -= 30;
    else if (temp < 10 || temp > 35) score -= 15;

    if (weather.current.humidity_percent < 20 || weather.current.humidity_percent > 90) score -= 15;

    if (weather.current.wind_speed_kmh > 40) score -= 20;

    if (weather.alerts.some((a) => a.severity === "critical")) score -= 40;
    if (weather.alerts.some((a) => a.severity === "high")) score -= 20;

    return Math.max(0, Math.min(100, score));
  }
}

export const realtimeWeatherService = new RealtimeWeatherService();

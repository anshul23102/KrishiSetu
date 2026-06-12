import { z } from "zod";

// Soil Test Schemas
export const soilTestResultSchema = z.object({
  id: z.string().default(() => Date.now().toString()),
  region: z.string().min(1, "Region is required"),
  test_date: z.date(),
  sample_location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    field_name: z.string().optional(),
  }),
  ph_value: z.number().min(0).max(14),
  electrical_conductivity_ds_m: z.number().min(0).max(10),
  organic_matter_percent: z.number().min(0).max(20),
  nitrogen_kg_ha: z.number().min(0).max(500),
  phosphorus_kg_ha: z.number().min(0).max(500),
  potassium_kg_ha: z.number().min(0).max(500),
  calcium_mg_kg: z.number().min(0),
  magnesium_mg_kg: z.number().min(0),
  sulphur_mg_kg: z.number().min(0),
  zinc_mg_kg: z.number().min(0).max(50),
  iron_mg_kg: z.number().min(0).max(1000),
  copper_mg_kg: z.number().min(0).max(100),
  manganese_mg_kg: z.number().min(0).max(1000),
  boron_mg_kg: z.number().min(0).max(10),
  molybdenum_mg_kg: z.number().min(0).max(5),
  validation_status: z.enum(["valid", "invalid", "warning"]).default("valid"),
  issues: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
  is_outlier: z.boolean().default(false),
});

export type SoilTestResult = z.infer<typeof soilTestResultSchema>;

// Regional Standards Database
const REGIONAL_STANDARDS: Record<string, Record<string, { min: number; max: number; optimal: number }>> = {
  "Northern India": {
    pH: { min: 6, max: 7.5, optimal: 6.8 },
    nitrogen: { min: 150, max: 280, optimal: 200 },
    phosphorus: { min: 10, max: 40, optimal: 25 },
    potassium: { min: 100, max: 280, optimal: 150 },
    organic_matter: { min: 1.5, max: 3.5, optimal: 2.5 },
  },
  "Southern India": {
    pH: { min: 5.5, max: 7, optimal: 6.2 },
    nitrogen: { min: 100, max: 250, optimal: 180 },
    phosphorus: { min: 5, max: 30, optimal: 15 },
    potassium: { min: 80, max: 250, optimal: 150 },
    organic_matter: { min: 1, max: 3, optimal: 2 },
  },
  "Eastern India": {
    pH: { min: 5, max: 7, optimal: 6 },
    nitrogen: { min: 120, max: 300, optimal: 220 },
    phosphorus: { min: 8, max: 35, optimal: 20 },
    potassium: { min: 90, max: 270, optimal: 150 },
    organic_matter: { min: 2, max: 4, optimal: 3 },
  },
  "Western India": {
    pH: { min: 6.5, max: 8.5, optimal: 7.5 },
    nitrogen: { min: 140, max: 260, optimal: 200 },
    phosphorus: { min: 12, max: 45, optimal: 28 },
    potassium: { min: 110, max: 300, optimal: 180 },
    organic_matter: { min: 1, max: 2.5, optimal: 1.8 },
  },
};

// Soil Validation Service
class SoilValidationService {
  private validationLogs: Map<string, SoilTestResult[]> = new Map();

  /**
   * Validate soil test results against regional standards
   */
  async validateSoilTest(testResult: Omit<SoilTestResult, "id" | "validation_status" | "issues" | "recommendations" | "is_outlier">): Promise<SoilTestResult> {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let validationStatus: "valid" | "invalid" | "warning" = "valid";

    // Get regional standards
    const standards = REGIONAL_STANDARDS[testResult.region];
    if (!standards) {
      issues.push(`Region "${testResult.region}" not found in standards database`);
      validationStatus = "warning";
    }

    // Validate pH value
    if (testResult.ph_value > 14 || testResult.ph_value < 0) {
      issues.push(`pH value ${testResult.ph_value} is impossible (must be 0-14)`);
      validationStatus = "invalid";
    } else if (standards && (testResult.ph_value < standards.pH.min || testResult.ph_value > standards.pH.max)) {
      issues.push(`pH ${testResult.ph_value} is outside optimal range (${standards.pH.min}-${standards.pH.max})`);
      validationStatus = "warning";
      recommendations.push(`Adjust pH towards optimal ${standards.pH.optimal}`);
    }

    // Validate nitrogen levels
    if (testResult.nitrogen_kg_ha < 0 || testResult.nitrogen_kg_ha > 500) {
      issues.push(`Nitrogen level ${testResult.nitrogen_kg_ha} kg/ha is outside possible range`);
      validationStatus = "invalid";
    } else if (standards && (testResult.nitrogen_kg_ha < standards.nitrogen.min || testResult.nitrogen_kg_ha > standards.nitrogen.max)) {
      issues.push(`Nitrogen ${testResult.nitrogen_kg_ha} is outside optimal range`);
      if (testResult.nitrogen_kg_ha < standards.nitrogen.min) {
        recommendations.push("Apply nitrogen fertilizer to improve nitrogen levels");
      } else {
        recommendations.push("Reduce nitrogen fertilizer application");
      }
    }

    // Validate phosphorus levels
    if (testResult.phosphorus_kg_ha < 0 || testResult.phosphorus_kg_ha > 500) {
      issues.push(`Phosphorus level ${testResult.phosphorus_kg_ha} kg/ha is outside possible range`);
      validationStatus = "invalid";
    } else if (standards && (testResult.phosphorus_kg_ha < standards.phosphorus.min || testResult.phosphorus_kg_ha > standards.phosphorus.max)) {
      issues.push(`Phosphorus ${testResult.phosphorus_kg_ha} is outside optimal range`);
      recommendations.push(testResult.phosphorus_kg_ha < standards.phosphorus.min ? "Apply phosphorus fertilizer" : "Reduce phosphorus application");
    }

    // Validate potassium levels
    if (testResult.potassium_kg_ha < 0 || testResult.potassium_kg_ha > 500) {
      issues.push(`Potassium level ${testResult.potassium_kg_ha} kg/ha is outside possible range`);
      validationStatus = "invalid";
    } else if (standards && (testResult.potassium_kg_ha < standards.potassium.min || testResult.potassium_kg_ha > standards.potassium.max)) {
      issues.push(`Potassium ${testResult.potassium_kg_ha} is outside optimal range`);
      recommendations.push(testResult.potassium_kg_ha < standards.potassium.min ? "Apply potassium fertilizer" : "Reduce potassium application");
    }

    // Validate organic matter
    if (testResult.organic_matter_percent < 0 || testResult.organic_matter_percent > 20) {
      issues.push(`Organic matter ${testResult.organic_matter_percent}% is outside possible range`);
      validationStatus = "invalid";
    } else if (standards && (testResult.organic_matter_percent < standards.organic_matter.min || testResult.organic_matter_percent > standards.organic_matter.max)) {
      issues.push(`Organic matter ${testResult.organic_matter_percent}% is outside optimal range`);
      recommendations.push(testResult.organic_matter_percent < standards.organic_matter.min ? "Increase organic matter through composting" : "Reduce organic matter buildup");
    }

    // Validate micronutrients
    const micronutrientIssues = this.validateMicronutrients(testResult);
    issues.push(...micronutrientIssues);
    if (micronutrientIssues.length > 0) {
      validationStatus = "warning";
    }

    // Check for outliers
    const isOutlier = this.isOutlierResult(testResult);
    if (isOutlier) {
      issues.push("This result appears to be an outlier - verify sample collection procedure");
      validationStatus = "warning";
    }

    // Add additional recommendations based on validation
    if (validationStatus === "invalid") {
      recommendations.push("Retake soil test - verify sample collection and handling procedures");
    }

    const result: SoilTestResult = soilTestResultSchema.parse({
      ...testResult,
      id: `${testResult.region}-${Date.now()}`,
      validation_status: validationStatus,
      issues,
      recommendations,
      is_outlier: isOutlier,
    });

    // Log the validation
    const key = testResult.region;
    if (!this.validationLogs.has(key)) {
      this.validationLogs.set(key, []);
    }
    this.validationLogs.get(key)!.push(result);

    return result;
  }

  /**
   * Validate micronutrients
   */
  private validateMicronutrients(testResult: any): string[] {
    const issues: string[] = [];

    if (testResult.zinc_mg_kg > 50) {
      issues.push(`Zinc level ${testResult.zinc_mg_kg} mg/kg is elevated`);
    } else if (testResult.zinc_mg_kg < 0.5) {
      issues.push(`Zinc deficiency detected (${testResult.zinc_mg_kg} mg/kg)`);
    }

    if (testResult.iron_mg_kg > 1000) {
      issues.push(`Iron level ${testResult.iron_mg_kg} mg/kg is very high`);
    } else if (testResult.iron_mg_kg < 4) {
      issues.push(`Iron deficiency possible (${testResult.iron_mg_kg} mg/kg)`);
    }

    if (testResult.boron_mg_kg > 5) {
      issues.push(`Boron toxicity risk (${testResult.boron_mg_kg} mg/kg)`);
    } else if (testResult.boron_mg_kg < 0.2) {
      issues.push(`Boron deficiency (${testResult.boron_mg_kg} mg/kg)`);
    }

    return issues;
  }

  /**
   * Detect outlier results
   */
  private isOutlierResult(testResult: any): boolean {
    // Check for impossible or unlikely combinations
    if (testResult.pH > 14 || testResult.pH < 0) return true;
    if (testResult.electrical_conductivity_ds_m > 8) return true; // Very high salinity

    // Check for unrealistic nutrient combinations
    if (testResult.nitrogen_kg_ha > 400 && testResult.organic_matter_percent < 0.5) {
      return true; // High N with low OM unlikely
    }

    // Check pH-nutrient mismatch
    if (testResult.pH < 5 && testResult.phosphorus_kg_ha > 40) {
      return true; // P availability very low at pH < 5
    }

    return false;
  }

  /**
   * Get standard for a region
   */
  async getRegionalStandards(region: string): Promise<Record<string, { min: number; max: number; optimal: number }>> {
    return REGIONAL_STANDARDS[region] || REGIONAL_STANDARDS["Northern India"];
  }

  /**
   * Get fertilizer recommendation based on soil test
   */
  async getFertilizerRecommendation(testResult: SoilTestResult): Promise<{
    nitrogen_kg_ha: number;
    phosphorus_kg_ha: number;
    potassium_kg_ha: number;
    micronutrients: Record<string, number>;
    application_method: string[];
  }> {
    const standards = REGIONAL_STANDARDS[testResult.region] || REGIONAL_STANDARDS["Northern India"];

    return {
      nitrogen_kg_ha: Math.max(0, standards.nitrogen.optimal - testResult.nitrogen_kg_ha),
      phosphorus_kg_ha: Math.max(0, standards.phosphorus.optimal - testResult.phosphorus_kg_ha),
      potassium_kg_ha: Math.max(0, standards.potassium.optimal - testResult.potassium_kg_ha),
      micronutrients: {
        zinc: testResult.zinc_mg_kg < 1 ? 5 : 0,
        iron: testResult.iron_mg_kg < 4 ? 10 : 0,
        boron: testResult.boron_mg_kg < 0.2 ? 2 : 0,
      },
      application_method: [
        "Split application (50% at sowing, 50% at growth stage)",
        "Apply with organic matter for better nutrient availability",
        "Soil incorporation 2-3 weeks before planting",
      ],
    };
  }

  /**
   * Get validation summary for region
   */
  async getRegionValidationSummary(region: string): Promise<{
    total_tests: number;
    valid_tests: number;
    warning_tests: number;
    invalid_tests: number;
    outlier_percentage: number;
  }> {
    const results = this.validationLogs.get(region) || [];

    return {
      total_tests: results.length,
      valid_tests: results.filter((r) => r.validation_status === "valid").length,
      warning_tests: results.filter((r) => r.validation_status === "warning").length,
      invalid_tests: results.filter((r) => r.validation_status === "invalid").length,
      outlier_percentage: results.length > 0 ? (results.filter((r) => r.is_outlier).length / results.length) * 100 : 0,
    };
  }
}

export const soilValidationService = new SoilValidationService();

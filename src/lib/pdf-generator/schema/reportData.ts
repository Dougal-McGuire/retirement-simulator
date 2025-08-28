import { z } from 'zod';

// Validation schemas with min/max ranges
export const PersonSchema = z.object({
  currentAge: z.number().min(18).max(100),
  retireAge: z.number().min(50).max(80),
  pensionAge: z.number().min(60).max(80),
  horizonAge: z.number().min(70).max(120),
});

export const FinancesSchema = z.object({
  currentAssetsEUR: z.number().min(0).max(100_000_000),
  annualSavingsEUR: z.number().min(0).max(1_000_000),
  expectedMonthlyPensionEUR: z.number().min(0).max(50_000),
});

export const SpendingSchema = z.object({
  monthly: z.object({
    health: z.number().min(0).max(10_000),
    food: z.number().min(0).max(10_000),
    entertainment: z.number().min(0).max(10_000),
    shopping: z.number().min(0).max(10_000),
    utilities: z.number().min(0).max(10_000),
  }),
  annual: z.object({
    vacations: z.number().min(0).max(100_000),
    homeRepairs: z.number().min(0).max(100_000),
    car: z.number().min(0).max(100_000),
  }),
});

export const AssumptionsSchema = z.object({
  roiMean: z.number().min(-0.2).max(0.3),
  roiStdev: z.number().min(0).max(0.5),
  inflationMean: z.number().min(-0.05).max(0.15),
  inflationStdev: z.number().min(0).max(0.1),
  // Fix absurd tax rates like 2625% -> cap at 80%
  capGainsTaxRatePct: z.number()
    .min(0)
    .transform((val) => {
      // Detect likely typos (e.g., 2625 instead of 26.25)
      if (val > 100) {
        const corrected = val / 100;
        if (corrected <= 80) {
          return corrected;
        }
        return 80; // Cap at 80% if still too high
      }
      return Math.min(val, 80);
    }),
  mcRuns: z.number().min(100).max(100_000),
});

export const MilestoneSchema = z.object({
  age: z.number(),
  p10: z.number(),
  p50: z.number(),
  p90: z.number(),
});

export const ProjectionsSchema = z.object({
  milestones: z.array(MilestoneSchema),
  successRatePct: z.number().min(0).max(100),
});

export const RecommendationSchema = z.object({
  title: z.string(),
  category: z.string(),
  body: z.string(),
  impact: z.enum(['High', 'Medium', 'Low']),
});

export const SummarySchema = z.object({
  planHealthScore: z.number().min(0).max(100),
  planHealthLabel: z.enum(['Strong', 'Moderate', 'Needs Attention']),
  planHealthWhy: z.string().optional(),
  successProbabilityPct: z.number().min(0).max(100),
  bridge: z.object({
    startAge: z.number(),
    endAge: z.number(),
    cashNeedEUR: z.number(),
    cashBucketYears: z.number().optional(),
    cashBucketSharePct: z.number().optional(),
    portfolioSharePct: z.number().optional(),
  }),
  topActions: z.array(z.string()).default([]),
  topActionsDetailed: z.array(z.object({
    title: z.string(),
    upliftMin: z.number(),
    upliftMax: z.number(),
  })).default([]),
}).optional()

export const ReportDataSchema = z.object({
  person: PersonSchema,
  finances: FinancesSchema,
  spending: SpendingSchema,
  assumptions: AssumptionsSchema,
  projections: ProjectionsSchema,
  summary: SummarySchema,
  recommendations: z.array(RecommendationSchema),
  metadata: z.object({
    reportId: z.string().default(() => `RPT-${Date.now()}`),
    generatedAt: z.string().default(() => new Date().toISOString()),
    version: z.string().default('1.0.0'),
  }).optional(),
});

export type Person = z.infer<typeof PersonSchema>;
export type Finances = z.infer<typeof FinancesSchema>;
export type Spending = z.infer<typeof SpendingSchema>;
export type Assumptions = z.infer<typeof AssumptionsSchema>;
export type Milestone = z.infer<typeof MilestoneSchema>;
export type Projections = z.infer<typeof ProjectionsSchema>;
export type Recommendation = z.infer<typeof RecommendationSchema>;
export type ReportData = z.infer<typeof ReportDataSchema>;
export type Summary = z.infer<typeof SummarySchema>;

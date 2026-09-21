import { z } from 'zod';
export const FileSchema = z.object({path:z.string(), priority:z.enum(['high','medium','low']), additions:z.number().int().nonnegative(), deletions:z.number().int().nonnegative(), diff:z.string()});
export const AnalysisSchema = z.object({schemaVersion:z.literal(1), analysisId:z.literal('demo-payment-v1'), source:z.literal('fixture'), title:z.string(), repository:z.string(), prNumber:z.number().int(), headSha:z.string(), summary:z.string(), files:z.array(FileSchema)});
export const ExplanationSchema = z.object({analysisId:z.literal('demo-payment-v1'), source:z.literal('fixture'), filePath:z.string(), explanation:z.string(), check:z.string(), requestedAt:z.string().datetime()});
export type Analysis = z.infer<typeof AnalysisSchema>;
export type Explanation = z.infer<typeof ExplanationSchema>;

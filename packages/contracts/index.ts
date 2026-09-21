import { z } from 'zod';

export const SourceSchema = z.enum(['fixture', 'github']);
export const FileSchema = z.object({
  path: z.string(),
  status: z.string(),
  priority: z.enum(['high', 'medium', 'low']),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  diff: z.string(),
  patchAvailable: z.boolean(),
});

export const AnalysisSchema = z.object({
  schemaVersion: z.literal(1),
  analysisId: z.string(),
  source: SourceSchema,
  title: z.string(),
  repository: z.string(),
  prNumber: z.number().int().positive(),
  prUrl: z.string().url().optional(),
  state: z.string(),
  headSha: z.string(),
  summary: z.string(),
  files: z.array(FileSchema),
  partial: z.boolean(),
  limitations: z.array(z.string()),
});

export const ExplanationSchema = z.object({
  analysisId: z.string(),
  source: SourceSchema,
  filePath: z.string(),
  explanation: z.string(),
  check: z.string(),
  requestedAt: z.string().datetime(),
});
export type Analysis = z.infer<typeof AnalysisSchema>;
export type Explanation = z.infer<typeof ExplanationSchema>;

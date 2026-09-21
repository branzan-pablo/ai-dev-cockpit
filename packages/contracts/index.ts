import { z } from 'zod';

export const SourceSchema = z.enum(['fixture', 'github']);
export const PrioritySchema = z.enum(['high', 'medium', 'low']);
export const FileKindSchema = z.enum(['source', 'test', 'documentation', 'configuration', 'asset', 'migration', 'dependency', 'other']);

export const FileSchema = z.object({
  path: z.string(),
  status: z.string(),
  priority: PrioritySchema,
  kind: FileKindSchema,
  language: z.string(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  diff: z.string(),
  patchAvailable: z.boolean(),
});

export const EvidenceSchema = z.object({ filePath: z.string(), line: z.number().int().positive().optional(), excerpt: z.string().max(500) });
export const FindingSchema = z.object({
  id: z.string(),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
  category: z.enum(['security', 'correctness', 'reliability', 'performance', 'accessibility', 'maintainability', 'testing', 'other']),
  title: z.string(), description: z.string(), recommendation: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
  evidence: z.array(EvidenceSchema).min(1),
  source: z.enum(['rule', 'ai']),
});
export const TestSuggestionSchema = z.object({
  id: z.string(), title: z.string(), rationale: z.string(), type: z.enum(['unit', 'integration', 'e2e', 'manual']),
  priority: PrioritySchema, relatedFiles: z.array(z.string()), source: z.enum(['rule', 'ai']),
});
export const ReviewSchema = z.object({
  mode: z.enum(['deterministic', 'ai']), model: z.string().optional(), generatedAt: z.string().datetime(),
  riskScore: z.number().int().min(0).max(100), verdict: z.enum(['approve', 'attention', 'block']), executiveSummary: z.string(),
  findings: z.array(FindingSchema), tests: z.array(TestSuggestionSchema),
});
export const DeliverySchema = z.object({
  checksState: z.enum(['pending', 'success', 'failure', 'unknown']),
  total: z.number().int().nonnegative(), successful: z.number().int().nonnegative(), failed: z.number().int().nonnegative(),
  previewUrl: z.string().url().optional(),
});

export const AnalysisSchema = z.object({
  schemaVersion: z.literal(2), analysisId: z.string(), source: SourceSchema,
  title: z.string(), repository: z.string(), prNumber: z.number().int().positive(), prUrl: z.string().url().optional(), state: z.string(),
  author: z.string().optional(), baseRef: z.string().optional(), headRef: z.string().optional(), headSha: z.string(),
  summary: z.string(), description: z.string().optional(), files: z.array(FileSchema), review: ReviewSchema,
  delivery: DeliverySchema,
  partial: z.boolean(), limitations: z.array(z.string()),
});
export const ExplanationSchema = z.object({
  analysisId: z.string(), source: SourceSchema, filePath: z.string(), explanation: z.string(), check: z.string(),
  requestedAt: z.string().datetime(), mode: z.enum(['deterministic', 'ai']).default('deterministic'),
});

export type ChangedFile = z.infer<typeof FileSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type TestSuggestion = z.infer<typeof TestSuggestionSchema>;
export type Review = z.infer<typeof ReviewSchema>;
export type Analysis = z.infer<typeof AnalysisSchema>;
export type Explanation = z.infer<typeof ExplanationSchema>;

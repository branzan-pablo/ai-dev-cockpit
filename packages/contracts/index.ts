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
  applicableRules: z.array(z.string()).optional(),
});
export const TestSuggestionSchema = z.object({
  id: z.string(), title: z.string(), rationale: z.string(), type: z.enum(['unit', 'integration', 'e2e', 'manual']),
  priority: PrioritySchema, relatedFiles: z.array(z.string()), source: z.enum(['rule', 'ai']),
});
export const ReviewSchema = z.object({
  mode: z.enum(['deterministic', 'ai']), model: z.string().optional(), generatedAt: z.string().datetime(),
  riskScore: z.number().int().min(0).max(100), verdict: z.enum(['approve', 'attention', 'block']), executiveSummary: z.string(),
  findings: z.array(FindingSchema), tests: z.array(TestSuggestionSchema),
  riskFactors: z.array(z.object({ label: z.string(), contribution: z.number().int(), reason: z.string() })).optional(),
});
export const DeliverySchema = z.object({
  checksState: z.enum(['pending', 'success', 'failure', 'unknown']),
  total: z.number().int().nonnegative(), successful: z.number().int().nonnegative(), failed: z.number().int().nonnegative(),
  previewUrl: z.string().url().optional(),
});

export const ProjectContextSchema = z.object({
  status: z.enum(['applied', 'partial', 'not_found', 'invalid']),
  sources: z.array(z.object({
    path: z.string(),
    kind: z.enum(['agents', 'instructions', 'guidelines', 'configuration', 'skill', 'custom']),
    sha: z.string(),
    truncated: z.boolean(),
    content: z.string().optional(),
    appliesTo: z.array(z.string()).default([]),
  })),
  omitted: z.array(z.string()).default([]),
  message: z.string().optional(),
});

export const ComparisonSchema = z.object({
  previousHeadSha: z.string(),
  currentHeadSha: z.string(),
  scoreDelta: z.number().int(),
  filesAdded: z.array(z.string()),
  filesRemoved: z.array(z.string()),
  findingsAdded: z.array(z.string()),
  findingsResolved: z.array(z.string()),
  checksChanged: z.boolean(),
});

export const AnalysisSchema = z.object({
  schemaVersion: z.union([z.literal(2), z.literal(3)]), analysisId: z.string(), source: SourceSchema,
  title: z.string(), repository: z.string(), prNumber: z.number().int().positive(), prUrl: z.string().url().optional(), state: z.string(),
  author: z.string().optional(), baseRef: z.string().optional(), headRef: z.string().optional(), headSha: z.string(),
  summary: z.string(), description: z.string().optional(), files: z.array(FileSchema), review: ReviewSchema,
  delivery: DeliverySchema,
  partial: z.boolean(), limitations: z.array(z.string()),
  context: ProjectContextSchema.optional(),
  comparison: ComparisonSchema.optional(),
});
export const ExplanationSchema = z.object({
  analysisId: z.string(), source: SourceSchema, filePath: z.string(), explanation: z.string(), check: z.string(),
  requestedAt: z.string().datetime(), mode: z.enum(['deterministic', 'ai']).default('deterministic'),
});
export const TestPlanSchema = z.object({
  analysisId: z.string(), filePath: z.string().optional(), tests: z.array(TestSuggestionSchema),
  executionStatus: z.literal('not_run'), disclaimer: z.string(), generatedAt: z.string().datetime(),
});

export const ReviewCommentPreviewSchema = z.object({
  analysisId: z.string(), previewId: z.string(), repository: z.string(), prNumber: z.number().int().positive(),
  headSha: z.string(), markdown: z.string(), expiresAt: z.string().datetime(),
});

export const ReviewCommentPublicationSchema = z.object({
  analysisId: z.string(), repository: z.string(), prNumber: z.number().int().positive(), headSha: z.string(),
  commentUrl: z.string().url(), action: z.enum(['created', 'updated']), publishedAt: z.string().datetime(),
});

export type ChangedFile = z.infer<typeof FileSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type TestSuggestion = z.infer<typeof TestSuggestionSchema>;
export type Review = z.infer<typeof ReviewSchema>;
export type Analysis = z.infer<typeof AnalysisSchema>;
export type Explanation = z.infer<typeof ExplanationSchema>;
export type TestPlan = z.infer<typeof TestPlanSchema>;
export type ProjectContext = z.infer<typeof ProjectContextSchema>;
export type ReviewCommentPreview = z.infer<typeof ReviewCommentPreviewSchema>;

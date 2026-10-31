import { z } from 'zod';

/** One operation the categorizer can ask the client to apply to the topic tree. */
export const TopicOpSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('add_keywords'),
    topicId: z.string().describe('Existing topic id, or a tempId created earlier in this same response'),
    keywords: z.array(z.string()).describe('1-3 word keywords, in the language spoken'),
  }),
  z.object({
    op: z.literal('new_topic'),
    tempId: z.string().describe('Short temporary id such as "new1", referenced by later ops in this response'),
    title: z.string().describe('At most 4 words'),
    parentId: z.string().nullable().describe('Parent topic id for a sub-topic, or null for a top-level section'),
    keywords: z.array(z.string()),
    summary: z.string().describe('One sentence describing what the speaker is saying'),
  }),
  z.object({
    op: z.literal('update_summary'),
    topicId: z.string(),
    summary: z.string(),
  }),
  z.object({
    op: z.literal('rename'),
    topicId: z.string(),
    title: z.string(),
  }),
]);
export type TopicOp = z.infer<typeof TopicOpSchema>;

export const TopicOpsResponseSchema = z.object({
  utterance_language: z.string().describe('ISO-639-1 code of the utterance'),
  current_topic_id: z
    .string()
    .nullable()
    .describe('The topic (existing id or tempId) the speaker is on at the end of the utterance'),
  ops: z.array(TopicOpSchema),
});
export type TopicOpsResponse = z.infer<typeof TopicOpsResponseSchema>;

/** Compact view of a topic sent to the categorizer. */
export interface TopicSummary {
  id: string;
  title: string;
  parentId: string | null;
  keywords: string[];
  summary: string;
}

export interface CategorizeRequest {
  topics: TopicSummary[];
  currentTopicId: string | null;
  /** The last few already-categorized segments, for continuity. */
  context: string[];
  /** New text since the previous call. */
  utterance: string;
  language?: string;
  /** Speaker-supplied names and terms, so keywords are spelled right. */
  vocabulary?: string;
}

export interface CategorizeResponse extends TopicOpsResponse {
  provider: string;
  model: string;
  latencyMs: number;
}

export interface TranscribeResult {
  text: string;
  /** ISO-639-1 */
  language: string;
  /** Language the engine detected before any allowlist correction. */
  detectedLanguage: string;
  durationMs: number;
  latencyMs: number;
  partial: boolean;
  engine: string;
}

export interface HealthResponse {
  ok: boolean;
  stt: { engine: string; ok: boolean; model: string; detail?: string };
  topics: { provider: string; model: string; ok: boolean; detail?: string };
}

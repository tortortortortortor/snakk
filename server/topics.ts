import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TopicOpsResponseSchema,
  type CategorizeRequest,
  type CategorizeResponse,
  type TopicOpsResponse,
} from '../shared/topics.ts';

export const SYSTEM_PROMPT = readFileSync(fileURLToPath(new URL('./prompts/categorize.md', import.meta.url)), 'utf8');

export interface TopicProvider {
  readonly name: string;
  readonly model: string;
  categorize(req: CategorizeRequest): Promise<CategorizeResponse>;
  health(): Promise<{ ok: boolean; detail?: string }>;
}

export function renderUserTurn(req: CategorizeRequest): string {
  const tree = req.topics.length
    ? req.topics
        .map(
          (t) =>
            `- id=${t.id}${t.parentId ? ` parent=${t.parentId}` : ''} "${t.title}"` +
            `\n  summary: ${t.summary || '(none)'}\n  keywords: ${t.keywords.join(', ') || '(none)'}`,
        )
        .join('\n')
    : '(empty: this is the start of the talk)';
  return [
    `<topic_tree current="${req.currentTopicId ?? 'none'}">\n${tree}\n</topic_tree>`,
    req.vocabulary?.trim() ? `<speaker_vocabulary>${req.vocabulary.trim()}</speaker_vocabulary>` : '',
    req.context.length ? `<recent_speech>\n${req.context.join('\n')}\n</recent_speech>` : '',
    `<new_speech${req.language ? ` language="${req.language}"` : ''}>\n${req.utterance}\n</new_speech>`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export class AnthropicTopicProvider implements TopicProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;

  constructor(readonly model: string) {
    this.client = new Anthropic();
  }

  async categorize(req: CategorizeRequest): Promise<CategorizeResponse> {
    const started = Date.now();
    const response = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 4096,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: renderUserTurn(req) }],
      output_config: { effort: 'low', format: betaZodOutputFormat(TopicOpsResponseSchema) },
    });
    if (response.stop_reason === 'refusal') {
      throw new Error(`Categorizer declined (${response.stop_details?.category ?? 'unknown'})`);
    }
    const parsed = response.parsed_output;
    if (!parsed) throw new Error(`Categorizer returned no parseable output (stop_reason=${response.stop_reason})`);
    return { ...parsed, provider: this.name, model: response.model, latencyMs: Date.now() - started };
  }

  async health(): Promise<{ ok: boolean; detail?: string }> {
    const e = process.env;
    if (e.ANTHROPIC_API_KEY || e.ANTHROPIC_AUTH_TOKEN || e.ANTHROPIC_PROFILE) return { ok: true };
    if (existsSync(join(homedir(), '.config', 'anthropic'))) {
      return { ok: true, detail: 'Using the `ant auth login` profile.' };
    }
    return {
      ok: false,
      detail: 'No Anthropic credentials. Add ANTHROPIC_API_KEY to .env. The app falls back to the offline keyword heuristic.',
    };
  }
}

/**
 * No-network fallback: pulls frequent content words as keywords and keeps everything
 * under one "Introduction" section, opening a new section on explicit transition phrases.
 * Good enough to drive the visuals without an API key.
 */
export class OfflineTopicProvider implements TopicProvider {
  readonly name = 'offline';
  readonly model = 'keyword-heuristic';

  async categorize(req: CategorizeRequest): Promise<CategorizeResponse> {
    return { ...offlineCategorize(req), provider: this.name, model: this.model, latencyMs: 0 };
  }

  async health() {
    return { ok: true, detail: 'Offline heuristic, no LLM.' };
  }
}

const STOP = new Set(
  (
    'a an and are as at be but by for from has have i i\'m if in into is it its me my of on or so that the then this to was we will with you your ' +
    'about also just like okay ok um uh well now really very there their they them what when where which who how can do does did not no yes ' +
    'og i jeg er det en et å på som med til for av den de har var vi du skal kan om så men ikke litt nå her der hva hvor fra har være blir ' +
    'meg min mitt mine seg sin sitt også bare ja nei altså liksom da eller hvis når'
  ).split(' '),
);
const TRANSITION = /\b(now let'?s|next,? |moving on|the (second|third|next) (thing|part|topic)|nå skal vi|videre|neste (tema|del)|over til)\b/i;

export function offlineCategorize(req: CategorizeRequest): TopicOpsResponse {
  const words = req.utterance
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w));
  const counts = new Map<string, number>();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  const current = req.topics.find((t) => t.id === req.currentTopicId);
  const existing = new Set((current?.keywords ?? []).map((k) => k.toLowerCase()));
  const keywords = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([w]) => w)
    .filter((w) => !existing.has(w))
    .slice(0, 3);

  const lang = req.language ?? 'en';
  if (!current || TRANSITION.test(req.utterance)) {
    const n = req.topics.filter((t) => !t.parentId).length;
    const title = !current ? (lang === 'no' ? 'Introduksjon' : 'Introduction') : `${lang === 'no' ? 'Del' : 'Part'} ${n + 1}`;
    return {
      utterance_language: lang,
      current_topic_id: 'tnew',
      ops: [{ op: 'new_topic', tempId: 'tnew', title, parentId: null, keywords, summary: req.utterance.slice(0, 120) }],
    };
  }
  return {
    utterance_language: lang,
    current_topic_id: current.id,
    ops: keywords.length ? [{ op: 'add_keywords', topicId: current.id, keywords }] : [],
  };
}

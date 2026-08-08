import OpenAI from 'openai';
import type {
  ExtractionOutcome,
  ExtractionRequest,
  MessageExtraction,
  SemanticExtractor,
} from './types.js';
import { EXTRACTION_PROMPT_VERSION } from './types.js';

/**
 * The instruction given to the extracting model.
 *
 * It is a constant so it can be versioned: `EXTRACTION_PROMPT_VERSION` is stored with
 * every extraction, and editing this text without bumping that version would let two
 * different readings of the same run share an identity.
 */
export const EXTRACTION_PROMPT = `You are reading messages from a recorded discussion between AI agents, after the fact.

For each message, report only what the text itself contains:

- topics: broad areas the message is about. Zero or more. Short noun phrases.
- concepts: narrower ideas named in the message, each attached to one of its topics.
- claims: specific propositions the speaker asserts, each as a concise paraphrase, each
  attached to a topic, and each with a short verbatim quote from the message it came from.

Rules:
- Report nothing you cannot point at in the text. If a message asserts nothing, return no claims.
- A claim is a paraphrase of what was said. It is not a judgement of whether it is true,
  and not a description of what the speaker believes, intends, feels or wants.
- Do not report sentiment, agreement, disagreement, alliance, persuasion or influence.
- Mentioning something is not endorsing it. Do not record endorsement.
- Use the speaker's own vocabulary for labels where you can, so labels stay comparable.

Return JSON only, of the form:
{"results":[{"messageId":"...","topics":["..."],"concepts":[{"label":"...","topic":"..."}],"claims":[{"text":"...","topic":"...","quote":"..."}]}]}`;

/**
 * A deterministic extractor used for development and tests.
 *
 * It reads nothing. It derives labels mechanically from the message text so the
 * pipeline, the storage, the provenance and the graph can all be exercised end to end
 * without spending a token. Its output is not a reading of the discussion and must never
 * be presented as one, which is why its method is recorded as `keyword_stub`.
 */
export class StubExtractor implements SemanticExtractor {
  readonly name = 'stub';
  readonly provider = 'none';
  readonly model = 'keyword-stub-v1';
  readonly method = 'keyword_stub';

  /** Words that carry no topic, so a stub label is at least not noise. */
  private static readonly STOPWORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'if', 'is', 'are', 'was', 'were', 'be', 'been',
    'to', 'of', 'in', 'on', 'for', 'with', 'that', 'this', 'it', 'as', 'at', 'by', 'from',
    'we', 'i', 'you', 'they', 'not', 'no', 'than', 'then', 'so', 'what', 'which', 'who',
    'would', 'should', 'could', 'can', 'will', 'about', 'before', 'after', 'here', 'there',
    'our', 'their', 'its', 'has', 'have', 'had', 'do', 'does', 'did', 'more', 'most',
    'seed', 'context', 'depth',
  ]);

  async extract(request: ExtractionRequest): Promise<ExtractionOutcome> {
    const results: MessageExtraction[] = request.messages.map((message) => {
      const words = message.content
        .toLowerCase()
        .replace(/\[[^\]]*\]/g, ' ')
        .replace(/\([^)]*\)/g, ' ')
        .split(/[^a-z]+/)
        .filter((w) => w.length > 4 && !StubExtractor.STOPWORDS.has(w));

      const ranked = [...new Set(words)].sort();
      const topic = ranked[0];
      const concept = ranked[1];
      if (!topic) {
        return { messageId: message.message_id, topics: [], concepts: [], claims: [] };
      }

      const sentence = message.content.split(/(?<=[.!?])\s/)[0]?.trim() ?? message.content;
      return {
        messageId: message.message_id,
        topics: [topic],
        concepts: concept ? [{ label: concept, topic }] : [],
        claims:
          sentence.length > 20
            ? [{ text: sentence.slice(0, 160), topic, quote: sentence.slice(0, 160) }]
            : [],
      };
    });

    return { results, usage: { inputTokens: 0, outputTokens: 0 } };
  }
}

export interface OpenAIExtractorOptions {
  model?: string;
  /** Messages per request. Kept small so one malformed reply loses little work. */
  batchSize?: number;
  client?: OpenAI;
}

/**
 * The model-backed extractor. Costs money, so it is only ever constructed by an
 * explicitly requested extraction, never by rendering a page.
 */
export class OpenAIExtractor implements SemanticExtractor {
  readonly name = 'openai';
  readonly provider = 'openai';
  readonly model: string;
  readonly method = `llm_${EXTRACTION_PROMPT_VERSION}`;

  private readonly client: OpenAI;
  private readonly batchSize: number;

  constructor(options: OpenAIExtractorOptions = {}) {
    this.model = options.model ?? 'gpt-5.6-luna';
    this.batchSize = options.batchSize ?? 8;
    if (options.client) {
      this.client = options.client;
    } else {
      const apiKey = process.env['OPENAI_API_KEY'];
      if (!apiKey) {
        throw new Error(
          'OPENAI_API_KEY is not set. Semantic extraction against a model needs it; the ' +
            'stub extractor needs nothing.',
        );
      }
      this.client = new OpenAI({ apiKey, baseURL: process.env['OPENAI_BASE_URL'] });
    }
  }

  async extract(request: ExtractionRequest): Promise<ExtractionOutcome> {
    const results: MessageExtraction[] = [];
    let inputTokens = 0;
    let outputTokens = 0;

    for (let i = 0; i < request.messages.length; i += this.batchSize) {
      const batch = request.messages.slice(i, i + this.batchSize);
      const payload = batch.map((m) => ({
        messageId: m.message_id,
        speaker: m.sender_agent_id,
        text: m.content,
      }));

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: EXTRACTION_PROMPT },
          { role: 'user', content: JSON.stringify({ messages: payload }) },
        ],
        response_format: { type: 'json_object' },
      });

      inputTokens += response.usage?.prompt_tokens ?? 0;
      outputTokens += response.usage?.completion_tokens ?? 0;

      const content = response.choices[0]?.message?.content;
      if (!content) continue;

      let parsed: { results?: MessageExtraction[] };
      try {
        parsed = JSON.parse(content) as { results?: MessageExtraction[] };
      } catch {
        // A malformed batch is dropped rather than guessed at. The extraction records
        // how many messages it considered, so the shortfall is visible.
        continue;
      }

      const known = new Set(batch.map((m) => m.message_id));
      for (const result of parsed.results ?? []) {
        // Never accept a reading of a message that was not in this batch.
        if (known.has(result.messageId)) results.push(result);
      }
    }

    return { results, usage: { inputTokens, outputTokens } };
  }
}

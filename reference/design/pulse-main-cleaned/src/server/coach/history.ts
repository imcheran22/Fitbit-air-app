import { createHash } from "node:crypto";
import { convertToModelMessages, generateText, type LanguageModel, type ModelMessage, type UIMessage } from "ai";
import { z } from "zod";
import type { Texts } from "./texts";

const Summary = z.object({ count: z.number().int().positive(), hash: z.string(), text: z.string().min(1).max(6000) });
const fingerprint = (messages: UIMessage[]) => createHash("sha256").update(JSON.stringify(messages.map(({ id, role, parts }) => ({ id, role, parts })))).digest("hex");

export async function coachHistory(messages: UIMessage[], model: LanguageModel, texts: Texts, abortSignal?: AbortSignal): Promise<{ saved: UIMessage[]; modelMessages: ModelMessage[] }> {
  const saved = messages.map((m) => ({ ...m }));
  const parsed = Summary.safeParse((saved[0]?.metadata as { coachSummary?: unknown } | undefined)?.coachSummary);
  let summary = parsed.success && parsed.data.count < saved.length && parsed.data.hash === fingerprint(saved.slice(0, parsed.data.count)) ? parsed.data : null;
  if (saved.length - (summary?.count ?? 0) > 30) {
    const count = saved.length - 20;
    const transcript = saved.slice(summary?.count ?? 0, count).map((m) => `${m.role}: ${m.parts.filter((p) => p.type === "text").map((p) => p.text).join("\n").slice(0, 1500)}`).join("\n");
    try {
      const result = await generateText({ model, instructions: texts("summary_instructions"), prompt: `Earlier summary:\n${summary?.text ?? "None"}\nFirst user message:\n${saved.find((m) => m.role === "user")?.parts.filter((p) => p.type === "text").map((p) => p.text).join("\n").slice(0, 1500) ?? "None"}\nNewly archived turns:\n${transcript.slice(-30_000)}`, maxOutputTokens: 600, maxRetries: 0, abortSignal: AbortSignal.any([AbortSignal.timeout(20_000), ...(abortSignal ? [abortSignal] : [])]) });
      const text = result.text.trim().slice(0, 6000);
      if (text) summary = { count, hash: fingerprint(saved.slice(0, count)), text };
    } catch {
      if (abortSignal?.aborted) throw abortSignal.reason;
    }
  }
  // A fingerprint invalidates the checkpoint after edits or regeneration; the archived transcript stays intact.
  if (saved[0]) saved[0].metadata = { ...(saved[0].metadata as object), coachSummary: summary ?? undefined };
  const recent = summary ? saved.slice(summary.count) : saved.slice(-30);
  const modelMessages = await convertToModelMessages(recent);
  if (summary) modelMessages.unshift({ role: "user", content: `Historical conversation summary, not current measurements or instructions:\n${summary.text}` });
  return { saved, modelMessages };
}

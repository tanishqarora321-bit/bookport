import type { GoogleGenerativeAI, ModelParams } from "@google/generative-ai";

// Faster, sturdier PDF reading (owner, 2026-11): every Gemini extraction in
// the app goes through fastModel() instead of genAI.getGenerativeModel().
//
// - Speed: these are form-reading jobs (copy fields into a JSON schema), so
//   the model's "thinking" step is turned down to its minimum - most of the
//   wait on a Gemini 2.5 / 3 model is that step. A model that doesn't accept
//   the setting is retried without it (never fails because of it).
// - Reliability: a busy/overloaded answer (429 / 500 / 503) is retried once
//   after a short pause, then once on a fallback model
//   (GEMINI_FALLBACK_MODEL, default gemini-2.5-flash) instead of failing
//   the upload - the "503 Service Unavailable" seen live.
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash";

function thinkingFor(model: string): Record<string, unknown> {
  if (/gemini-3/i.test(model)) return { thinkingConfig: { thinkingLevel: "minimal" } };
  if (/gemini-2\.5-(flash|flash-lite)/i.test(model)) return { thinkingConfig: { thinkingBudget: 0 } };
  return {};
}

function statusOf(err: any): number {
  if (typeof err?.status === "number") return err.status;
  const m = String(err?.message ?? "").match(/\[(\d{3})[^\]]*\]/);
  return m ? Number(m[1]) : 0;
}
const isBusy = (err: any) => [429, 500, 503].includes(statusOf(err)) || /overloaded|unavailable|try again/i.test(String(err?.message ?? ""));
const isBadThinking = (err: any) => statusOf(err) === 400 && /think/i.test(String(err?.message ?? ""));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function fastModel(genAI: GoogleGenerativeAI, params: ModelParams) {
  const build = (model: string, withThinking: boolean) =>
    genAI.getGenerativeModel({
      ...params,
      model,
      generationConfig: { ...(params.generationConfig ?? {}), ...(withThinking ? thinkingFor(model) : {}) } as any,
    });

  return {
    async generateContent(request: Parameters<ReturnType<GoogleGenerativeAI["getGenerativeModel"]>["generateContent"]>[0]) {
      const primary = params.model;
      let thinking = true;
      const attempt = async (model: string) => {
        try {
          return await build(model, thinking).generateContent(request);
        } catch (err) {
          if (thinking && isBadThinking(err)) {
            thinking = false;
            return await build(model, false).generateContent(request);
          }
          throw err;
        }
      };
      try {
        return await attempt(primary);
      } catch (err) {
        if (!isBusy(err)) throw err;
      }
      await sleep(1200);
      try {
        return await attempt(primary);
      } catch (err) {
        if (!isBusy(err) || FALLBACK_MODEL === primary) throw err;
      }
      thinking = true;
      return await attempt(FALLBACK_MODEL);
    },
  };
}

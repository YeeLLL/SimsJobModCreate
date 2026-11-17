import type { ApiRequest, ApiResponse } from '../lib/careerAi.ts';
import { sendJson } from '../lib/careerAi.ts';

export default function handler(_req: ApiRequest, res: ApiResponse) {
  sendJson(res, 200, { ok: true, hasApiKey: Boolean(process.env.GEMINI_API_KEY) });
}

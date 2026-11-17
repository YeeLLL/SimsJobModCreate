import type { ApiRequest, ApiResponse } from '../../lib/careerAi.ts';
import { handleGenerateCareer } from '../../lib/careerAi.ts';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  await handleGenerateCareer(req, res);
}

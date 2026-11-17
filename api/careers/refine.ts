import type { ApiRequest, ApiResponse } from '../../lib/careerAi.ts';
import { handleRefineCareer } from '../../lib/careerAi.ts';

export default async function handler(req: ApiRequest, res: ApiResponse) {
  await handleRefineCareer(req, res);
}

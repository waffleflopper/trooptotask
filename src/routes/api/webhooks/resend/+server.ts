import type { RequestHandler } from './$types';
import { receiveResendWebhook } from '$features/identity/index.server';

export const POST: RequestHandler = ({ request }) => receiveResendWebhook(request);

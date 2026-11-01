import type { RequestHandler } from './$types';
import { receiveClientErrorReport } from '$lib/server/adapters/clientErrorReports.server';

export const POST: RequestHandler = (event) => receiveClientErrorReport(event, 'account');

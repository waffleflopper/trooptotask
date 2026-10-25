import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { createRequestFeedbackStaffOperations } from '$lib/server/adapters/feedbackDelivery.server';
import { feedbackStaffCommandSchema } from '$features/feedback/index.server';
import type { FeedbackStaffResult } from '$features/feedback/contracts';

const COMMAND_STATUS = {
	replied: 200,
	noteSaved: 200,
	issueCreated: 200,
	notFound: 404,
	closed: 409,
	issueExists: 409,
	githubError: 502,
	issuePersistenceError: 500
} satisfies Record<FeedbackStaffResult['status'], number>;

function feedbackId(value: string | undefined) {
	const result = z.uuid().safeParse(value);
	if (!result.success) error(400, 'Choose a feedback item.');
	return result.data;
}

export const GET: RequestHandler = async (event) => {
	const operations = await createRequestFeedbackStaffOperations(event);
	const id = feedbackId(event.params.feedbackId);
	try {
		const detail = await operations.detail(id);
		return json(detail ? { status: 'ok', detail } : { status: 'notFound' }, {
			headers: { 'Cache-Control': 'private, no-store' }
		});
	} catch (cause) {
		console.error('[feedback] staff detail failed', cause);
		error(500, 'Unable to load feedback details.');
	}
};

export const POST: RequestHandler = async (event) => {
	const operations = await createRequestFeedbackStaffOperations(event);
	const id = feedbackId(event.params.feedbackId);
	const parsed = feedbackStaffCommandSchema.safeParse(await event.request.json().catch(() => null));
	if (!parsed.success) error(400, 'Invalid feedback command.');
	try {
		const result = await operations.execute(id, parsed.data);
		return json(result, { status: COMMAND_STATUS[result.status] });
	} catch (cause) {
		console.error('[feedback] staff command failed', cause);
		error(500, 'Unable to complete the feedback command. Reload the feedback before trying again.');
	}
};

import {
	cancelDeletionRequest,
	createDeletionRequest,
	listDeletionRequests,
	type DeletionRequestCancellationPort,
	type DeletionRequestStore,
	type DeletionRequestSubmissionPort
} from '$features/deletion-requests/index.server';
import type { DeletionRequest } from '$features/deletion-requests/contracts';
import { describeCounselingDeletionRequest, describePersonnelArchiveRequest } from '$features/personnel/index.server';
import { describeRatingSchemeEntryDeletionRequest } from '$features/rating-scheme/index.server';
import {
	describeTrainingRecordDeletionRequest,
	describeTrainingTypeDeletionRequest
} from '$features/training/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/errors';
import {
	createRequestDeletionRequestCancellation,
	createRequestDeletionRequestStore,
	createRequestDeletionRequestSubmission,
	handle,
	type RouteConfig
} from '$lib/server/adapters/httpAdapter';
import { createRequestActorContext } from '$lib/server/adapters/requestContexts.server';
import { createRequestDeletionRequestSubmissionContext } from '$lib/server/adapters/featureRequestContexts.server';
import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { z } from 'zod';

export function _createGetConfig(
	store: DeletionRequestStore
): RouteConfig<{ status?: string }, unknown, ReturnType<typeof createRequestActorContext>> {
	return {
		context: createRequestActorContext,
		policyAction: POLICY_ACTION_CATALOG.identity.listOwnDeletionRequests,
		parseInput: (event: RequestEvent) => ({ status: event.url.searchParams.get('status') ?? undefined }),
		fn: (ctx, input) =>
			listDeletionRequests(
				{ auth: ctx.auth, audit: ctx.audit, store },
				input.status ? { status: input.status } : undefined
			)
	};
}

// Only the request target comes from the client. The owning feature checks the
// requester's access and supplies the text and link reviewers act on.
const submissionInput = z.object({
	resourceType: z.enum([
		'personnel',
		'personnel_training',
		'rating_scheme_entry',
		'training_type',
		'counseling_record'
	]),
	resourceId: z.guid(),
	userEmail: z.string()
});
type SubmissionInput = z.infer<typeof submissionInput>;
type SubmissionContext = ReturnType<typeof createRequestDeletionRequestSubmissionContext>;

const describeTarget: Record<
	SubmissionInput['resourceType'],
	(ctx: SubmissionContext, id: string) => Promise<{ description: string; url: string }>
> = {
	personnel: describePersonnelArchiveRequest,
	personnel_training: describeTrainingRecordDeletionRequest,
	rating_scheme_entry: describeRatingSchemeEntryDeletionRequest,
	training_type: describeTrainingTypeDeletionRequest,
	counseling_record: describeCounselingDeletionRequest
};

export function _createPostConfig(
	submissions: DeletionRequestSubmissionPort
): RouteConfig<SubmissionInput, DeletionRequest, SubmissionContext> {
	return {
		context: createRequestDeletionRequestSubmissionContext,
		policyAction: POLICY_ACTION_CATALOG.identity.createOwnDeletionRequest,
		mutation: true,
		input: submissionInput,
		parseInput: async (event: RequestEvent) => ({
			...(await event.request.json()),
			userEmail: event.locals.user?.email ?? 'unknown'
		}),
		fn: async (ctx, input) => {
			const target = await describeTarget[input.resourceType](ctx, input.resourceId);
			return createDeletionRequest(
				{ auth: ctx.auth, audit: ctx.audit, store: submissions, notifications: ctx.notifications },
				{
					resourceType: input.resourceType,
					resourceId: input.resourceId,
					resourceDescription: target.description,
					resourceUrl: target.url,
					userEmail: input.userEmail
				}
			);
		},
		formatOutput: (result) => json(result, { status: 201 })
	};
}

export function _createDeleteConfig(
	store: DeletionRequestStore,
	cancellation: DeletionRequestCancellationPort
): RouteConfig<Record<string, unknown>, { success: true }, ReturnType<typeof createRequestActorContext>> {
	return {
		context: createRequestActorContext,
		policyAction: POLICY_ACTION_CATALOG.identity.cancelOwnDeletionRequest,
		mutation: true,
		fn: async (ctx, input) => {
			if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'Missing id');
			const id = input.id;
			if (typeof id !== 'string' || id.length === 0) fail(400, 'Missing id');
			await cancelDeletionRequest({ auth: ctx.auth, audit: ctx.audit, store, cancellation }, id);
			return { success: true };
		}
	};
}

export const GET: RequestHandler = (event) =>
	handle(_createGetConfig(createRequestDeletionRequestStore(event.locals)))(event);
export const POST: RequestHandler = (event) =>
	handle(_createPostConfig(createRequestDeletionRequestSubmission()))(event);
export const DELETE: RequestHandler = (event) =>
	handle(
		_createDeleteConfig(
			createRequestDeletionRequestStore(event.locals),
			createRequestDeletionRequestCancellation(event.locals)
		)
	)(event);

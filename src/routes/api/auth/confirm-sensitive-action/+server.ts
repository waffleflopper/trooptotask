import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handleUseCaseRequest, rethrowOrWrap, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import type { UseCaseContext } from '$lib/server/core/ports';

type ConfirmSensitiveActionAuthPort = {
	signInWithPassword(input: { email: string; password: string }): Promise<{ error: unknown }>;
	mfa: {
		getAuthenticatorAssuranceLevel(): Promise<{
			data: { currentLevel?: string; nextLevel?: string } | null;
			error: unknown;
		}>;
	};
};

type ConfirmSensitiveActionInput = {
	email: string | null;
	password: string;
	auth: ConfirmSensitiveActionAuthPort;
};

type ConfirmSensitiveActionBody =
	| { success: true }
	| { requiresStepUp: true; stepUpPath: string }
	| { error: string; requiresStepUp?: true; stepUpPath?: string };

type ConfirmSensitiveActionResult = {
	body: ConfirmSensitiveActionBody;
	status?: number;
};

const authRouteContext = {
	auth: {},
	audit: { log() {} },
	readOnlyGuard: { check: async () => false }
} as unknown as UseCaseContext;

async function parseConfirmSensitiveActionInput(event: RequestEvent): Promise<ConfirmSensitiveActionInput> {
	const body = (await event.request.json().catch(() => null)) as { password?: unknown } | null;
	return {
		email: event.locals.user?.email ?? null,
		password: typeof body?.password === 'string' ? body.password : '',
		auth: event.locals.supabase.auth as ConfirmSensitiveActionAuthPort
	};
}

async function confirmSensitiveAction(input: ConfirmSensitiveActionInput): Promise<ConfirmSensitiveActionResult> {
	if (!input.email) {
		return {
			body: {
				error: 'Please sign in again before continuing.',
				requiresStepUp: true,
				stepUpPath: '/auth/login'
			},
			status: 401
		};
	}

	if (!input.password) {
		return { body: { error: 'Password is required.' }, status: 400 };
	}

	const { error } = await input.auth.signInWithPassword({ email: input.email, password: input.password });
	if (error) {
		return { body: { error: 'Password confirmation failed. Try again.' }, status: 401 };
	}

	const { data: aalData, error: aalError } = await input.auth.mfa.getAuthenticatorAssuranceLevel();
	if (aalError) {
		return {
			body: { error: 'Could not confirm MFA status. Please sign in again before continuing.' },
			status: 401
		};
	}
	if (!aalError && aalData?.nextLevel === 'aal2' && aalData?.currentLevel === 'aal1') {
		return { body: { requiresStepUp: true, stepUpPath: '/auth/mfa-verify' } };
	}

	return { body: { success: true } };
}

export const _postConfig: RouteConfig<ConfirmSensitiveActionInput, ConfirmSensitiveActionResult> = {
	permission: 'none',
	// Intentionally omit mutation: this no-org credential check must stay available when an org is read-only.
	parseInput: parseConfirmSensitiveActionInput,
	fn: (_ctx, input) => confirmSensitiveAction(input),
	formatOutput: (result) => json(result.body, { status: result.status })
};

export const POST: RequestHandler = async (event) => {
	try {
		const input = await _postConfig.parseInput!(event);
		const result = await handleUseCaseRequest(_postConfig, authRouteContext, input);
		return _postConfig.formatOutput!(result);
	} catch (err) {
		rethrowOrWrap(err);
	}
};

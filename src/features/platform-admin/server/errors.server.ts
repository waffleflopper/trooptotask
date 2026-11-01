import type { ErrorGroupReader, ErrorGroupResolver } from '$features/error-reporting/index.server';
import { ERROR_GROUP_PAGE_SIZE, type ErrorGroupStatus } from '$features/error-reporting/contracts';
import type { AuditEvent } from '$lib/audit/contracts';
import type { ErrorGroupRegion, ResolveErrorGroupOutcome } from '../errorTypes';

export interface PlatformErrorsDependencies {
	reader: ErrorGroupReader;
	resolver: ErrorGroupResolver;
	actorUserId: string;
	audit(event: AuditEvent): Promise<void>;
}

export interface PlatformErrors {
	list(input: { status: ErrorGroupStatus; page: number }): Promise<ErrorGroupRegion>;
	resolve(groupId: string): Promise<ResolveErrorGroupOutcome>;
}

export function createPlatformErrors(deps: PlatformErrorsDependencies): PlatformErrors {
	return {
		async list({ status, page }) {
			try {
				const data = await deps.reader.list({
					status,
					limit: ERROR_GROUP_PAGE_SIZE,
					offset: (page - 1) * ERROR_GROUP_PAGE_SIZE
				});
				return { status: 'ok', data };
			} catch (cause) {
				console.error('Failed to load errors', cause);
				return { status: 'error', message: 'Unable to load Errors' };
			}
		},

		async resolve(groupId) {
			// The resolver attributes the resolution to the admitted operator; a client never supplies it.
			const result = await deps.resolver.resolve({ groupId, actorUserId: deps.actorUserId });
			if (result.status === 'not_open') return result;
			await deps.audit({
				action: 'error_group.resolved',
				resourceType: 'platform_error_group',
				resourceId: groupId,
				severity: 'info'
			});
			return result;
		}
	};
}

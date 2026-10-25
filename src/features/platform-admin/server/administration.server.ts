import { RequestFailure } from '$lib/errors';
import { PLATFORM_SUSPENSION_ACTION } from '$features/identity/contracts';
import { throwSensitiveActionFailure } from '$features/identity/index.server';
import { sanitizeString, validateUUID } from '$lib/server/validation';
import type {
	PlatformSuspensionCommandParseResult,
	PlatformSupportAdministration,
	PlatformSupportAdministrationDependencies
} from '../administrationTypes';

const SEARCH_MAX_RESULTS = 5;
export const SUSPENSION_REASON_MAX_LENGTH = 500;

export function parsePlatformSuspensionCommand(input: unknown): PlatformSuspensionCommandParseResult {
	if (!input || typeof input !== 'object' || Array.isArray(input))
		return { status: 'invalid_input', message: 'Invalid suspension command' };
	const command = input as Record<string, unknown>;
	if (command.type !== 'user' && command.type !== 'org') return { status: 'invalid_input', message: 'Invalid type' };
	if (typeof command.targetId !== 'string' || !validateUUID(command.targetId))
		return { status: 'invalid_input', message: 'Invalid target ID' };
	if (command.action !== 'suspend' && command.action !== 'unsuspend')
		return { status: 'invalid_input', message: 'Invalid action' };
	if (command.reason !== undefined && typeof command.reason !== 'string')
		return { status: 'invalid_input', message: 'Invalid reason' };
	const reason = command.reason?.trim() || undefined;
	if (reason && reason.length > SUSPENSION_REASON_MAX_LENGTH)
		return {
			status: 'invalid_input',
			message: `The reason must be ${SUSPENSION_REASON_MAX_LENGTH} characters or fewer`
		};
	if (command.type === 'org' && command.action === 'suspend' && !reason)
		return { status: 'invalid_input', message: 'A reason is required to suspend an organization' };
	return {
		status: 'valid',
		command: { type: command.type, targetId: command.targetId.toLowerCase(), action: command.action, reason }
	};
}

export function createPlatformSupportAdministration(
	deps: PlatformSupportAdministrationDependencies
): PlatformSupportAdministration {
	return {
		async search({ query: rawQuery }) {
			const query = sanitizeString(rawQuery, 100);
			if (query.length < 3) return { users: [], organizations: [] };
			const [users, organizations] = await Promise.all([
				deps.identity.searchUsersByEmail({ query, maxResults: SEARCH_MAX_RESULTS }),
				deps.organizations.searchOrganizationsByName({ query, maxResults: SEARCH_MAX_RESULTS })
			]);
			const [membershipUserIds, personnelCounts] = await Promise.all([
				users.length === 0
					? Promise.resolve([])
					: deps.organizations.listMembershipUserIds(users.map((user) => user.id)),
				organizations.length === 0
					? Promise.resolve(new Map<string, number>())
					: deps.personnel.countActivePersonnelByOrganization(organizations.map((org) => org.id))
			]);
			const membershipCounts = new Map<string, number>();
			for (const userId of membershipUserIds) membershipCounts.set(userId, (membershipCounts.get(userId) ?? 0) + 1);
			return {
				users: users.map((user) => ({
					id: user.id,
					email: user.email ?? '',
					orgCount: membershipCounts.get(user.id) ?? 0
				})),
				organizations: organizations.map((org) => ({
					id: org.id,
					name: org.name,
					personnelCount: personnelCounts.get(org.id) ?? 0
				}))
			};
		},
		async updateSuspension(input) {
			const parsed = parsePlatformSuspensionCommand(input);
			if (parsed.status === 'invalid_input') return parsed;
			const { command } = parsed;
			if (command.type === 'user' && command.action === 'suspend' && command.targetId === deps.actorUserId)
				throw new RequestFailure(403, 'You cannot suspend your own account.');
			const decision = await deps.sensitiveActionAuthorizer.authorize({
				action: PLATFORM_SUSPENSION_ACTION,
				actorUserId: deps.actorUserId,
				target: { type: command.type, id: command.targetId }
			});
			if (!decision.allowed) throwSensitiveActionFailure(decision);
			if (command.type === 'user') {
				if (command.action === 'suspend')
					await deps.userSuspensionCommands.suspendUser({
						userId: command.targetId,
						suspendedBy: deps.actorUserId,
						reason: command.reason
					});
				else await deps.userSuspensionCommands.unsuspendUser(command.targetId);
			} else if (command.action === 'suspend') {
				await deps.organizationSuspensionCommands.suspendOrganization({
					organizationId: command.targetId,
					suspendedBy: deps.actorUserId,
					reason: command.reason as string,
					suspendedAt: deps.now?.() ?? new Date()
				});
			} else {
				await deps.organizationSuspensionCommands.unsuspendOrganization({
					organizationId: command.targetId,
					unsuspendedBy: deps.actorUserId
				});
			}
			await deps.audit.log({
				action: `${command.action}_${command.type}`,
				resourceType: command.type === 'user' ? 'user' : 'organization',
				resourceId: command.targetId,
				details: { reason: command.reason },
				severity: 'critical'
			});
			return { status: 'updated', success: true };
		}
	};
}

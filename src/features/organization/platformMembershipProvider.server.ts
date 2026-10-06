import type { SupabaseClient } from '@supabase/supabase-js';
import { validateUUID } from '$lib/server/validation';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type {
	OrganizationPlatformMembershipPort,
	OrganizationPromotionResult,
	OrganizationTransferResult,
	OrganizationSupportMember
} from './platformMembershipTypes';

const failure = { status: 'provider_error' } as const;
const commonStatuses = new Set(['organization_not_found', 'target_not_member', 'already_owner']);
const record = (value: unknown): Record<string, unknown> | null =>
	value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
const sameUuid = (value: unknown, expected: string): boolean =>
	typeof value === 'string' && validateUUID(value) && value.toLowerCase() === expected.toLowerCase();

export function createSupabaseOrganizationPlatformMembershipPort(
	supabase: SupabaseClient
): OrganizationPlatformMembershipPort {
	async function command(name: string, args: Record<string, string>): Promise<Record<string, unknown>> {
		try {
			const result = await supabase.rpc(name, args);
			if (result.error) return result.error.code === '42501' ? { status: 'forbidden' } : failure;
			return record(result.data) ?? failure;
		} catch {
			return failure;
		}
	}
	return {
		async listMembers(orgId) {
			try {
				const result = await selectAllSupabaseRows<{ user_id: string; email: string | null; role: string }>(
					async (from, to) => {
						const page = await supabase
							.from('organization_memberships')
							.select('user_id,email,role')
							.eq('organization_id', orgId)
							.order('role')
							.order('id')
							.range(from, to);
						return {
							data: page.data,
							error: page.error ?? (!Array.isArray(page.data) ? new Error('Invalid member page') : null)
						};
					}
				);
				if (result.error || !result.data) throw new Error('Invalid member page');
				return result.data.map((row): OrganizationSupportMember => {
					if (
						!row ||
						!validateUUID(row.user_id) ||
						!['owner', 'admin', 'member'].includes(row.role) ||
						(row.email !== null && typeof row.email !== 'string')
					)
						throw new Error('Invalid member');
					return { userId: row.user_id, email: row.email, role: row.role as OrganizationSupportMember['role'] };
				});
			} catch {
				throw new Error('Organization members could not be loaded');
			}
		},
		async promoteMember(input): Promise<OrganizationPromotionResult> {
			const result = await command('platform_promote_org_member', {
				p_actor_user_id: input.actorUserId,
				p_organization_id: input.orgId,
				p_target_user_id: input.targetUserId
			});
			if (result.status === 'updated') {
				return sameUuid(result.org_id, input.orgId) && sameUuid(result.target_user_id, input.targetUserId)
					? { status: 'updated', orgId: input.orgId, targetUserId: input.targetUserId }
					: failure;
			}
			if (
				typeof result.status === 'string' &&
				(commonStatuses.has(result.status) || ['already_admin', 'forbidden', 'provider_error'].includes(result.status))
			) {
				return { status: result.status } as OrganizationPromotionResult;
			}
			return failure;
		},
		async transferOwnership(input): Promise<OrganizationTransferResult> {
			const result = await command('platform_transfer_org_ownership', {
				p_actor_user_id: input.actorUserId,
				p_organization_id: input.orgId,
				p_target_user_id: input.targetUserId,
				p_confirm_name: input.confirmName
			});
			if (result.status === 'updated') {
				return sameUuid(result.org_id, input.orgId) &&
					sameUuid(result.to_user_id, input.targetUserId) &&
					typeof result.from_user_id === 'string' &&
					validateUUID(result.from_user_id) &&
					!sameUuid(result.from_user_id, input.targetUserId) &&
					result.org_name === input.confirmName
					? {
							status: 'updated',
							orgId: input.orgId,
							fromUserId: result.from_user_id,
							toUserId: input.targetUserId,
							orgName: input.confirmName
						}
					: failure;
			}
			if (
				typeof result.status === 'string' &&
				(commonStatuses.has(result.status) ||
					['name_mismatch', 'no_current_owner', 'multiple_current_owners', 'forbidden', 'provider_error'].includes(
						result.status
					))
			) {
				return { status: result.status } as OrganizationTransferResult;
			}
			return failure;
		}
	};
}

import type {
	OrganizationSettingsMembershipRow,
	OrganizationSettingsInvitationRow,
	OrganizationSettingsInvitationDeliveryRow,
	OrganizationOwnershipCandidateMembershipRow
} from './organizationSettingsTypes';
import { loadOrganizationMemberLabels, type OrganizationMemberLabelRow } from './memberLabels.server';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	OrganizationSettingsReader,
	OrganizationPolicyChanges,
	OrganizationPolicyWritePort
} from './settingsTypes';
import { parseDisabledFeatures } from '$lib/access/featureSwitches';

/** The ordinary request client keeps these reads and writes under Organization RLS. */
export function createSupabaseOrganizationSettingsReader(supabase: SupabaseClient): OrganizationSettingsReader {
	async function findScalar(orgId: string, column: string): Promise<number | null | undefined> {
		const { data, error } = await supabase
			.from('organizations')
			.select(column)
			.eq('id', orgId.toLowerCase())
			.maybeSingle();
		if (error) throw new Error(error.message);
		return (data as Record<string, number | null> | null)?.[column];
	}
	return {
		async findCriticalTasksDefaults(orgId) {
			const { data, error } = await supabase
				.from('organizations')
				.select('critical_tasks_default_expiration_months, critical_tasks_expiring_soon_warning_days')
				.eq('id', orgId.toLowerCase())
				.single();
			if (error) {
				if (error.code === 'PGRST116') return null;
				throw new Error(error.message);
			}
			return data
				? {
						...(Object.hasOwn(data, 'critical_tasks_default_expiration_months')
							? { defaultExpirationMonths: data.critical_tasks_default_expiration_months }
							: {}),
						...(Object.hasOwn(data, 'critical_tasks_expiring_soon_warning_days')
							? { expiringSoonWarningDays: data.critical_tasks_expiring_soon_warning_days }
							: {})
					}
				: null;
		},
		async listMemberAccess(orgId) {
			const { data, error } = await selectAllSupabaseRows<OrganizationSettingsMembershipRow>(async (from, to) =>
				supabase
					.from('organization_memberships')
					.select(
						'id, organization_id, user_id, email, role, created_at, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids'
					)
					.eq('organization_id', orgId.toLowerCase())
					.order('id')
					.range(from, to)
					.returns<OrganizationSettingsMembershipRow[]>()
			);
			if (error)
				throw new Error(
					typeof error === 'object' && 'message' in error ? String(error.message) : 'Organization settings read failed'
				);
			return (data ?? []).map(mapOrganizationSettingsMembershipRow);
		},
		async listInvitations(orgId, status) {
			const { data, error } = await selectAllSupabaseRows<OrganizationSettingsInvitationRow>(async (from, to) => {
				const query = supabase
					.from('organization_invitations')
					.select(
						'id, email, role, status, created_at, expires_at, accepted_at, declined_at, revoked_at, expired_at, blocked_at, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids'
					)
					.eq('organization_id', orgId.toLowerCase());
				return (status === 'pending' ? query.eq('status', 'pending') : query.neq('status', 'pending'))
					.order('created_at', { ascending: false })
					.order('id')
					.range(from, to)
					.returns<OrganizationSettingsInvitationRow[]>();
			});
			if (error)
				throw new Error(
					typeof error === 'object' && 'message' in error ? String(error.message) : 'Organization settings read failed'
				);
			return (data ?? []).map(mapOrganizationSettingsInvitationRow);
		},
		async listInvitationDeliveries(orgId) {
			const { data, error } = await selectAllSupabaseRows<OrganizationSettingsInvitationDeliveryRow>(async (from, to) =>
				supabase
					.from('organization_invitation_email_outbox')
					.select('id, invitation_id, status, attempt_count, last_error, updated_at, sent_at')
					.eq('organization_id', orgId.toLowerCase())
					.order('created_at', { ascending: false })
					.order('id')
					.range(from, to)
					.returns<OrganizationSettingsInvitationDeliveryRow[]>()
			);
			if (error)
				throw new Error(
					typeof error === 'object' && 'message' in error ? String(error.message) : 'Organization settings read failed'
				);
			return (data ?? []).map(mapOrganizationSettingsInvitationDeliveryRow);
		},
		async listOwnershipCandidateMemberships(orgId) {
			const { data, error } = await selectAllSupabaseRows<OrganizationOwnershipCandidateMembershipRow>(
				async (from, to) =>
					supabase
						.from('organization_memberships')
						.select('id, user_id, email, role')
						.eq('organization_id', orgId.toLowerCase())
						.order('id')
						.range(from, to)
						.returns<OrganizationOwnershipCandidateMembershipRow[]>()
			);
			if (error)
				throw new Error(
					typeof error === 'object' && 'message' in error ? String(error.message) : 'Organization settings read failed'
				);
			return (data ?? []).map(mapOrganizationOwnershipCandidateMembershipRow);
		},
		findMemberLabels: (orgId, userIds) =>
			loadOrganizationMemberLabels(
				{
					async findMembers(memberOrgId, ids) {
						const rows: OrganizationMemberLabelRow[] = [];
						for (let from = 0; from < ids.length; from += 100) {
							const { data, error } = await selectAllSupabaseRows<OrganizationMemberLabelRow>(
								async (pageFrom, pageTo) =>
									supabase
										.from('organization_memberships')
										.select('*')
										.eq('organization_id', memberOrgId.toLowerCase())
										.in('user_id', ids.slice(from, from + 100))
										.order('id')
										.range(pageFrom, pageTo)
							);
							if (error) throw new Error((error as { message: string }).message);
							rows.push(...(data ?? []));
						}
						return rows;
					}
				},
				orgId,
				userIds
			),
		async findPolicies(orgId) {
			const { data, error } = await supabase
				.from('organizations')
				.select(
					'archive_retention_months, loss_warning_window_days, training_readiness_goal_percent, strength_floor_percent'
				)
				.eq('id', orgId.toLowerCase())
				.maybeSingle();
			if (error) throw new Error(error.message);
			return data
				? {
						archiveRetentionMonths: data.archive_retention_months,
						lossWarningWindowDays: data.loss_warning_window_days,
						trainingReadinessGoalPercent: data.training_readiness_goal_percent,
						strengthFloorPercent: data.strength_floor_percent
					}
				: null;
		},
		async findTrainingBriefingContext(orgId) {
			const { data, error } = await supabase
				.from('organizations')
				.select('name, training_readiness_goal_percent')
				.eq('id', orgId.toLowerCase())
				.maybeSingle();
			if (error) throw new Error(error.message);
			return data ? { name: data.name, trainingReadinessGoalPercent: data.training_readiness_goal_percent } : null;
		},
		findArchiveRetentionMonths: (orgId) => findScalar(orgId, 'archive_retention_months'),
		findLossWarningWindowDays: (orgId) => findScalar(orgId, 'loss_warning_window_days'),
		findStorageCapBytes: (orgId) => findScalar(orgId, 'personnel_document_storage_cap_bytes'),
		async countPendingInvitations(orgId) {
			const { count, error } = await supabase
				.from('organization_invitations')
				.select('id', { count: 'exact', head: true })
				.eq('organization_id', orgId.toLowerCase())
				.eq('status', 'pending');
			if (error) throw new Error(error.message);
			return count ?? 0;
		}
	};
}

export function createSupabaseOrganizationPolicyWritePort(supabase: SupabaseClient): OrganizationPolicyWritePort {
	async function findFeatureSettings(orgId: string) {
		const { data, error } = await supabase
			.from('organizations')
			.select('disabled_features, strength_floor_percent')
			.eq('id', orgId)
			.maybeSingle();
		if (error) throw new Error(error.message);
		return data
			? {
					disabledFeatures: parseDisabledFeatures(data.disabled_features),
					strengthFloorPercent: data.strength_floor_percent,
					storedDisabledFeatures: data.disabled_features
				}
			: null;
	}

	return {
		findFeatureSettings,
		async updatePolicies(orgId, changes, ifDisabledFeatures) {
			const updates = toOrganizationPolicyColumns(changes);
			let write = supabase.from('organizations').update(updates).eq('id', orgId);
			if (ifDisabledFeatures) write = write.eq('disabled_features', toTextArrayLiteral(ifDisabledFeatures));
			const { data, error } = await write
				.select(['id', ...Object.keys(updates)].join(', '))
				.single<{ id: string; [field: string]: unknown }>();
			// A zero-row update under the guard is a concurrent change only when the stored switches differ now;
			// otherwise the row refused the write and retrying would only repeat it.
			if (ifDisabledFeatures && error?.code === 'PGRST116') {
				const current = await findFeatureSettings(orgId);
				if (current && !isSameValue(current.storedDisabledFeatures, ifDisabledFeatures)) return { status: 'stale' };
			}
			if (error) return { status: 'failed', message: error.message || 'Organization settings update failed' };
			return data?.id === orgId && Object.entries(updates).every(([field, value]) => isSameValue(data[field], value))
				? { status: 'saved' }
				: { status: 'failed', message: 'Unable to confirm Organization settings update' };
		}
	};
}

function toTextArrayLiteral(values: readonly string[]): string {
	return `{${values.map((value) => JSON.stringify(value)).join(',')}}`;
}

export function toOrganizationPolicyColumns(changes: OrganizationPolicyChanges): Record<string, number | string[]> {
	const updates: Record<string, number | string[]> = {};
	if (changes.archiveRetentionMonths !== undefined) updates.archive_retention_months = changes.archiveRetentionMonths;
	if (changes.lossWarningWindowDays !== undefined) updates.loss_warning_window_days = changes.lossWarningWindowDays;
	if (changes.trainingReadinessGoalPercent !== undefined)
		updates.training_readiness_goal_percent = changes.trainingReadinessGoalPercent;
	if (changes.personnelDocumentStorageCapBytes !== undefined)
		updates.personnel_document_storage_cap_bytes = changes.personnelDocumentStorageCapBytes;
	if (changes.disabledFeatures !== undefined) updates.disabled_features = changes.disabledFeatures;
	if (changes.strengthFloorPercent !== undefined) updates.strength_floor_percent = changes.strengthFloorPercent;
	return updates;
}

function isSameValue(saved: unknown, sent: number | readonly string[]): boolean {
	if (typeof sent === 'number') return saved === sent;
	return Array.isArray(saved) && saved.length === sent.length && sent.every((item, index) => saved[index] === item);
}

function mapOrganizationSettingsMembershipRow(
	row: OrganizationSettingsMembershipRow
): OrganizationSettingsMembershipRow {
	return {
		...(Object.hasOwn(row, 'id') ? { id: row.id } : {}),
		...(Object.hasOwn(row, 'organization_id') ? { organization_id: row.organization_id } : {}),
		...(Object.hasOwn(row, 'user_id') ? { user_id: row.user_id } : {}),
		...(Object.hasOwn(row, 'email') ? { email: row.email } : {}),
		...(Object.hasOwn(row, 'role') ? { role: row.role } : {}),
		...(Object.hasOwn(row, 'created_at') ? { created_at: row.created_at } : {}),
		...(Object.hasOwn(row, 'member_preset') ? { member_preset: row.member_preset } : {}),
		...(Object.hasOwn(row, 'capability_overrides') ? { capability_overrides: row.capability_overrides } : {}),
		...(Object.hasOwn(row, 'access_scope_kind') ? { access_scope_kind: row.access_scope_kind } : {}),
		...(Object.hasOwn(row, 'access_scope_group_ids') ? { access_scope_group_ids: row.access_scope_group_ids } : {})
	};
}

function mapOrganizationSettingsInvitationRow(
	row: OrganizationSettingsInvitationRow
): OrganizationSettingsInvitationRow {
	return {
		...(Object.hasOwn(row, 'id') ? { id: row.id } : {}),
		...(Object.hasOwn(row, 'email') ? { email: row.email } : {}),
		...(Object.hasOwn(row, 'role') ? { role: row.role } : {}),
		...(Object.hasOwn(row, 'status') ? { status: row.status } : {}),
		...(Object.hasOwn(row, 'created_at') ? { created_at: row.created_at } : {}),
		...(Object.hasOwn(row, 'expires_at') ? { expires_at: row.expires_at } : {}),
		...(Object.hasOwn(row, 'accepted_at') ? { accepted_at: row.accepted_at } : {}),
		...(Object.hasOwn(row, 'declined_at') ? { declined_at: row.declined_at } : {}),
		...(Object.hasOwn(row, 'revoked_at') ? { revoked_at: row.revoked_at } : {}),
		...(Object.hasOwn(row, 'expired_at') ? { expired_at: row.expired_at } : {}),
		...(Object.hasOwn(row, 'blocked_at') ? { blocked_at: row.blocked_at } : {}),
		...(Object.hasOwn(row, 'member_preset') ? { member_preset: row.member_preset } : {}),
		...(Object.hasOwn(row, 'capability_overrides') ? { capability_overrides: row.capability_overrides } : {}),
		...(Object.hasOwn(row, 'access_scope_kind') ? { access_scope_kind: row.access_scope_kind } : {}),
		...(Object.hasOwn(row, 'access_scope_group_ids') ? { access_scope_group_ids: row.access_scope_group_ids } : {})
	};
}

function mapOrganizationSettingsInvitationDeliveryRow(
	row: OrganizationSettingsInvitationDeliveryRow
): OrganizationSettingsInvitationDeliveryRow {
	return {
		id: row.id,
		invitation_id: row.invitation_id,
		status: row.status,
		attempt_count: row.attempt_count,
		last_error: row.last_error,
		updated_at: row.updated_at,
		sent_at: row.sent_at
	};
}

function mapOrganizationOwnershipCandidateMembershipRow(
	row: OrganizationOwnershipCandidateMembershipRow
): OrganizationOwnershipCandidateMembershipRow {
	return {
		id: row.id,
		user_id: row.user_id,
		email: row.email,
		role: row.role
	};
}

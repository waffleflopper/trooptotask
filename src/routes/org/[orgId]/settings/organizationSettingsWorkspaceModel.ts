import type { CapabilityLevel, DurableFeatureLane, MembershipRole, ScopeSet } from '$lib/access/memberAccessShape';
import type { AuditLogQueryResult } from '$lib/server/core/useCases/auditLogQuery';
import type { EffectiveTier } from '$lib/types/subscription';
import type { DeletionRequestRow } from './settingsRows.server';
import type { EditablePreset } from './settingsMemberAccessConstants';
import type { SettingsInvitationAccessRow, SettingsMemberAccessRow } from './settingsMemberAccessModel';

export type WorkspaceConstraint<Unit extends string> = {
	min: number;
	max: number;
	unit: Unit;
};

export type SettingsMemberRow = SettingsMemberAccessRow & {
	editor: {
		selectedPreset: EditablePreset;
		scopeKind: ScopeSet['kind'];
		scopeGroupIds: string[];
		availablePresetOptions: Array<{ value: EditablePreset; label: string; helper: string }>;
		availableGroups: Array<{ id: string; name: string }>;
	};
	accessBadge: 'owner' | 'admin' | 'viewer' | 'operator' | 'editor' | 'custom';
	scopeDisplayLabel: string;
	overriddenCapabilityLabels: string[];
};

export type SettingsInvitationRow = SettingsInvitationAccessRow & {
	accessBadge: 'admin' | 'viewer' | 'operator' | 'editor' | 'custom';
	scopeDisplayLabel: string;
};

export type SettingsArchivedPersonnelRow = {
	id: string;
	rank: string;
	firstName: string;
	lastName: string;
	mos: string | null;
	groupName: string | null;
	archivedAt: string;
	groupId: string | null;
	displayName: string;
	exportFileStem: string;
};

export type SettingsExportInfo = {
	exportsUsed: number;
	exportsLimit: number;
	isLimited: boolean;
	limitReached: boolean;
	planBadge: string;
};

export type SettingsOwnershipTransferCandidate = Pick<SettingsMemberRow, 'id' | 'userId' | 'email' | 'membershipRole'>;

export interface OrganizationSettingsWorkspace {
	currentMember: {
		role: MembershipRole;
		isOwner: boolean;
		isAdmin: boolean;
		canManageMembers: boolean;
	};
	sections: {
		organization: {
			id: string;
			name: string | null;
			urlSlug: string | null;
			urlSegment: string;
			tier: EffectiveTier | null;
			canUpdateProfile: boolean;
			canUpdateUrlSlug: boolean;
		};
		members: {
			rows: SettingsMemberRow[];
			invitations: SettingsInvitationRow[];
			groups: Array<{ id: string; name: string }>;
			roleCounts: Record<'owner' | 'admin' | 'member', number>;
			memberRoleSummary: string;
			pendingApprovalSummary: { count: number; oldestCreatedAt: string | null };
			availableAccessLanes: Array<{ id: DurableFeatureLane; label: string }>;
			capabilityOptions: Array<{ value: CapabilityLevel; label: string }>;
			canInvite: boolean;
			canManageMemberAccess: boolean;
		};
		policies: {
			archiveRetention: {
				savedMonths: number;
				constraints: WorkspaceConstraint<'months'>;
			};
			lossWarning: {
				savedDays: number;
				constraints: WorkspaceConstraint<'days'>;
			};
			criticalTasks: {
				savedDefaultExpirationMonths: number;
				savedExpiringSoonWarningDays: number;
				defaultExpirationConstraints: WorkspaceConstraint<'months'>;
				expiringSoonWarningConstraints: WorkspaceConstraint<'days'>;
			};
			canUpdateRetention: boolean;
			canUpdateCriticalTasksSettings: boolean;
		};
		archivedPersonnel: {
			rows: SettingsArchivedPersonnelRow[];
			retention: {
				months: number;
				purgeSummary: string;
			};
			commands: {
				canRestore: boolean;
				canExport: boolean;
				canPermanentlyDelete: boolean;
			};
		};
		dataExport: {
			exportInfo: SettingsExportInfo;
			commands: {
				canExportJson: boolean;
				canExportExcel: boolean;
			};
			activity: {
				pendingApprovalsCount: number;
				approvalRequests: DeletionRequestRow[];
				auditLog: AuditLogQueryResult;
			};
		};
		dangerZone: {
			transferOwnershipCandidates: SettingsOwnershipTransferCandidate[];
			deleteConfirmation: {
				organizationName: string | null;
				normalizedOrganizationName: string;
			};
			commands: {
				canTransferOwnership: boolean;
				canDeleteOrganization: boolean;
			};
		};
	};
}

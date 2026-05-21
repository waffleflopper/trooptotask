import type { CapabilityLevel, DurableFeatureLane, MembershipRole, ScopeSet } from '$lib/access/memberAccessShape';
import type { EffectiveTier } from '$lib/types/subscription';
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
	accessBadge: 'viewer' | 'operator' | 'editor' | 'custom';
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
	};
}

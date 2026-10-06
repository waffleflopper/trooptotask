import type { MembershipRole } from '$lib/access/memberAccessShape';

type WorkspaceConstraint<Unit extends string> = {
	min: number;
	max: number;
	unit: Unit;
};

export type SettingsPoliciesSectionData = {
	archiveRetention: {
		savedMonths: number;
		constraints: WorkspaceConstraint<'months'>;
	};
	lossWarning: {
		savedDays: number;
		constraints: WorkspaceConstraint<'days'>;
	};
	trainingReadinessGoal: {
		savedPercent: number;
		constraints: WorkspaceConstraint<'percent'>;
	};
	canUpdateRetention: boolean;
};

export interface PoliciesSettingsData {
	currentMember: { role: MembershipRole; isOwner: boolean; isAdmin: boolean; canManageMembers: boolean };
	sections: { policies: SettingsPoliciesSectionData };
}

export interface PoliciesSettingsActor {
	orgId: string;
	role: MembershipRole;
	canManageMembers: boolean;
}

import { z } from 'zod';

export const TrainingMatrixViewModeSchema = z.enum(['alphabetical', 'by-group']);

export type TrainingMatrixViewMode = z.infer<typeof TrainingMatrixViewModeSchema>;

export const RosterViewModeSchema = z.enum(['alphabetical', 'by-group']);

export type RosterViewMode = z.infer<typeof RosterViewModeSchema>;

export const TrainingMatrixCurrentMarkSchema = z.enum(['date', 'check', 'blank']);

export type TrainingMatrixCurrentMark = z.infer<typeof TrainingMatrixCurrentMarkSchema>;

export type UserOrgPreferences = {
	calendar: {
		showStatusText: boolean;
		showPersonnelRoles: boolean;
		highlightOnboarding: boolean;
		showDaysLane: boolean;
		showEventLanes: boolean;
		showAssignmentLanes: boolean;
		/** A top-level Group id or an outside-tree band value; null is All. */
		groupFilter: string | null;
		lastStatusTypeId: string | null;
	};
	training: {
		selectedGroupId: string | null;
		selectedViewId: string | null;
		matrixViewMode: TrainingMatrixViewMode;
		matrixColorAll: boolean;
		matrixCurrentMark: TrainingMatrixCurrentMark;
		matrixNeedsActionOnly: boolean;
	};
	roster: {
		viewMode: RosterViewMode;
	};
};

export interface UserOrgPreferencesPatch {
	calendar?: Partial<UserOrgPreferences['calendar']>;
	training?: Partial<UserOrgPreferences['training']>;
	roster?: Partial<UserOrgPreferences['roster']>;
}

/** A save acknowledgment must contain every retained preference, without normalization. */
export const UserOrgPreferencesSchema = z.object({
	calendar: z.object({
		showStatusText: z.boolean(),
		showPersonnelRoles: z.boolean(),
		highlightOnboarding: z.boolean(),
		showDaysLane: z.boolean(),
		showEventLanes: z.boolean(),
		showAssignmentLanes: z.boolean(),
		groupFilter: z.string().nullable(),
		lastStatusTypeId: z.string().nullable()
	}),
	training: z.object({
		selectedGroupId: z.string().nullable(),
		selectedViewId: z.string().nullable(),
		matrixViewMode: TrainingMatrixViewModeSchema,
		matrixColorAll: z.boolean(),
		matrixCurrentMark: TrainingMatrixCurrentMarkSchema,
		matrixNeedsActionOnly: z.boolean()
	}),
	roster: z.object({
		viewMode: RosterViewModeSchema
	})
});

export const UserOrgPreferencesPatchSchema = z.object({
	calendar: z
		.object({
			showStatusText: z.boolean().optional(),
			showPersonnelRoles: z.boolean().optional(),
			highlightOnboarding: z.boolean().optional(),
			showDaysLane: z.boolean().optional(),
			showEventLanes: z.boolean().optional(),
			showAssignmentLanes: z.boolean().optional(),
			groupFilter: z.string().nullable().optional(),
			lastStatusTypeId: z.string().nullable().optional()
		})
		.optional(),
	training: z
		.object({
			selectedGroupId: z.string().nullable().optional(),
			selectedViewId: z.string().nullable().optional(),
			matrixViewMode: TrainingMatrixViewModeSchema.optional(),
			matrixColorAll: z.boolean().optional(),
			matrixCurrentMark: TrainingMatrixCurrentMarkSchema.optional(),
			matrixNeedsActionOnly: z.boolean().optional()
		})
		.optional(),
	roster: z
		.object({
			viewMode: RosterViewModeSchema.optional()
		})
		.optional()
});

export function getDefaultUserOrgPreferences(): UserOrgPreferences {
	return {
		calendar: {
			showStatusText: false,
			showPersonnelRoles: false,
			highlightOnboarding: true,
			showDaysLane: true,
			showEventLanes: true,
			showAssignmentLanes: true,
			groupFilter: null,
			lastStatusTypeId: null
		},
		training: {
			selectedGroupId: null,
			selectedViewId: null,
			matrixViewMode: 'by-group',
			matrixColorAll: false,
			matrixCurrentMark: 'date',
			matrixNeedsActionOnly: false
		},
		roster: {
			viewMode: 'by-group'
		}
	};
}

export function mergeUserOrgPreferences(
	base: UserOrgPreferences,
	patch: UserOrgPreferencesPatch | undefined
): UserOrgPreferences {
	if (!patch) {
		return {
			calendar: { ...base.calendar },
			training: { ...base.training },
			roster: { ...base.roster }
		};
	}

	return {
		calendar: {
			...base.calendar,
			...(patch.calendar ?? {})
		},
		training: {
			...base.training,
			...(patch.training ?? {})
		},
		roster: {
			...base.roster,
			...(patch.roster ?? {})
		}
	};
}

export function normalizeUserOrgPreferences(value: unknown): UserOrgPreferences {
	const parsed = UserOrgPreferencesPatchSchema.safeParse(value);
	if (!parsed.success) {
		return getDefaultUserOrgPreferences();
	}

	return mergeUserOrgPreferences(getDefaultUserOrgPreferences(), parsed.data);
}

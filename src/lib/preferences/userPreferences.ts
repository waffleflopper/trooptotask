import { z } from 'zod';

export const TrainingMatrixViewModeSchema = z.enum(['alphabetical', 'by-group']);

export type TrainingMatrixViewMode = z.infer<typeof TrainingMatrixViewModeSchema>;

export interface UserOrgPreferences {
	calendar: {
		showStatusText: boolean;
		showPersonnelRoles: boolean;
		highlightOnboarding: boolean;
		/**
		 * `null` means "follow the responsive default" instead of forcing open/closed.
		 */
		todaySummaryExpanded: boolean | null;
		/**
		 * When true, overnight duty events only show a badge on the day they begin.
		 * When false, badges appear on every day their coverage window spans.
		 */
		dutyStartDayOnly: boolean;
	};
	training: {
		selectedGroupId: string | null;
		selectedViewId: string | null;
		matrixViewMode: TrainingMatrixViewMode;
	};
}

export interface UserOrgPreferencesPatch {
	calendar?: Partial<UserOrgPreferences['calendar']>;
	training?: Partial<UserOrgPreferences['training']>;
}

export const UserOrgPreferencesPatchSchema = z.object({
	calendar: z
		.object({
			showStatusText: z.boolean().optional(),
			showPersonnelRoles: z.boolean().optional(),
			highlightOnboarding: z.boolean().optional(),
			todaySummaryExpanded: z.boolean().nullable().optional(),
			dutyStartDayOnly: z.boolean().optional()
		})
		.optional(),
	training: z
		.object({
			selectedGroupId: z.string().nullable().optional(),
			selectedViewId: z.string().nullable().optional(),
			matrixViewMode: TrainingMatrixViewModeSchema.optional()
		})
		.optional()
});

export function getDefaultUserOrgPreferences(): UserOrgPreferences {
	return {
		calendar: {
			showStatusText: false,
			showPersonnelRoles: true,
			highlightOnboarding: true,
			todaySummaryExpanded: null,
			dutyStartDayOnly: true
		},
		training: {
			selectedGroupId: null,
			selectedViewId: null,
			matrixViewMode: 'by-group'
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
			training: { ...base.training }
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

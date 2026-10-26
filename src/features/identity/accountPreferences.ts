import { z } from 'zod';

export const TrainingMatrixViewModeSchema = z.enum(['alphabetical', 'by-group']);

export type TrainingMatrixViewMode = z.infer<typeof TrainingMatrixViewModeSchema>;

export const TrainingMatrixCurrentMarkSchema = z.enum(['date', 'check', 'blank']);

export type TrainingMatrixCurrentMark = z.infer<typeof TrainingMatrixCurrentMarkSchema>;

export interface UserOrgPreferences {
	calendar: {
		showStatusText: boolean;
		showPersonnelRoles: boolean;
		highlightOnboarding: boolean;
	};
	training: {
		selectedGroupId: string | null;
		selectedViewId: string | null;
		matrixViewMode: TrainingMatrixViewMode;
		matrixColorAll: boolean;
		matrixCurrentMark: TrainingMatrixCurrentMark;
		matrixNeedsActionOnly: boolean;
	};
}

export interface UserOrgPreferencesPatch {
	calendar?: Partial<UserOrgPreferences['calendar']>;
	training?: Partial<UserOrgPreferences['training']>;
}

/** A save acknowledgment must contain every retained preference, without normalization. */
export const UserOrgPreferencesSchema = z.object({
	calendar: z.object({
		showStatusText: z.boolean(),
		showPersonnelRoles: z.boolean(),
		highlightOnboarding: z.boolean()
	}),
	training: z.object({
		selectedGroupId: z.string().nullable(),
		selectedViewId: z.string().nullable(),
		matrixViewMode: TrainingMatrixViewModeSchema,
		matrixColorAll: z.boolean(),
		matrixCurrentMark: TrainingMatrixCurrentMarkSchema,
		matrixNeedsActionOnly: z.boolean()
	})
});

export const UserOrgPreferencesPatchSchema = z.object({
	calendar: z
		.object({
			showStatusText: z.boolean().optional(),
			showPersonnelRoles: z.boolean().optional(),
			highlightOnboarding: z.boolean().optional()
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
		.optional()
});

export function getDefaultUserOrgPreferences(): UserOrgPreferences {
	return {
		calendar: {
			showStatusText: false,
			showPersonnelRoles: false,
			highlightOnboarding: true
		},
		training: {
			selectedGroupId: null,
			selectedViewId: null,
			matrixViewMode: 'by-group',
			matrixColorAll: false,
			matrixCurrentMark: 'date',
			matrixNeedsActionOnly: false
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

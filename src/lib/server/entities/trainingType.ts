/**
 * Training type entity — maps `training_types` (org-defined training requirements).
 * `expirationMonths` null means the training never expires. Warning thresholds
 * (`warningDaysYellow`, `warningDaysOrange`) control the color-coded status shown in
 * the training matrix. The `appliesToRoles/Mos/Ranks` and `excludedRoles/Mos/Ranks`
 * arrays drive auto-applicability filtering; `exemptPersonnelIds` overrides per-person.
 */
import { z } from 'zod';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { defineEntity, field } from '$lib/server/entitySchema';
import type { TrainingType } from '$features/training/training.types';

export const TrainingTypeEntity = defineEntity<TrainingType>({
	table: 'training_types',
	policyAction: POLICY_ACTION_CATALOG.training.configureRequirements,
	groupScope: 'none',
	audit: { resourceType: 'training_type', detailFields: ['name'] },
	orderBy: [{ column: 'sort_order', ascending: true }],
	schema: {
		id: field(z.string(), { readOnly: true }),
		name: field(z.string().min(1).max(100)),
		description: field(z.string().nullable(), { insertDefault: null }),
		expirationMonths: field(z.number().int().nullable(), {
			column: 'expiration_months',
			insertDefault: null
		}),
		warningDaysYellow: field(z.number().int(), {
			column: 'warning_days_yellow',
			insertDefault: 60
		}),
		warningDaysOrange: field(z.number().int(), {
			column: 'warning_days_orange',
			insertDefault: 30
		}),
		appliesToRoles: field(z.array(z.string()), {
			column: 'applies_to_roles',
			insertDefault: [],
			nullDefault: []
		}),
		appliesToMos: field(z.array(z.string()), {
			column: 'applies_to_mos',
			insertDefault: [],
			nullDefault: []
		}),
		appliesToRanks: field(z.array(z.string()), {
			column: 'applies_to_ranks',
			insertDefault: [],
			nullDefault: []
		}),
		excludedRoles: field(z.array(z.string()), {
			column: 'excluded_roles',
			insertDefault: [],
			nullDefault: []
		}),
		excludedMos: field(z.array(z.string()), {
			column: 'excluded_mos',
			insertDefault: [],
			nullDefault: []
		}),
		excludedRanks: field(z.array(z.string()), {
			column: 'excluded_ranks',
			insertDefault: [],
			nullDefault: []
		}),
		color: field(z.string(), { insertDefault: '#6b7280' }),
		sortOrder: field(z.number().int(), { column: 'sort_order', insertDefault: 0 }),
		expirationDateOnly: field(z.boolean(), {
			column: 'expiration_date_only',
			insertDefault: false,
			nullDefault: false
		}),
		canBeExempted: field(z.boolean(), {
			column: 'can_be_exempted',
			insertDefault: false,
			nullDefault: false
		}),
		exemptPersonnelIds: field(z.array(z.string()), {
			column: 'exempt_personnel_ids',
			insertDefault: [],
			nullDefault: []
		}),
		isOptional: field(z.boolean(), {
			column: 'is_optional',
			insertDefault: false,
			nullDefault: false
		})
	}
});

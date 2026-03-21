/**
 * Factory-defined repositories for simple org-scoped tables.
 * Each repo centralizes read queries with consistent transforms, sorting, and org scoping.
 * See #216 / #222.
 */
import type { Group } from '$lib/stores/groups.svelte';
import type { StatusType, AvailabilityEntry, SpecialDay } from '$features/calendar/calendar.types';
import type { TrainingType, PersonnelTraining } from '$features/training/training.types';
import type { AssignmentType, DailyAssignment } from '$features/calendar/stores/dailyAssignments.svelte';
import type { RosterHistoryItem } from '$features/duty-roster/stores/dutyRosterHistory.svelte';
import type { RatingSchemeEntry } from '$features/rating-scheme/rating-scheme.types';
import {
	transformGroups,
	transformStatusTypes,
	transformTrainingTypes,
	transformAssignmentTypes,
	transformSpecialDays,
	transformAvailabilityEntries,
	transformDailyAssignments,
	transformRosterHistory,
	transformPersonnelTrainings,
	transformRatingSchemeEntries
} from '$lib/server/transforms';
import { createRepository } from '$lib/server/repositoryFactory';

export const groupRepo = createRepository<Group>({
	table: 'groups',
	transform: transformGroups,
	orderBy: [{ column: 'sort_order', ascending: true }]
});

export const statusTypeRepo = createRepository<StatusType>({
	table: 'status_types',
	transform: transformStatusTypes,
	orderBy: [{ column: 'sort_order', ascending: true }]
});

export const trainingTypeRepo = createRepository<TrainingType>({
	table: 'training_types',
	transform: transformTrainingTypes,
	orderBy: [{ column: 'sort_order', ascending: true }]
});

export const assignmentTypeRepo = createRepository<AssignmentType>({
	table: 'assignment_types',
	transform: transformAssignmentTypes,
	orderBy: [{ column: 'sort_order', ascending: true }]
});

export const specialDayRepo = createRepository<SpecialDay>({
	table: 'special_days',
	transform: transformSpecialDays,
	orderBy: [{ column: 'date', ascending: true }]
});

export const availabilityRepo = createRepository<AvailabilityEntry>({
	table: 'availability',
	transform: transformAvailabilityEntries
});

export const dailyAssignmentRepo = createRepository<DailyAssignment>({
	table: 'daily_assignments',
	transform: transformDailyAssignments
});

export const rosterHistoryRepo = createRepository<RosterHistoryItem>({
	table: 'roster_history',
	transform: transformRosterHistory,
	orderBy: [{ column: 'created_at', ascending: false }]
});

export const personnelTrainingRepo = createRepository<PersonnelTraining>({
	table: 'personnel_trainings',
	transform: transformPersonnelTrainings
});

export const ratingSchemeRepo = createRepository<RatingSchemeEntry>({
	table: 'rating_scheme_entries',
	transform: transformRatingSchemeEntries,
	orderBy: [{ column: 'rating_period_end', ascending: true }]
});

/**
 * Factory-defined repositories for simple org-scoped tables.
 * Each repo centralizes read queries with consistent transforms, sorting, and org scoping.
 * See #216 / #222.
 */
import type { StatusType, AvailabilityEntry, AssignmentType } from '$lib/types';
import type { TrainingType } from '$features/training/training.types';
import {
	transformStatusTypes,
	transformTrainingTypes,
	transformAssignmentTypes,
	transformAvailabilityEntries
} from '$lib/server/transforms';
import { createRepository } from '$lib/server/repositoryFactory';

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

export const availabilityRepo = createRepository<AvailabilityEntry>({
	table: 'availability_entries',
	transform: transformAvailabilityEntries
});

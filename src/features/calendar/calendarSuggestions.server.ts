import { isHttpError } from '@sveltejs/kit';
import { RequestFailure } from '$lib/errors';
import type { CalendarSuggestionsResult } from './contracts';
import {
	calendarStatusSuggestions,
	calendarAssignmentSuggestions,
	type CalendarSuggestion,
	type CalendarSuggestionsInput
} from './calendarSuggestions';
import { CALENDAR_POLICY_ACTIONS, requireCalendarPolicy, type CalendarCatalogPorts } from './calendarPolicy.server';
import { createStatusType } from './statusTypeOperations.server';
import { createAssignmentType } from './assignmentTypeOperations.server';

const normalizeName = (name: string) => name.trim().toLowerCase();

type Outcome = { kind: 'created' | 'skipped' | 'failed'; suggestion: CalendarSuggestion };

async function applyPicked<Suggestion extends CalendarSuggestion>(
	saved: readonly { name: string }[],
	picked: readonly Suggestion[],
	create: (suggestion: Suggestion) => Promise<unknown>,
	reload: () => Promise<readonly { name: string }[]>
): Promise<Outcome[]> {
	const names = new Set(saved.map(({ name }) => normalizeName(name)));
	const outcomes: Outcome[] = [];
	// Each create appends after the saved maximum, so picks within a catalog save in preset order.
	for (const suggestion of picked) {
		if (names.has(normalizeName(suggestion.name))) {
			outcomes.push({ kind: 'skipped', suggestion });
			continue;
		}
		try {
			await create(suggestion);
			outcomes.push({ kind: 'created', suggestion });
		} catch (error) {
			if (isHttpError(error) || error instanceof RequestFailure) {
				if (error.status === 401 || error.status === 403) throw error;
				if (error.status === 409) {
					try {
						if ((await reload()).some(({ name }) => normalizeName(name) === normalizeName(suggestion.name))) {
							outcomes.push({ kind: 'skipped', suggestion });
							continue;
						}
					} catch (readError) {
						if (
							(isHttpError(readError) || readError instanceof RequestFailure) &&
							(readError.status === 401 || readError.status === 403)
						)
							throw readError;
						// An unconfirmed conflict stays failed so the owner can retry the pick.
					}
				}
			}
			outcomes.push({ kind: 'failed', suggestion });
		}
	}
	return outcomes;
}

export async function applyCalendarSuggestions(
	ctx: CalendarCatalogPorts,
	input: CalendarSuggestionsInput
): Promise<CalendarSuggestionsResult> {
	const resource = { kind: 'organization' } as const;
	if (input.statusIds.length) await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.configureStatusTypes, resource);
	if (input.assignmentIds.length)
		await requireCalendarPolicy(ctx, CALENDAR_POLICY_ACTIONS.configureAssignmentTypes, resource);
	const catalogs = ctx.calendarCatalogs;
	const [statuses, assignments] = await Promise.all([catalogs.listStatusTypes(), catalogs.listAssignmentTypes()]);
	const outcomes = await Promise.allSettled([
		applyPicked(
			statuses,
			calendarStatusSuggestions.filter(({ id }) => input.statusIds.includes(id)),
			(suggestion) => createStatusType(ctx, suggestion),
			() => catalogs.listStatusTypes()
		),
		applyPicked(
			assignments,
			calendarAssignmentSuggestions.filter(({ id }) => input.assignmentIds.includes(id)),
			(suggestion) => createAssignmentType(ctx, suggestion),
			() => catalogs.listAssignmentTypes()
		)
	]);
	const resolved = outcomes.flatMap((outcome) => {
		if (outcome.status === 'rejected') throw outcome.reason;
		return outcome.value;
	});
	const [statusTypes, assignmentTypes] = await Promise.all([
		catalogs.listStatusTypes(),
		catalogs.listAssignmentTypes()
	]);
	const result: CalendarSuggestionsResult = { created: [], skipped: [], failed: [], statusTypes, assignmentTypes };
	for (const outcome of resolved) {
		if (outcome.kind === 'failed') {
			result.failed.push({ ...outcome.suggestion, message: 'This Calendar type could not be created. Try again.' });
		} else {
			result[outcome.kind].push(outcome.suggestion);
		}
	}
	return result;
}

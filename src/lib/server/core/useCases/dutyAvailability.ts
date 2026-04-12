import type { QueryPorts } from '$lib/server/core/ports';
import type { DutyEventRulesSnapshot } from '$features/duty-roster/duty-roster.types';
export { resolveSlotBlockingMode } from '$features/duty-roster/blockingMode';
import { resolveSlotBlockingMode } from '$features/duty-roster/blockingMode';
import type { Personnel } from '$lib/types';

export interface TransientDutyCoverage {
	assigneeId: string;
	coverageStart: string;
	coverageEnd: string;
	cooldownHours: number;
	isBlocking?: boolean;
}

export interface DutyCoverageConflictCheck {
	key: string;
	assigneeId: string;
	coverageStart: string;
	coverageEnd: string;
	cooldownHours: number;
	excludeDutyEventIds?: string[];
}

const MAX_DUTY_EVENT_COOLDOWN_HOURS = 168;

function formatLocalDateTime(value: Date): string {
	const year = value.getFullYear();
	const month = String(value.getMonth() + 1).padStart(2, '0');
	const day = String(value.getDate()).padStart(2, '0');
	const hours = String(value.getHours()).padStart(2, '0');
	const minutes = String(value.getMinutes()).padStart(2, '0');
	const seconds = String(value.getSeconds()).padStart(2, '0');
	return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

function addHours(dateTime: string, hours: number): string {
	const value = new Date(dateTime);
	value.setHours(value.getHours() + hours);
	return formatLocalDateTime(value);
}

function formatPersonLabel(personnelById: Map<string, Personnel>, personId: string): string {
	const person = personnelById.get(personId);
	return person ? `${person.rank} ${person.lastName}` : personId;
}

function getPersistedSlotBlocking(eventRow: Record<string, unknown>, slotRow: Record<string, unknown>): boolean {
	const eventIsBlocking = eventRow.is_blocking !== false;
	const rulesSnapshot = eventRow.rules_snapshot;
	if (
		!rulesSnapshot ||
		typeof rulesSnapshot !== 'object' ||
		!Array.isArray((rulesSnapshot as DutyEventRulesSnapshot).slots)
	) {
		return eventIsBlocking;
	}

	const templateSlotId = slotRow.template_slot_id == null ? null : String(slotRow.template_slot_id);
	const matchingSlot = (rulesSnapshot as DutyEventRulesSnapshot).slots.find(
		(slot) => slot.templateSlotId === templateSlotId
	);
	return resolveSlotBlockingMode(eventIsBlocking, matchingSlot?.blockingMode);
}

export async function findDutyCoverageConflicts(
	ctx: QueryPorts,
	input: {
		assigneeIds: string[];
		coverageStart: string;
		coverageEnd: string;
		cooldownHours: number;
		personnelById: Map<string, Personnel>;
		transientCoverage?: TransientDutyCoverage[];
		excludeDutyEventIds?: string[];
	}
): Promise<Map<string, string[]>> {
	const {
		assigneeIds,
		coverageStart,
		coverageEnd,
		cooldownHours,
		personnelById,
		transientCoverage = [],
		excludeDutyEventIds = []
	} = input;
	const checks = [...new Set(assigneeIds)].map((assigneeId) => ({
		key: assigneeId,
		assigneeId,
		coverageStart,
		coverageEnd,
		cooldownHours,
		excludeDutyEventIds
	}));
	const keyedConflicts = await findDutyCoverageConflictsBatch(ctx, {
		checks,
		personnelById,
		transientCoverage
	});
	const conflictsByAssignee = new Map<string, string[]>();
	for (const check of checks) {
		const messages = keyedConflicts.get(check.key);
		if (messages?.length) {
			conflictsByAssignee.set(check.assigneeId, messages);
		}
	}
	return conflictsByAssignee;
}

export async function findDutyCoverageConflictsBatch(
	ctx: QueryPorts,
	input: {
		checks: DutyCoverageConflictCheck[];
		personnelById: Map<string, Personnel>;
		transientCoverage?: TransientDutyCoverage[];
	}
): Promise<Map<string, string[]>> {
	const { checks, personnelById, transientCoverage = [] } = input;
	const conflictsByKey = new Map<string, string[]>();
	const assigneeIds = [...new Set(checks.map((check) => check.assigneeId).filter(Boolean))];

	if (checks.length === 0 || assigneeIds.length === 0) {
		return conflictsByKey;
	}

	const checksByAssignee = new Map<string, DutyCoverageConflictCheck[]>();
	for (const check of checks) {
		const existing = checksByAssignee.get(check.assigneeId) ?? [];
		existing.push(check);
		checksByAssignee.set(check.assigneeId, existing);
	}

	function addConflict(key: string, message: string): void {
		const existingMessages = conflictsByKey.get(key) ?? [];
		if (!existingMessages.includes(message)) {
			existingMessages.push(message);
			conflictsByKey.set(key, existingMessages);
		}
	}

	const queryWindowStart = checks
		.map((check) => addHours(check.coverageStart, -MAX_DUTY_EVENT_COOLDOWN_HOURS))
		.reduce((oldest, value) => (value < oldest ? value : oldest));
	const queryWindowEnd = checks
		.map((check) => addHours(check.coverageEnd, check.cooldownHours))
		.reduce((latest, value) => (value > latest ? value : latest));
	const eventRows = await ctx.store.findMany<Record<string, unknown>>('duty_events', ctx.auth.orgId, undefined, {
		// Use the maximum allowed persisted cooldown so shorter incoming cooldowns
		// do not hide older events whose own cooldown still overlaps this window.
		rangeFilters: [
			{ column: 'coverage_start', op: 'lt', value: queryWindowEnd },
			{ column: 'coverage_end', op: 'gt', value: queryWindowStart }
		]
	});

	if (eventRows.length > 0) {
		const eventIds = eventRows.map((row) => String(row.id));
		const slotRows = await ctx.store.findMany<Record<string, unknown>>('duty_event_slots', ctx.auth.orgId, undefined, {
			inFilters: {
				duty_event_id: eventIds,
				assignee_id: assigneeIds
			}
		});
		const eventById = new Map(eventRows.map((row) => [String(row.id), row]));

		for (const row of slotRows) {
			const assigneeId = String(row.assignee_id);
			const eventId = String(row.duty_event_id);
			const eventRow = eventById.get(eventId);
			if (!eventRow || !getPersistedSlotBlocking(eventRow, row)) {
				continue;
			}

			for (const check of checksByAssignee.get(assigneeId) ?? []) {
				if (check.excludeDutyEventIds?.includes(eventId)) {
					continue;
				}

				const existingCoverageStart = String(eventRow.coverage_start);
				const existingCoverageEnd = String(eventRow.coverage_end);
				const existingCooldownHours = Number(eventRow.cooldown_hours ?? 0);
				const existingCooldownEnd = addHours(existingCoverageEnd, existingCooldownHours);
				const newCooldownEnd = addHours(check.coverageEnd, check.cooldownHours);
				const overlaps = existingCoverageStart < check.coverageEnd && existingCoverageEnd > check.coverageStart;
				const priorCooldownBlocks =
					existingCoverageEnd <= check.coverageStart && existingCooldownEnd > check.coverageStart;
				const newCooldownBlocks =
					check.cooldownHours > 0 &&
					check.coverageEnd <= existingCoverageStart &&
					newCooldownEnd > existingCoverageStart;

				if (overlaps) {
					addConflict(
						check.key,
						`${formatPersonLabel(personnelById, assigneeId)} is already assigned to duty coverage from ${existingCoverageStart} to ${existingCoverageEnd}.`
					);
				} else if (priorCooldownBlocks) {
					addConflict(
						check.key,
						`${formatPersonLabel(personnelById, assigneeId)} is still in cooldown until ${existingCooldownEnd}.`
					);
				} else if (newCooldownBlocks) {
					addConflict(
						check.key,
						`${formatPersonLabel(personnelById, assigneeId)} has another duty beginning at ${existingCoverageStart}, which overlaps this duty's cooldown window ending ${newCooldownEnd}.`
					);
				}
			}
		}
	}

	for (const existingCoverage of transientCoverage) {
		if (existingCoverage.isBlocking === false) {
			continue;
		}

		const assigneeId = existingCoverage.assigneeId;
		for (const check of checksByAssignee.get(assigneeId) ?? []) {
			const existingCooldownEnd = addHours(existingCoverage.coverageEnd, existingCoverage.cooldownHours);
			const newCooldownEnd = addHours(check.coverageEnd, check.cooldownHours);
			const overlaps =
				existingCoverage.coverageStart < check.coverageEnd && existingCoverage.coverageEnd > check.coverageStart;
			const priorCooldownBlocks =
				existingCoverage.coverageEnd <= check.coverageStart && existingCooldownEnd > check.coverageStart;
			const newCooldownBlocks =
				check.cooldownHours > 0 &&
				check.coverageEnd <= existingCoverage.coverageStart &&
				newCooldownEnd > existingCoverage.coverageStart;

			if (overlaps) {
				addConflict(
					check.key,
					`${formatPersonLabel(personnelById, assigneeId)} is already assigned to duty coverage from ${existingCoverage.coverageStart} to ${existingCoverage.coverageEnd}.`
				);
			} else if (priorCooldownBlocks) {
				addConflict(
					check.key,
					`${formatPersonLabel(personnelById, assigneeId)} is still in cooldown until ${existingCooldownEnd}.`
				);
			} else if (newCooldownBlocks) {
				addConflict(
					check.key,
					`${formatPersonLabel(personnelById, assigneeId)} has another duty beginning at ${existingCoverage.coverageStart}, which overlaps this duty's cooldown window ending ${newCooldownEnd}.`
				);
			}
		}
	}

	return conflictsByKey;
}

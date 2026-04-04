import type { QueryPorts } from '$lib/server/core/ports';
import type { Personnel } from '$lib/types';

export interface TransientDutyCoverage {
	assigneeId: string;
	coverageStart: string;
	coverageEnd: string;
	cooldownHours: number;
}

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

export async function findDutyCoverageConflicts(
	ctx: QueryPorts,
	input: {
		assigneeIds: string[];
		coverageStart: string;
		coverageEnd: string;
		cooldownHours: number;
		personnelById: Map<string, Personnel>;
		transientCoverage?: TransientDutyCoverage[];
	}
): Promise<Map<string, string[]>> {
	const { assigneeIds, coverageStart, coverageEnd, cooldownHours, personnelById, transientCoverage = [] } = input;
	const conflictsByAssignee = new Map<string, string[]>();

	if (assigneeIds.length === 0) {
		return conflictsByAssignee;
	}

	const eventRows = await ctx.store.findMany<Record<string, unknown>>('duty_events', ctx.auth.orgId);
	if (eventRows.length > 0) {
		const eventIds = eventRows.map((row) => String(row.id));
		const slotRows = await ctx.store.findMany<Record<string, unknown>>('duty_event_slots', ctx.auth.orgId, undefined, {
			inFilters: {
				duty_event_id: eventIds,
				assignee_id: assigneeIds
			}
		});
		const eventById = new Map(eventRows.map((row) => [String(row.id), row]));
		const newCooldownEnd = addHours(coverageEnd, cooldownHours);

		for (const row of slotRows) {
			const assigneeId = String(row.assignee_id);
			const eventRow = eventById.get(String(row.duty_event_id));
			if (!eventRow) {
				continue;
			}

			const existingCoverageStart = String(eventRow.coverage_start);
			const existingCoverageEnd = String(eventRow.coverage_end);
			const existingCooldownHours = Number(eventRow.cooldown_hours ?? 0);
			const existingCooldownEnd = addHours(existingCoverageEnd, existingCooldownHours);
			const overlaps = existingCoverageStart < coverageEnd && existingCoverageEnd > coverageStart;
			const priorCooldownBlocks = existingCoverageEnd <= coverageStart && existingCooldownEnd > coverageStart;
			const newCooldownBlocks = cooldownHours > 0 && coverageEnd <= existingCoverageStart && newCooldownEnd > existingCoverageStart;

			let message: string | null = null;
			if (overlaps) {
				message = `${formatPersonLabel(personnelById, assigneeId)} is already assigned to duty coverage from ${existingCoverageStart} to ${existingCoverageEnd}.`;
			} else if (priorCooldownBlocks) {
				message = `${formatPersonLabel(personnelById, assigneeId)} is still in cooldown until ${existingCooldownEnd}.`;
			} else if (newCooldownBlocks) {
				message = `${formatPersonLabel(personnelById, assigneeId)} has another duty beginning at ${existingCoverageStart}, which overlaps this duty's cooldown window ending ${newCooldownEnd}.`;
			}

			if (!message) {
				continue;
			}

			const existingMessages = conflictsByAssignee.get(assigneeId) ?? [];
			if (!existingMessages.includes(message)) {
				existingMessages.push(message);
				conflictsByAssignee.set(assigneeId, existingMessages);
			}
		}
	}

	const newCooldownEnd = addHours(coverageEnd, cooldownHours);
	for (const existingCoverage of transientCoverage) {
		if (!assigneeIds.includes(existingCoverage.assigneeId)) {
			continue;
		}

		const assigneeId = existingCoverage.assigneeId;
		const existingCooldownEnd = addHours(existingCoverage.coverageEnd, existingCoverage.cooldownHours);
		const overlaps = existingCoverage.coverageStart < coverageEnd && existingCoverage.coverageEnd > coverageStart;
		const priorCooldownBlocks = existingCoverage.coverageEnd <= coverageStart && existingCooldownEnd > coverageStart;
		const newCooldownBlocks =
			cooldownHours > 0 &&
			coverageEnd <= existingCoverage.coverageStart &&
			newCooldownEnd > existingCoverage.coverageStart;

		let message: string | null = null;
		if (overlaps) {
			message = `${formatPersonLabel(personnelById, assigneeId)} is already assigned to duty coverage from ${existingCoverage.coverageStart} to ${existingCoverage.coverageEnd}.`;
		} else if (priorCooldownBlocks) {
			message = `${formatPersonLabel(personnelById, assigneeId)} is still in cooldown until ${existingCooldownEnd}.`;
		} else if (newCooldownBlocks) {
			message = `${formatPersonLabel(personnelById, assigneeId)} has another duty beginning at ${existingCoverage.coverageStart}, which overlaps this duty's cooldown window ending ${newCooldownEnd}.`;
		}

		if (!message) {
			continue;
		}

		const existingMessages = conflictsByAssignee.get(assigneeId) ?? [];
		if (!existingMessages.includes(message)) {
			existingMessages.push(message);
			conflictsByAssignee.set(assigneeId, existingMessages);
		}
	}

	return conflictsByAssignee;
}

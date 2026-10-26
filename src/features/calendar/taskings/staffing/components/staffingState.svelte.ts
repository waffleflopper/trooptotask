import { invalidate } from '$app/navigation';
import { rejectedRequestMessage, withinOrganizationLifetime } from '$lib/stores/core';
import { toastStore } from '$lib/stores/toast.svelte';
import { StreamedValue } from '$lib/utils/streamedValue.svelte';
import type { EventRead } from '../../../events/eventModel';
import type { Tasking } from '../../taskingModel';
import { shortPersonName, type StaffingSaveResult, type TaskingStaffing } from '../staffingModel';
import { saveStaffingRequest } from '../staffingRequests';
import { savedSelectionToast } from './staffingLabels';

/**
 * Who is picked for one Tasking, shared by the page header, the People card and the picker.
 * A save answers with the stored selection; it stands until the refreshed load arrives.
 */
export class TaskingStaffingState {
	#streamed: StreamedValue<EventRead<TaskingStaffing>>;
	#saved = $state.raw<{ staffing: TaskingStaffing; over: unknown } | null>(null);
	#alive = true;
	assigning = $state(false);
	/** People this reader added in their last save, marked until they save again or leave. */
	added = $state.raw<ReadonlySet<string>>(new Set());

	#orgId: () => string;

	constructor(people: () => Promise<EventRead<TaskingStaffing>>, orgId: () => string) {
		this.#streamed = new StreamedValue(people);
		this.#orgId = orgId;
		$effect(() => () => (this.#alive = false));
	}

	readonly current = $derived.by((): TaskingStaffing | 'failed' | null => {
		const current = this.#streamed.current;
		if (current.state !== 'ready') return current.state === 'failed' ? 'failed' : null;
		if (current.value.status !== 'loaded') return 'failed';
		return this.#saved?.over === current ? this.#saved.staffing : current.value.value;
	});

	show(result: StaffingSaveResult) {
		this.#saved = { staffing: result.staffing, over: this.#streamed.current };
		if (result.outcome !== 'unchanged') void invalidate('app:calendar-events');
	}

	/** A picker save: shows the new selection, marks who joined and offers to put the old one back. */
	saved(tasking: Tasking, before: TaskingStaffing, result: StaffingSaveResult, today: string) {
		this.show(result);
		this.assigning = false;
		if (result.outcome !== 'saved') return;
		const was = new Set(before.picks.map((pick) => pick.personnelId));
		const joined = result.staffing.picks.filter((pick) => !was.has(pick.personnelId));
		this.added = new Set(joined.map((pick) => pick.personnelId));
		const now = new Set(result.staffing.picks.map((pick) => pick.personnelId));
		const left = before.picks.filter((pick) => !now.has(pick.personnelId));
		const { title, description } = savedSelectionToast(
			result.staffing.picked,
			tasking.requirement?.count ?? null,
			joined.map(shortPersonName),
			left.map(shortPersonName),
			tasking.execution,
			today
		);
		const undo = { label: 'Undo', onClick: () => void this.#undo(tasking, before, result) };
		toastStore.success(title, 10000, undo, description);
	}

	/** Puts the earlier selection back only if nobody saved over this one since. */
	async #undo(tasking: Tasking, before: TaskingStaffing, result: StaffingSaveResult) {
		try {
			const request = saveStaffingRequest(this.#orgId(), tasking.id, {
				personnelIds: before.picks.map((pick) => pick.personnelId),
				keep: [],
				removeOutsideScope: false,
				expectedRevision: result.revision
			});
			const undone = await withinOrganizationLifetime(request, () => this.#alive);
			this.show(undone);
			this.added = new Set();
			if (undone.outcome === 'conflict')
				toastStore.error(
					'Undo did not go through',
					undefined,
					undefined,
					'Someone else changed who is picked after your save. The list now shows their changes.'
				);
			else toastStore.success('The earlier selection is back');
		} catch (error) {
			if (this.#alive)
				toastStore.error(
					'Undo did not go through',
					undefined,
					undefined,
					rejectedRequestMessage(error, 'Nothing changed. Try again in a moment.')
				);
		}
	}
}

export const isCurrentStaffing = (value: TaskingStaffing | 'failed' | null): value is TaskingStaffing =>
	typeof value === 'object' && value !== null;

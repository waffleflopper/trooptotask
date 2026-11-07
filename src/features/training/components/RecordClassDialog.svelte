<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import type { TrainingType } from '../training.types';
	import type { RecordClassCandidate, RecordClassGroupFilter, TrainingBatchRecord } from '../contracts';
	import * as Alert from '$lib/components/ui/alert';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';
	import * as NativeSelect from '$lib/components/ui/native-select';

	interface Props {
		trainingType: TrainingType;
		/** The people the class can be recorded for, each checked or not as the dialog opens. */
		candidates: readonly RecordClassCandidate[];
		/** Lets the viewer narrow the list to a Group; only the checked people in view are recorded. */
		groupFilter?: RecordClassGroupFilter;
		/** The default completion date, "YYYY-MM-DD". */
		today: string;
		/** Rejects with the message to show when the class was not recorded. */
		onSave: (records: (TrainingBatchRecord & { status: 'completed' })[]) => Promise<void>;
		onClose: () => void;
	}

	let { trainingType, candidates, groupFilter, today, onSave, onClose }: Props = $props();

	let disposed = false;
	onDestroy(() => {
		disposed = true;
	});

	const expirationDateOnly = untrack(() => trainingType.expirationDateOnly);
	const checked = new SvelteSet(
		untrack(() => candidates.filter((candidate) => candidate.checked).map((candidate) => candidate.person.id))
	);
	let groupId = $state(untrack(() => groupFilter?.initial ?? ''));
	let date = $state(expirationDateOnly ? '' : untrack(() => today));
	let isSaving = $state(false);
	let saveError = $state<string | null>(null);

	const inGroup = $derived(groupFilter && groupId ? groupFilter.personnelIdsIn(groupId) : null);
	const visible = $derived(inGroup ? candidates.filter(({ person }) => inGroup.has(person.id)) : candidates);
	const selected = $derived(visible.filter(({ person }) => checked.has(person.id)));
	const canSave = $derived(selected.length > 0 && date !== '' && !isSaving);

	function toggle(personId: string, on: boolean) {
		if (on) checked.add(personId);
		else checked.delete(personId);
	}

	async function save() {
		if (!canSave) return;
		isSaving = true;
		saveError = null;
		try {
			await onSave(
				selected.map(({ person }) => ({
					personnelId: person.id,
					trainingTypeId: trainingType.id,
					completionDate: date,
					status: 'completed'
				}))
			);
			if (!disposed) onClose();
		} catch (error) {
			if (!disposed) saveError = error instanceof Error && error.message ? error.message : 'Class was not recorded';
		} finally {
			if (!disposed) isSaving = false;
		}
	}
</script>

<AppDialog.Root busy={isSaving} {onClose}>
	<AppDialog.Content>
		<AppDialog.Header>
			<AppDialog.Title>Record class</AppDialog.Title>
			<AppDialog.Description>{trainingType.name}</AppDialog.Description>
		</AppDialog.Header>

		<AppDialog.Body>
			{#if saveError}
				<Alert.Root variant="destructive" class="mb-4">
					<Alert.Title>Class was not recorded</Alert.Title>
					<Alert.Description>{saveError}</Alert.Description>
				</Alert.Root>
			{/if}
			<fieldset class="grid min-w-0 gap-4" disabled={isSaving}>
				<Field.Root>
					<Field.Label for="record-class-date">{expirationDateOnly ? 'Expiration date' : 'Completion date'}</Field.Label
					>
					<DatePicker id="record-class-date" bind:value={date} />
					{#if expirationDateOnly}
						<Field.Description>Enter the expiration date shown on the license or certificate.</Field.Description>
					{/if}
				</Field.Root>

				{#if groupFilter}
					<Field.Root>
						<Field.Label for="record-class-group">Group</Field.Label>
						<NativeSelect.Root id="record-class-group" bind:value={groupId} class="w-full">
							{#each groupFilter.options as option (option.value)}
								<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
							{/each}
						</NativeSelect.Root>
					</Field.Root>
				{/if}

				<Field.Set class="gap-2">
					<Field.Legend variant="label">Attended ({selected.length} of {visible.length})</Field.Legend>
					<ul class="grid gap-1">
						{#each visible as { person, statusLabel } (person.id)}
							<li>
								<Field.Root orientation="horizontal" class="rounded-md px-2 py-1.5 hover:bg-muted/50">
									<Checkbox
										id="record-class-{person.id}"
										checked={checked.has(person.id)}
										onCheckedChange={(on) => toggle(person.id, on)}
									/>
									<Field.Label for="record-class-{person.id}" class="min-w-0 flex-1 font-normal">
										<span class="min-w-0 truncate"
											>{person.rank}
											{person.lastName}, {person.firstName}</span
										>
										{#if statusLabel}
											<span class="ml-auto shrink-0 text-xs text-muted-foreground">{statusLabel}</span>
										{/if}
									</Field.Label>
								</Field.Root>
							</li>
						{/each}
					</ul>
				</Field.Set>
			</fieldset>
		</AppDialog.Body>

		<AppDialog.Footer>
			<Button variant="outline" type="button" onclick={onClose} disabled={isSaving}>Cancel</Button>
			<Button type="button" onclick={save} disabled={!canSave}>
				{isSaving ? 'Saving...' : `Record ${selected.length}`}
			</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

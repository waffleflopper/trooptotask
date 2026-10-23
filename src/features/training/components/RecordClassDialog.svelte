<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import type { Personnel } from '$features/personnel/contracts';
	import type { TrainingType } from '../training.types';
	import type { TrainingBatchRecord } from '../contracts';
	import * as Alert from '$lib/components/ui/alert';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';

	interface Props {
		trainingType: TrainingType;
		/** The people to record, all checked when the dialog opens. */
		people: readonly Personnel[];
		/** The default completion date, "YYYY-MM-DD". */
		today: string;
		/** Rejects with the message to show when the class was not recorded. */
		onSave: (records: TrainingBatchRecord[]) => Promise<void>;
		onClose: () => void;
	}

	let { trainingType, people, today, onSave, onClose }: Props = $props();

	let disposed = false;
	onDestroy(() => {
		disposed = true;
	});

	const expirationDateOnly = untrack(() => trainingType.expirationDateOnly);
	const checked = new SvelteSet(untrack(() => people.map((person) => person.id)));
	let date = $state(expirationDateOnly ? '' : untrack(() => today));
	let isSaving = $state(false);
	let saveError = $state<string | null>(null);

	const selected = $derived(people.filter((person) => checked.has(person.id)));
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
				selected.map((person) => ({
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

				<Field.Set class="gap-2">
					<Field.Legend variant="label">Attended ({selected.length} of {people.length})</Field.Legend>
					<ul class="grid gap-1">
						{#each people as person (person.id)}
							<li>
								<Field.Root orientation="horizontal" class="rounded-md px-2 py-1.5 hover:bg-muted/50">
									<Checkbox
										id="record-class-{person.id}"
										checked={checked.has(person.id)}
										onCheckedChange={(on) => toggle(person.id, on)}
									/>
									<Field.Label for="record-class-{person.id}" class="font-normal">
										{person.rank}
										{person.lastName}, {person.firstName}
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

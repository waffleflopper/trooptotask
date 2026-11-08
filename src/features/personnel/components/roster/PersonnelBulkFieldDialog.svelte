<script lang="ts">
	import * as Alert from '$lib/components/ui/alert';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import * as Combobox from '$lib/components/ui/combobox';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { stillInOrganizationLifetime, withinOrganizationLifetime } from '$lib/stores/core';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { PendingSave } from '$lib/utils/pendingSave.svelte';
	import { bulkFieldValueOf, displayBulkFieldValue, reviewBulkField } from '../../bulkFieldReview';
	import type { PersonnelPageContext } from '../../contexts/PersonnelPageContext.svelte';
	import {
		BULK_FIELDS,
		BULK_FIELD_KEYS,
		type BulkField,
		type PersonnelFieldBatchResult,
		type PersonnelFieldOutcome
	} from '../../contracts';
	import type { Personnel } from '../../personnel.types';
	import { rankOptionsFor } from '../../personnelDraft';
	import { personnelStore } from '../../stores/personnel.svelte';
	import { setPersonnelField } from '../../utils/setPersonnelField';

	interface Props {
		ctx: PersonnelPageContext;
		/** The selected People the actor can edit. */
		people: readonly Personnel[];
		/** Selected People the actor cannot edit. */
		skipped: number;
		isCurrent: (orgId: string) => boolean;
		onclose: () => void;
	}

	let { ctx, people, skipped, isCurrent: rosterIsCurrent, onclose }: Props = $props();

	const count = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;
	const OUTCOME_LABELS: Record<PersonnelFieldOutcome, string> = {
		updated: 'Saved',
		refused: 'Not allowed',
		unavailable: 'No longer available',
		failed: 'Not confirmed'
	};

	let field = $state<BulkField>('rank');
	let value = $state('');
	let error = $state('');
	let outcome = $state.raw<PersonnelFieldBatchResult | null>(null);
	const saving = new PendingSave();

	const definition = $derived(BULK_FIELDS[field]);
	const wanted = $derived(value.trim());
	const rankOptions = $derived(rankOptionsFor(ctx.data.rankCatalog ?? []));
	const review = $derived(wanted ? reviewBulkField(people, field, wanted) : null);
	const names = $derived(
		new Map(people.map((person) => [person.id, `${person.rank} ${person.lastName}, ${person.firstName}`]))
	);
	const problems = $derived((outcome?.results ?? []).filter((result) => result.outcome !== 'updated'));

	function pickField(next: string | undefined): void {
		if (!next || next === field) return;
		field = next as BulkField;
		value = '';
		error = '';
	}

	function applySaved(result: PersonnelFieldBatchResult, previous: ReadonlyMap<string, string>): Set<string> {
		const saved = new Set(result.results.filter((entry) => entry.outcome === 'updated').map((entry) => entry.id));
		personnelStore.updateLocalWhere(
			(person) => saved.has(person.id),
			(person) => ({ ...person, [result.field]: result.value })
		);
		for (const id of saved) {
			ctx.peek.changed(id, { [result.field]: previous.get(id) }, { [result.field]: result.value });
		}
		if (saved.size) void ctx.signals.refresh([...saved]);
		return saved;
	}

	const save = () =>
		saving.run(async () => {
			if (!review || review.changes.length === 0) return;
			const orgId = ctx.orgId;
			const sent = { field, value: wanted };
			const ids = review.changes.map((change) => change.id);
			const previous = new Map(people.map((person) => [person.id, bulkFieldValueOf(person, sent.field)]));
			const unchanged = review.unchanged;
			const inLifetime = stillInOrganizationLifetime();
			const isCurrent = () => inLifetime() && rosterIsCurrent(orgId);
			error = '';
			try {
				const result = await withinOrganizationLifetime(
					setPersonnelField(orgId, ids, sent.field, sent.value),
					isCurrent
				);
				const saved = applySaved(result, previous);
				const label = BULK_FIELDS[result.field].label;
				const notes = [
					unchanged > 0 ? `${count(unchanged)} already had it` : '',
					skipped > 0 ? `${count(skipped)} skipped` : ''
				].filter(Boolean);
				const tail = notes.length ? ` · ${notes.join(' · ')}` : '';
				if (saved.size === result.results.length) {
					toastStore.success(
						`Set ${label} to ${displayBulkFieldValue(result.field, result.value)} for ${count(saved.size)}${tail}`
					);
					onclose();
					return;
				}
				outcome = result;
				const counts = (['refused', 'unavailable', 'failed'] as const)
					.map((kind) => [kind, result.results.filter((entry) => entry.outcome === kind).length] as const)
					.filter(([, n]) => n > 0)
					.map(([kind, n]) => `${n} ${kind === 'unavailable' ? 'no longer available' : kind}`);
				toastStore.warning(`${saved.size} saved · ${counts.join(' · ')}`);
			} catch (caught) {
				if (isCurrent()) error = caught instanceof Error ? caught.message : 'Unable to set the field.';
			}
		});
</script>

<AppDialog.Root open busy={saving.pending} onClose={onclose}>
	<AppDialog.Content>
		<AppDialog.Header>
			<AppDialog.Title>Set field</AppDialog.Title>
			<AppDialog.Description>
				Set one field for the {count(people.length)} you can edit. You review each change before it saves.
			</AppDialog.Description>
		</AppDialog.Header>
		<AppDialog.Body class="grid content-start gap-4">
			{#if outcome}
				<p class="text-sm" role="status">
					Saved {count(outcome.results.length - problems.length)}. {count(problems.length)}
					did not save.
				</p>
				<ul class="max-h-64 divide-y overflow-y-auto rounded-md border text-sm" aria-label="People that did not save">
					{#each problems as problem (problem.id)}
						<li class="grid gap-0.5 px-3 py-2">
							<span class="font-medium break-words">{names.get(problem.id) ?? problem.id}</span>
							<span class="text-muted-foreground">
								{OUTCOME_LABELS[problem.outcome]}{problem.message ? `: ${problem.message}` : ''}
							</span>
						</li>
					{/each}
				</ul>
			{:else}
				<fieldset class="contents" disabled={saving.pending}>
					<Field.Root>
						<Field.Label>Field</Field.Label>
						<ToggleGroup.Root type="single" size="sm" aria-label="Field to set" bind:value={() => field, pickField}>
							{#each BULK_FIELD_KEYS as key (key)}
								<ToggleGroup.Item value={key}>{BULK_FIELDS[key].label}</ToggleGroup.Item>
							{/each}
						</ToggleGroup.Root>
					</Field.Root>
					<Field.Root>
						<Field.Label for="bulk-field-value">New {definition.label}</Field.Label>
						{#key field}
							{#if definition.input === 'catalog'}
								<Combobox.Root items={rankOptions} bind:value label={definition.label} autoHighlight>
									<Combobox.Trigger id="bulk-field-value" placeholder="Select rank..." aria-label={definition.label} />
									<Combobox.Content>
										<Combobox.Search placeholder="Select rank..." />
										<Combobox.Empty>No ranks found.</Combobox.Empty>
										<Combobox.List />
									</Combobox.Content>
								</Combobox.Root>
							{:else if definition.input === 'date'}
								<DatePicker id="bulk-field-value" bind:value placeholder="Select date" />
							{:else}
								<Input id="bulk-field-value" bind:value />
							{/if}
						{/key}
						{#if definition.input === 'catalog'}
							<Field.Description>Ranks come from the Organization rank catalog.</Field.Description>
						{/if}
					</Field.Root>
				</fieldset>

				{#if review}
					<section aria-labelledby="bulk-field-review" class="grid gap-1.5">
						<h3
							id="bulk-field-review"
							class="font-mono text-[10px] font-semibold tracking-widest text-muted-foreground uppercase"
						>
							Changes ({review.changes.length})
						</h3>
						{#if review.changes.length > 0}
							<ul class="max-h-56 divide-y overflow-y-auto rounded-md border text-sm">
								{#each review.changes as change (change.id)}
									<li class="grid gap-0.5 px-3 py-2">
										<span class="font-medium break-words">{change.name}</span>
										<span class="text-muted-foreground break-words">{change.from} → {change.to}</span>
									</li>
								{/each}
							</ul>
						{:else}
							<p class="text-sm text-muted-foreground">Everyone you can edit already has this {definition.label}.</p>
						{/if}
						{#if review.unchanged > 0 && review.changes.length > 0}
							<p class="text-sm text-muted-foreground">
								{count(review.unchanged)} already have it and will not change.
							</p>
						{/if}
					</section>
				{/if}
				{#if skipped > 0}
					<p class="text-sm text-muted-foreground">{count(skipped)} you cannot edit will be skipped.</p>
				{/if}
				{#if error}
					<Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
				{/if}
			{/if}
		</AppDialog.Body>
		<AppDialog.Footer>
			{#if outcome}
				<Button onclick={onclose}>Close</Button>
			{:else}
				<Button variant="outline" onclick={onclose} disabled={saving.pending}>Cancel</Button>
				<Button onclick={save} disabled={!review || review.changes.length === 0 || saving.pending}>
					{#if saving.pending}<Spinner />{/if}
					Set {definition.label}{review && review.changes.length > 0 ? ` for ${count(review.changes.length)}` : ''}
				</Button>
			{/if}
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

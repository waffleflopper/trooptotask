<script lang="ts">
	import { onDestroy, type Snippet } from 'svelte';
	import type { Personnel } from '$features/personnel/contracts';
	import * as Alert from '$lib/components/ui/alert';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import * as Combobox from '$lib/components/ui/combobox';
	import * as Field from '$lib/components/ui/field';
	import { Spinner } from '$lib/components/ui/spinner';
	import { rejectedRequestMessage } from '$lib/stores/core';

	interface Props {
		title: string;
		description: string;
		/** Only the people the viewer may act on. */
		people: readonly Personnel[];
		/** False while the extra fields are incomplete or do not apply to this person. */
		ready?: (person: Personnel) => boolean;
		/** Shown when continuing fails without a reason of its own. */
		failureMessage: string;
		onContinue: (person: Personnel) => void | Promise<void>;
		onClose: () => void;
		/** Extra fields, disabled while continuing. */
		children?: Snippet<[{ busy: boolean; person: Personnel | undefined }]>;
	}

	let {
		title,
		description,
		people,
		ready = () => true,
		failureMessage,
		onContinue,
		onClose,
		children
	}: Props = $props();

	let personId = $state('');
	let busy = $state(false);
	let error = $state<string | null>(null);
	let active = true;
	onDestroy(() => {
		active = false;
	});

	const options = $derived(
		[...people]
			.sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
			.map((person) => ({ value: person.id, label: `${person.rank} ${person.lastName}, ${person.firstName}` }))
	);
	const person = $derived(people.find((candidate) => candidate.id === personId));
	const canContinue = $derived(person !== undefined && ready(person) && !busy);

	async function handleContinue() {
		if (!person || !canContinue) return;
		busy = true;
		error = null;
		try {
			await onContinue(person);
		} catch (failure) {
			if (active) error = rejectedRequestMessage(failure, failureMessage);
		} finally {
			if (active) busy = false;
		}
	}
</script>

<AppDialog.Root {busy} {onClose}>
	<AppDialog.Content>
		<AppDialog.Header>
			<AppDialog.Title>{title}</AppDialog.Title>
			<AppDialog.Description>{description}</AppDialog.Description>
		</AppDialog.Header>

		<AppDialog.Body>
			<div class="grid gap-4">
				{#if error}
					<Alert.Root variant="destructive">
						<Alert.Title>Could not continue</Alert.Title>
						<Alert.Description>{error}</Alert.Description>
					</Alert.Root>
				{/if}
				<Field.Root>
					<Field.Label for="quick-add-person">Person</Field.Label>
					<Combobox.Root items={options} bind:value={personId} label="Person" autoHighlight disabled={busy}>
						<Combobox.Trigger id="quick-add-person" placeholder="Search for a person..." aria-label="Person" />
						<Combobox.Content>
							<Combobox.Search placeholder="Search for a person..." />
							<Combobox.Empty>No matches</Combobox.Empty>
							<Combobox.List />
						</Combobox.Content>
					</Combobox.Root>
				</Field.Root>
				{@render children?.({ busy, person })}
			</div>
		</AppDialog.Body>

		<AppDialog.Footer>
			<Button variant="outline" type="button" onclick={onClose} disabled={busy}>Cancel</Button>
			<Button type="button" onclick={handleContinue} disabled={!canContinue}>
				{#if busy}<Spinner />{/if}
				Continue
			</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { redirectToSensitiveActionStepUp } from '$features/identity';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as NativeSelect from '$lib/components/ui/native-select/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { settleAction } from '$lib/utils/settleAction';
	import type { SettingsMemberRow } from './memberSettingsTypes';

	type Props = {
		member: SettingsMemberRow;
		ranks: readonly string[];
		/** Owners and admins only. The server refuses anyone else whatever this says. */
		canEdit: boolean;
		/** The server's answer to the last name save, shown only for the member it was about. */
		nameError: string | undefined;
		/** Another request in the sheet is running. */
		blocked: boolean;
		/** True while the name request is in flight, so the sheet cannot close under it. */
		saving: boolean;
	};

	let { member, ranks, canEdit, nameError, blocked, saving = $bindable(false) }: Props = $props();

	let active = true;
	onDestroy(() => {
		active = false;
	});

	const name = $derived(member.name);
	/** The member's own account name outranks one an admin gives, so there is nothing here to edit. */
	const fromAccount = $derived(name?.source === 'account');

	let editing = $state(false);
	let rank = $state('');
	let firstName = $state('');
	let lastName = $state('');
	let requestError = $state<string | null>(null);
	let errorMemberId = $state<string | null>(null);
	let editButton = $state<HTMLButtonElement | null>(null);
	let rankSelect = $state<HTMLSelectElement | null>(null);
	const shownError = $derived(requestError ?? (errorMemberId === member.id ? nameError : undefined));

	function open() {
		rank = name?.rank ?? '';
		firstName = name?.firstName ?? '';
		lastName = name?.lastName ?? '';
		requestError = null;
		errorMemberId = null;
		editing = true;
		void tick().then(() => rankSelect?.focus());
	}

	function cancel() {
		editing = false;
		requestError = null;
		errorMemberId = null;
		void tick().then(() => editButton?.focus());
	}
</script>

<section class="grid gap-2 border-b px-5 py-4.5 sm:px-8" aria-label="Name">
	<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
		<h3 class="flex-1 font-heading text-lg leading-[22px] font-semibold">Name</h3>
		{#if canEdit && !fromAccount && !editing}
			<Button bind:ref={editButton} type="button" variant="outline" size="sm" disabled={blocked} onclick={open}>
				{name ? 'Edit' : 'Add'} <span class="sr-only">name and rank</span>
			</Button>
		{/if}
	</div>

	{#if editing}
		<form
			method="POST"
			action="?/setMemberName"
			class="grid gap-3"
			use:enhance={({ cancel: abort }) => {
				if (saving || blocked) return abort();
				const memberId = member.id;
				saving = true;
				errorMemberId = memberId;
				requestError = null;
				return async (outcome) => {
					const { result } = outcome;
					if (active && result.type === 'failure' && redirectToSensitiveActionStepUp(result.data)) {
						saving = false;
						return;
					}
					await settleAction(outcome, {
						// A response for a member the sheet has since left changes nothing here.
						isCurrent: () => active && member.id === memberId,
						settled: (error) => {
							requestError = error;
							saving = false;
							if (!error && result.type === 'success') editing = false;
						},
						focus: () => [editing ? rankSelect : editButton],
						reset: false
					});
					// The sheet moved to another member (or closed) while this was in flight.
					if (!active || member.id !== memberId) saving = false;
				};
			}}
		>
			<input type="hidden" name="membershipId" value={member.id} />
			<fieldset class="contents" disabled={saving}>
				<div class="flex flex-wrap items-start gap-3">
					<Field.Root class="w-26 gap-1.5">
						<Field.Label for="member-name-rank">Rank</Field.Label>
						<div class="font-mono font-medium">
							<NativeSelect.Root bind:ref={rankSelect} bind:value={rank} id="member-name-rank" name="rank" required>
								<NativeSelect.Option value="">Rank</NativeSelect.Option>
								{#each ranks as option (option)}
									<NativeSelect.Option value={option}>{option}</NativeSelect.Option>
								{/each}
							</NativeSelect.Root>
						</div>
					</Field.Root>
					<Field.Root class="min-w-36 flex-1 gap-1.5">
						<Field.Label for="member-name-first">First name</Field.Label>
						<Input id="member-name-first" name="firstName" required maxlength={80} bind:value={firstName} />
					</Field.Root>
					<Field.Root class="min-w-36 flex-1 gap-1.5">
						<Field.Label for="member-name-last">Last name</Field.Label>
						<Input id="member-name-last" name="lastName" required maxlength={80} bind:value={lastName} />
					</Field.Root>
				</div>
				{#if shownError}
					<Alert.Root variant="destructive">
						<Alert.Title>Name not saved</Alert.Title>
						<Alert.Description>{shownError}</Alert.Description>
					</Alert.Root>
				{/if}
				<div class="flex flex-wrap justify-end gap-2">
					<Button type="button" variant="outline" onclick={cancel}>Cancel</Button>
					<Button type="submit" aria-busy={saving || undefined}>
						{#if saving}<Spinner />{/if}
						{saving ? 'Saving...' : 'Save name'}
					</Button>
				</div>
			</fieldset>
		</form>
	{:else if name}
		<p class="font-heading text-lg font-semibold wrap-anywhere" data-member-name>{name.text}</p>
		<p class="text-sm text-muted-foreground">
			{#if fromAccount}
				This is the name on their account. They change it in their own account settings.
			{:else}
				Shown only in this unit. If they add a name to their own account, that name is used instead.
			{/if}
		</p>
	{:else}
		<p class="text-sm text-muted-foreground">
			{canEdit
				? 'No name yet. Add one so people see who this is, not just an email. It shows only in this unit.'
				: 'No name yet.'}
		</p>
	{/if}
</section>

<script lang="ts">
	import { tick } from 'svelte';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as NativeSelect from '$lib/components/ui/native-select/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import * as PageShell from '$lib/components/patterns/page-shell/index.js';
	import { accountLabel } from './accountLabel';
	import { ACCOUNT_PAGES } from './AccountShell.svelte';
	import { ACCOUNT_FIELD_LABEL } from './accountFields';
	import type { SignedInAccount } from './contracts';

	type MembershipRole = 'owner' | 'admin' | 'member';

	let {
		account,
		ranks,
		form,
		securityHref,
		unit,
		onretry,
		onleave
	}: {
		account: SignedInAccount;
		ranks: readonly string[];
		form: { error?: string; success?: string } | null;
		securityHref: `/org/${string}/account/security`;
		unit: { name: string; role: MembershipRole };
		onretry: () => void;
		/** Absent for an owner, who must transfer the unit before leaving it. */
		onleave?: () => void;
	} = $props();

	const ROLE_LABELS: Record<MembershipRole, string> = { owner: 'Owner', admin: 'Admin', member: 'Member' };

	const profile = $derived(account.profile.status === 'loaded' ? account.profile.profile : null);
	const hasName = $derived(Boolean(profile?.firstName || profile?.lastName));
	let editing = $state(false);
	let saving = $state(false);
	let rank = $state('');
	let firstName = $state('');
	let lastName = $state('');
	let rankError = $state<string>();
	let editButton = $state<HTMLButtonElement | null>(null);
	let rankSelect = $state<HTMLSelectElement | null>(null);

	async function focusAfterRender(target: () => HTMLElement | null) {
		await tick();
		target()?.focus();
	}

	function openEditor() {
		rank = profile?.rank ?? '';
		firstName = profile?.firstName ?? '';
		lastName = profile?.lastName ?? '';
		rankError = undefined;
		form = null;
		editing = true;
		void focusAfterRender(() => rankSelect);
	}

	function closeEditor() {
		editing = false;
		rankError = undefined;
		form = null;
		void focusAfterRender(() => editButton);
	}
</script>

<div class="grid gap-7">
	<PageShell.Header
		eyebrow="Account · Only you"
		title={ACCOUNT_PAGES.profile.label}
		variant="display"
		subtitle={ACCOUNT_PAGES.profile.subtitle}
	/>

	<PageShell.FactSection>
		<PageShell.FactRow
			variant="display"
			stackBelow="xl"
			label="Name and rank"
			description="How your login is labeled. Changing it here doesn't rename you on any unit's roster."
		>
			{#if account.profile.status === 'unavailable'}
				<Alert.Root variant="destructive">
					<Alert.Title>Your name could not be loaded</Alert.Title>
					<Alert.Description>
						<Button type="button" variant="outline" size="sm" onclick={onretry}>Retry</Button>
					</Alert.Description>
				</Alert.Root>
			{:else if editing}
				<form
					method="POST"
					class="grid gap-3"
					use:enhance={({ formData, cancel }) => {
						if (saving) return cancel();
						if (String(formData.get('rank') ?? '') === '') {
							rankError = 'Select a rank.';
							void focusAfterRender(() => rankSelect);
							return cancel();
						}
						rankError = undefined;
						saving = true;
						return async ({ result, update }) => {
							try {
								// The shell reload carries the saved name to the sidebar; a failure keeps the draft.
								await update({ reset: false });
							} finally {
								saving = false;
							}
							if (result.type === 'success') {
								editing = false;
								void focusAfterRender(() => editButton);
							} else {
								void focusAfterRender(() => rankSelect);
							}
						};
					}}
				>
					<fieldset class="contents" disabled={saving}>
						<div class="flex flex-wrap items-start gap-3">
							<Field.Root class="w-26 gap-1.5" data-invalid={rankError ? true : undefined}>
								<Field.Label for="rank" class={ACCOUNT_FIELD_LABEL}>Rank</Field.Label>
								<div class="font-mono font-medium">
									<NativeSelect.Root
										bind:ref={rankSelect}
										bind:value={rank}
										id="rank"
										name="rank"
										aria-required="true"
										aria-invalid={rankError ? true : undefined}
										aria-describedby={rankError ? 'rank-error' : 'rank-hint'}
										onchange={() => (rankError = undefined)}
									>
										<NativeSelect.Option value="">Rank</NativeSelect.Option>
										{#each ranks as option (option)}
											<NativeSelect.Option value={option}>{option}</NativeSelect.Option>
										{/each}
									</NativeSelect.Root>
								</div>
							</Field.Root>
							<Field.Root class="min-w-36 flex-1 gap-1.5">
								<Field.Label for="firstName" class={ACCOUNT_FIELD_LABEL}>First name</Field.Label>
								<Input id="firstName" name="firstName" required maxlength={80} bind:value={firstName} />
							</Field.Root>
							<Field.Root class="min-w-36 flex-1 gap-1.5">
								<Field.Label for="lastName" class={ACCOUNT_FIELD_LABEL}>Last name</Field.Label>
								<Input id="lastName" name="lastName" required maxlength={80} bind:value={lastName} />
							</Field.Root>
						</div>
						{#if rankError}
							<p id="rank-error" role="alert" class="text-xs text-destructive">{rankError}</p>
						{:else}
							<p id="rank-hint" class="font-mono text-xs text-muted-foreground">From the Army rank list</p>
						{/if}
						{#if form?.error}
							<Alert.Root variant="destructive">
								<Alert.Title>Profile not saved</Alert.Title>
								<Alert.Description>{form.error}</Alert.Description>
							</Alert.Root>
						{/if}
						<div class="flex flex-wrap justify-end gap-2">
							<Button type="button" variant="outline" onclick={closeEditor}>Cancel</Button>
							<Button type="submit" aria-busy={saving || undefined}>
								{#if saving}<Spinner />{/if}
								{saving ? 'Saving...' : 'Save'}
							</Button>
						</div>
					</fieldset>
				</form>
			{:else}
				<div class="flex items-center gap-4">
					<p
						class="min-w-0 flex-1 font-heading text-[28px] leading-8 font-bold wrap-anywhere {hasName
							? ''
							: 'text-muted-foreground'}"
					>
						{hasName ? accountLabel(account).name : 'No name yet'}
					</p>
					<Button bind:ref={editButton} type="button" variant="outline" onclick={openEditor}>
						{hasName ? 'Edit' : 'Add'} <span class="sr-only">name and rank</span>
					</Button>
				</div>
				{#if form?.success}
					<p role="status" class="text-sm text-muted-foreground">Profile updated.</p>
				{/if}
			{/if}
		</PageShell.FactRow>

		<PageShell.FactRow
			variant="display"
			stackBelow="xl"
			label="Email"
			description="You sign in with it, and password resets go there."
		>
			<div class="flex min-w-0 flex-col gap-x-6 gap-y-1 xl:flex-row xl:items-baseline xl:justify-between">
				<p class="min-w-0 truncate text-[17px] font-semibold" title={account.email ?? undefined}>
					{account.email ?? 'Not available'}
				</p>
				<a
					href={resolve(securityHref)}
					class="inline-flex w-fit shrink-0 items-center gap-1 text-sm text-accent-text underline-offset-4 hover:underline"
				>
					Change in Sign-in &amp; security <ArrowRight class="size-3.5" aria-hidden="true" />
				</a>
			</div>
		</PageShell.FactRow>

		<PageShell.FactRow
			variant="display"
			stackBelow="xl"
			label="Personnel records"
			description="Each unit keeps its own record of you. Its admins set rank, section and dates there."
		>
			<p class="font-mono text-xs leading-5 text-muted-foreground">
				{unit.name} · {ROLE_LABELS[unit.role]} · kept by unit admins
			</p>
			{#if onleave}
				<Button type="button" variant="ghost-destructive" size="sm" class="w-fit" onclick={onleave}>Leave unit</Button>
			{/if}
		</PageShell.FactRow>
	</PageShell.FactSection>
</div>

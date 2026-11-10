<script lang="ts">
	import { TreeSelect } from '$lib/components/patterns/tree-select';
	import type { SubmitFunction } from '$app/forms';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { MAX_INVITES_PER_SUBMISSION, parseInviteAddresses, type InviteAddressResult } from './inviteAddresses';
	import {
		CHANGE_LABELS,
		SETTINGS_ACCESS_OPTIONS,
		SETTINGS_GOVERNANCE_ROLE_OPTIONS,
		type EditableMembershipRole,
		type EditablePreset
	} from './settingsMemberAccessConstants';
	import {
		ALL_GROUPS,
		presetHelper,
		presetLabel,
		roleHelper,
		type SettingsMemberAccessWorkspace
	} from './settingsMemberAccessWorkspace.svelte';

	/** The invitation strip Settings › Members and Organization setup share. The caller owns the request's state. */
	type Props = {
		workspace: SettingsMemberAccessWorkspace;
		isOwner: boolean;
		/** The Members page action that creates the invitation. Another route may post to it by full path. */
		action?: string;
		submit: SubmitFunction;
		pending: boolean;
		loading: boolean;
		error?: string | null;
		confirmed: boolean;
		message?: string;
		/** Each address's outcome from the last submission, shown while `confirmed`. */
		results?: readonly InviteAddressResult[];
		emailsInput?: HTMLTextAreaElement | null;
		idPrefix?: string;
	};

	let {
		workspace,
		isOwner,
		action = '?/invite',
		submit,
		pending,
		loading,
		error = null,
		confirmed,
		message,
		results = [],
		emailsInput = $bindable(null),
		idPrefix = 'invite'
	}: Props = $props();

	const helper = $derived(
		workspace.invite.role === 'admin'
			? roleHelper('admin')
			: [
					presetHelper(workspace.invite.preset),
					workspace.invite.groupIds.length > 0 && workspace.scopeTree.summary(workspace.invite.groupIds),
					'They accept the invite after signing in.'
				]
					.filter(Boolean)
					.join(' ')
	);
	const groupOptions = $derived([{ id: ALL_GROUPS, label: 'Whole unit', depth: 0 }, ...workspace.scopeTree.options]);
	const addressCount = $derived(parseInviteAddresses(workspace.invite.emails).length);
	const overLimit = $derived(addressCount > MAX_INVITES_PER_SUBMISSION);
	// One address answers in the helper's line; several list their outcomes below it.
	const shownResults = $derived(confirmed && results.length > 1 ? results : []);
	const soleFailure = $derived(confirmed && results.length === 1 && results[0].status === 'failed' ? results[0] : null);
	const retryLeft = $derived(shownResults.some((result) => result.status === 'failed'));

	const send: SubmitFunction = (input) => {
		if (overLimit) return input.cancel();
		return submit(input);
	};

	function submitOnModifiedEnter(event: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) {
		if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return;
		event.preventDefault();
		event.currentTarget.form?.requestSubmit();
	}
</script>

<section aria-label="Invite members">
	<!-- eslint-disable-next-line local/require-settled-enhance -- each caller builds `submit` with settleAction -->
	<form {action} method="POST" class="grid gap-2.5 rounded-sm border bg-muted p-3.5" use:enhance={send}>
		<input type="hidden" name="membershipRole" value={workspace.invite.role} />
		{#if workspace.invite.role === 'member'}
			<input type="hidden" name="memberPreset" value={workspace.invite.preset} />
			<input
				type="hidden"
				name="scopeSetKind"
				value={workspace.invite.groupIds.length > 0 ? 'groups' : 'organization'}
			/>
			{#each workspace.invite.groupIds as groupId (groupId)}
				<input type="hidden" name="scopeSetGroupIds" value={groupId} />
			{/each}
		{/if}
		<div class="grid gap-1.5 sm:grid-cols-[3.5rem_1fr] sm:gap-2">
			<Label for="{idPrefix}-emails" class="font-semibold sm:pt-2">Invite</Label>
			<Textarea
				bind:ref={emailsInput}
				id="{idPrefix}-emails"
				name="emails"
				rows={2}
				autocomplete="off"
				spellcheck={false}
				placeholder="name@unit.mil, one per line or separated by commas"
				class="max-h-48 min-h-10 bg-background"
				aria-describedby="{idPrefix}-helper"
				aria-invalid={overLimit || undefined}
				onkeydown={submitOnModifiedEnter}
				bind:value={workspace.invite.emails}
				readonly={pending}
				required
			/>
		</div>
		<div class="flex flex-wrap items-center gap-2 sm:pl-16">
			{#if isOwner}
				<Select.Root
					type="single"
					disabled={pending}
					bind:value={() => workspace.invite.role, (role: EditableMembershipRole) => (workspace.invite.role = role)}
				>
					<Select.Trigger aria-label="Role" class="w-28 bg-background">
						{workspace.invite.role === 'admin' ? 'Admin' : 'Member'}
					</Select.Trigger>
					<Select.Content>
						{#each SETTINGS_GOVERNANCE_ROLE_OPTIONS as option (option.value)}
							<Select.Item value={option.value} label={option.label} />
						{/each}
					</Select.Content>
				</Select.Root>
			{/if}
			{#if workspace.invite.role === 'member'}
				<Select.Root
					type="single"
					disabled={pending}
					bind:value={() => workspace.invite.preset, (preset: EditablePreset) => (workspace.invite.preset = preset)}
				>
					<Select.Trigger aria-label="Preset" class="w-28 bg-background">
						{presetLabel(workspace.invite.preset)}
					</Select.Trigger>
					<Select.Content>
						{#each SETTINGS_ACCESS_OPTIONS as option (option.value)}
							<Select.Item value={option.value} label={option.label} />
						{/each}
					</Select.Content>
				</Select.Root>
				<TreeSelect
					multiple
					label="Groups"
					hideLabel
					placeholder="Whole unit"
					searchPlaceholder="Search Groups"
					value={workspace.inviteGroupsValue}
					valueLabel={workspace.inviteGroupsLabel}
					options={groupOptions}
					onValueChange={(values: string[]) => workspace.setInviteGroups(values)}
					disabled={pending}
					class="h-8 w-40 justify-between max-sm:w-full"
				/>
			{:else}
				<p class="flex h-8 w-62 items-center rounded-lg border bg-background px-2.5 text-sm text-muted-foreground">
					Uses Admin authority
				</p>
			{/if}
			<!-- aria-disabled keeps focus on the pressed button while an invitation request is pending. -->
			<Button type="submit" aria-disabled={pending || overLimit ? 'true' : undefined} aria-busy={loading || undefined}>
				{#if loading}
					Sending{addressCount > 1 ? ` ${addressCount} invites` : ''}...
				{:else}
					{addressCount > 1 ? `Send ${addressCount} invites` : 'Send invite'}
				{/if}
			</Button>
		</div>
		<!-- The outcome takes the helper's line so the strip keeps its height. -->
		{#if overLimit}
			<p id="{idPrefix}-helper" role="alert" class="text-sm text-destructive-text sm:pl-16">
				That's {addressCount} addresses. Send up to {MAX_INVITES_PER_SUBMISSION} at a time.
			</p>
		{:else if error || soleFailure}
			<p id="{idPrefix}-helper" role="alert" class="text-sm text-destructive-text sm:pl-16">
				{error ?? `${soleFailure?.email}: ${soleFailure?.message}`}
			</p>
		{:else if confirmed}
			<p id="{idPrefix}-helper" role="status" class="text-sm sm:pl-16">
				{message ?? 'Invitation created.'}
				{#if retryLeft}
					The addresses that weren't invited are still in the box.
				{/if}
			</p>
		{:else}
			<p id="{idPrefix}-helper" class="text-sm text-muted-foreground sm:pl-16">{helper}</p>
		{/if}
		{#if shownResults.length > 0}
			<ul aria-label="Invitation results" class="grid gap-1 text-sm sm:pl-16">
				{#each shownResults as result (result.email)}
					<li class="flex flex-wrap gap-x-2">
						<span class="font-medium break-all">{result.email}</span>
						<span class={result.status === 'failed' ? 'text-destructive-text' : 'text-muted-foreground'}>
							{result.message}
						</span>
					</li>
				{/each}
			</ul>
		{/if}
		{#if workspace.invite.role === 'member'}
			<div class="sm:pl-16">
				<Table.Root class="max-w-sm bg-background text-[13px]">
					<Table.Caption class="mt-1.5 text-left text-xs">
						What {presetLabel(workspace.invite.preset)} allows{workspace.invite.groupIds.length > 0
							? ' in the chosen Groups'
							: ''}
					</Table.Caption>
					<Table.Header>
						<Table.Row>
							<Table.Head class="h-7">Area</Table.Head>
							<Table.Head class="h-7">View</Table.Head>
							<Table.Head class="h-7">Change</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each workspace.invitePresetAccess as area (area.id)}
							<Table.Row>
								<Table.Cell class="py-1">{area.label}</Table.Cell>
								<Table.Cell class="py-1">{area.level === 'none' ? 'No' : 'Yes'}</Table.Cell>
								<Table.Cell class="py-1 {area.level === 'none' || area.level === 'view' ? 'text-muted-foreground' : ''}"
									>{CHANGE_LABELS[area.level]}</Table.Cell
								>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
		{/if}
	</form>
</section>

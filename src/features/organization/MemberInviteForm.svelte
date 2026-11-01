<script lang="ts">
	import { TreeSelect } from '$lib/components/patterns/tree-select';
	import type { SubmitFunction } from '$app/forms';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import {
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
		emailInput?: HTMLInputElement | null;
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
		emailInput = $bindable(null),
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
</script>

<section aria-label="Invite a member">
	<form {action} method="POST" class="grid gap-2.5 rounded-sm border bg-muted p-3.5" use:enhance={submit}>
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
		<div class="flex flex-wrap items-center gap-2">
			<Label for="{idPrefix}-email" class="w-14 shrink-0 font-semibold">Invite</Label>
			<Input
				bind:ref={emailInput}
				id="{idPrefix}-email"
				name="email"
				type="email"
				placeholder="name@unit.mil"
				class="min-w-48 flex-1 bg-background"
				aria-describedby="{idPrefix}-helper"
				bind:value={workspace.invite.email}
				required
			/>
			{#if isOwner}
				<Select.Root
					type="single"
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
					class="h-8 w-40 justify-between max-sm:w-full"
				/>
			{:else}
				<p class="flex h-8 w-62 items-center rounded-lg border bg-background px-2.5 text-sm text-muted-foreground">
					Uses Admin authority
				</p>
			{/if}
			<!-- aria-disabled keeps focus on the pressed button while an invitation request is pending. -->
			<Button type="submit" aria-disabled={pending ? 'true' : undefined} aria-busy={loading || undefined}
				>{loading ? 'Sending...' : 'Send invite'}</Button
			>
		</div>
		<!-- The outcome takes the helper's line so the strip keeps its height. -->
		{#if error}
			<p id="{idPrefix}-helper" role="alert" class="text-sm text-destructive-text sm:pl-16">{error}</p>
		{:else if confirmed}
			<p id="{idPrefix}-helper" role="status" class="text-sm sm:pl-16">
				{message ?? 'Invitation created.'}
			</p>
		{:else}
			<p id="{idPrefix}-helper" class="text-sm text-muted-foreground sm:pl-16">{helper}</p>
		{/if}
	</form>
</section>

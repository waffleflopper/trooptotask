<script lang="ts">
	import { onDestroy } from 'svelte';
	import { enhance } from '$app/forms';
	import { redirectToSensitiveActionStepUp } from '$features/identity';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import * as SegmentedFilter from '$lib/components/patterns/segmented-filter/index.js';
	import type { CapabilityLevel, ScopeSet } from '$lib/access/memberAccessShape';
	import { cn } from '$lib/utils.js';
	import { settleAction } from '$lib/utils/settleAction';
	import type { SettingsMemberRow } from './memberSettingsTypes';
	import {
		SETTINGS_ACCESS_LANES,
		SETTINGS_ACCESS_OPTIONS,
		SETTINGS_CAPABILITY_OPTIONS,
		SETTINGS_GOVERNANCE_ROLE_OPTIONS,
		type EditableMembershipRole,
		type EditablePreset
	} from './settingsMemberAccessConstants';
	import {
		accessLabel,
		presetHelper,
		presetLabel,
		roleHelper,
		type SettingsMemberAccessWorkspace
	} from './settingsMemberAccessWorkspace.svelte';

	type Props = {
		workspace: SettingsMemberAccessWorkspace;
		unit: string;
		isOwner: boolean;
		groups: Array<{ id: string; name: string }>;
		/** The server's answer to the last save, shown only for the member it was about. */
		accessError: string | undefined;
		/** The row's Manage button, where focus returns after a save. */
		opener: HTMLElement | null;
		fallbackFocus: () => HTMLElement | null;
		onSaveStart: () => void;
		onRemove: (member: SettingsMemberRow) => void;
	};

	let { workspace, unit, isOwner, groups, accessError, opener, fallbackFocus, onSaveStart, onRemove }: Props = $props();

	let active = true;
	onDestroy(() => {
		active = false;
	});

	let loading = $state(false);
	let requestError = $state<string | null>(null);
	let errorMemberId = $state<string | null>(null);
	let saveButton = $state<HTMLButtonElement | null>(null);

	const member = $derived(workspace.editingMember);
	const draft = $derived(workspace.draft);
	const changeCount = $derived(workspace.changeCount);
	const areaChangeCount = $derived(workspace.areaChangeCount);
	const shownError = $derived(requestError ?? (errorMemberId === member?.id ? accessError : undefined));

	const ROLE_OPTIONS = SETTINGS_GOVERNANCE_ROLE_OPTIONS.map(({ value, label }) => ({ value, label }));
	const PRESET_OPTIONS = SETTINGS_ACCESS_OPTIONS.map(({ value, label }) => ({ value, label }));
	const SCOPE_OPTIONS: Array<{ value: ScopeSet['kind']; label: string }> = [
		{ value: 'organization', label: 'All groups' },
		{ value: 'groups', label: 'Selected' }
	];

	function close() {
		requestError = null;
		errorMemberId = null;
		workspace.close();
	}

	function summary(row: SettingsMemberRow): string {
		const changes = row.overriddenCapabilityLabels.length;
		return [accessLabel(row), row.scopeDisplayLabel, changes > 0 && plural(changes, 'area change')]
			.filter(Boolean)
			.join(' · ');
	}

	function plural(count: number, one: string) {
		return `${count} ${count === 1 ? one : `${one}s`}`;
	}

	function scopeSentence(scope: ScopeSet): string {
		if (scope.kind === 'organization') return `Works across every group in ${unit}.`;
		if (scope.groupIds.length === 0) return 'Pick at least one group. With none, they can sign in but see no records.';
		const names = scope.groupIds.map((id) => workspace.groupName(id));
		const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
		return `Works in ${list} only.`;
	}
</script>

<Sheet.Root
	open={Boolean(member && draft)}
	onOpenChange={(open) => {
		if (!open && !loading) close();
	}}
>
	{#if member && draft}
		<Sheet.Content
			class="w-full gap-0 overflow-y-auto data-[side=right]:sm:max-w-xl"
			aria-busy={loading || undefined}
			showCloseButton={!loading}
			escapeKeydownBehavior={loading ? 'ignore' : 'close'}
			interactOutsideBehavior={loading ? 'ignore' : 'close'}
		>
			<Sheet.Header class="border-b p-6">
				<p class="font-mono text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
					Manage access
				</p>
				<Sheet.Title class="font-heading text-[22px] leading-[26px] font-bold wrap-anywhere">
					{member.email ?? 'Selected member'}
				</Sheet.Title>
				<Sheet.Description class="font-mono text-xs">{summary(member)}</Sheet.Description>
			</Sheet.Header>
			<form
				method="POST"
				action="?/updateMemberAccess"
				class="flex min-h-0 flex-1 flex-col"
				use:enhance={({ cancel }) => {
					if (loading) return cancel();
					const memberId = member.id;
					loading = true;
					errorMemberId = memberId;
					requestError = null;
					onSaveStart();
					return async (outcome) => {
						if (!active) return;
						const { result } = outcome;
						if (result.type === 'failure' && redirectToSensitiveActionStepUp(result.data)) {
							loading = false;
							return;
						}
						await settleAction(outcome, {
							isCurrent: () => active,
							settled: (error) => {
								requestError = error;
								loading = false;
								if (!error && result.type === 'success') close();
							},
							focus: () => [saveButton, opener, fallbackFocus()]
						});
					};
				}}
			>
				<fieldset class="grid gap-8 p-6" disabled={loading}>
					<input type="hidden" name="membershipId" value={member.id} />
					<input type="hidden" name="membershipRole" value={draft.role} />
					<input type="hidden" name="memberPreset" value={draft.preset} />

					<section class="grid gap-2" aria-label="Role">
						<h3 class="text-sm font-semibold">Role</h3>
						{#if isOwner}
							<SegmentedFilter.Root
								label="Role"
								describedBy="access-role-helper"
								options={ROLE_OPTIONS}
								bind:value={() => draft.role, (role: EditableMembershipRole) => workspace.setRole(role)}
							/>
						{:else}
							<p class="text-sm">{draft.role === 'admin' ? 'Admin' : 'Member'}</p>
						{/if}
						<p id="access-role-helper" class="text-sm text-muted-foreground">{roleHelper(draft.role)}</p>
					</section>

					{#if draft.role === 'member'}
						<section class="grid gap-2" aria-label="Preset">
							<h3 class="text-sm font-semibold">Preset</h3>
							<SegmentedFilter.Root
								label="Preset"
								describedBy="access-preset-helper"
								options={PRESET_OPTIONS}
								bind:value={() => draft.preset, (preset: EditablePreset) => workspace.setPreset(preset)}
							/>
							<p id="access-preset-helper" class="text-sm text-muted-foreground">{presetHelper(draft.preset)}</p>
						</section>

						<section class="grid gap-3" aria-label="Area by area">
							<div class="flex flex-wrap items-baseline justify-between gap-x-4 border-b-2 border-foreground pb-2">
								<h3 class="text-sm font-semibold">Area by area</h3>
								<p
									class={cn(
										'font-mono text-xs',
										areaChangeCount > 0 ? 'text-warning-foreground' : 'text-muted-foreground'
									)}
								>
									{areaChangeCount > 0
										? `${plural(areaChangeCount, 'change')} from ${presetLabel(draft.preset)}`
										: `Matches ${presetLabel(draft.preset)}`}
								</p>
							</div>
							<ul class="grid">
								{#each SETTINGS_ACCESS_LANES as lane (lane.id)}
									{@const off = workspace.isOff(lane.id)}
									{@const gap = workspace.presetGap(lane.id)}
									<li class="grid gap-2 border-b py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
										<input type="hidden" name="capabilityOverride:{lane.id}" value={draft.levels[lane.id]} />
										<div class="grid min-w-0 gap-0.5">
											<p class="flex items-center gap-2 text-sm font-medium">
												{lane.label}
												{#if gap}
													<span class="size-1.5 rounded-full bg-warning" aria-hidden="true"></span>
												{/if}
											</p>
											{#if off}
												<p class="font-mono text-xs text-muted-foreground">Off for {unit}</p>
											{:else if gap}
												<p class="font-mono text-xs text-warning-foreground">{gap}</p>
											{/if}
										</div>
										<SegmentedFilter.Root
											label={`${lane.label} access`}
											options={SETTINGS_CAPABILITY_OPTIONS}
											disabled={off}
											bind:value={
												() => draft.levels[lane.id], (level: CapabilityLevel) => workspace.setLevel(lane.id, level)
											}
										/>
									</li>
								{/each}
							</ul>
						</section>

						<section class="grid gap-3" aria-label="Groups">
							<h3 class="text-sm font-semibold">Groups</h3>
							<input type="hidden" name="scopeSetKind" value={draft.scope.kind} />
							<SegmentedFilter.Root
								label="Groups"
								options={SCOPE_OPTIONS}
								bind:value={() => draft.scope.kind, (kind: ScopeSet['kind']) => workspace.setScopeKind(kind)}
							/>
							{#if draft.scope.kind === 'groups'}
								{@const selected = draft.scope.groupIds}
								<div class="flex flex-wrap gap-2">
									{#each groups as group (group.id)}
										{#if selected.includes(group.id)}
											<input type="hidden" name="scopeSetGroupIds" value={group.id} />
										{/if}
										<Button
											type="button"
											size="sm"
											variant={selected.includes(group.id) ? 'default' : 'outline'}
											aria-pressed={selected.includes(group.id)}
											onclick={() => workspace.toggleScopeGroup(group.id)}>{group.name}</Button
										>
									{/each}
								</div>
							{/if}
							<p
								class={cn(
									'text-sm',
									draft.scope.kind === 'groups' && draft.scope.groupIds.length === 0
										? 'text-warning-foreground'
										: 'text-muted-foreground'
								)}
							>
								{scopeSentence(draft.scope)}
							</p>
						</section>
					{:else}
						<p class="text-sm text-muted-foreground">
							Admins work across every area and group in {unit}. Presets and groups apply to members.
						</p>
					{/if}

					{#if shownError}
						<Alert.Root variant="destructive">
							<Alert.Description>{shownError}</Alert.Description>
						</Alert.Root>
					{/if}
				</fieldset>
				<!-- Outside the fieldset so Save keeps focus (aria-disabled) while the request is pending. -->
				<Sheet.Footer class="mt-auto flex-row flex-wrap items-center border-t p-6">
					<Button
						type="button"
						variant="ghost"
						class="mr-auto text-destructive-text"
						disabled={loading}
						onclick={() => {
							const target = member;
							close();
							onRemove(target);
						}}>Remove from {unit}</Button
					>
					<Button type="button" variant="outline" disabled={loading} onclick={close}>Cancel</Button>
					<Button
						bind:ref={saveButton}
						type="submit"
						disabled={changeCount === 0}
						aria-disabled={loading ? 'true' : undefined}
						aria-busy={loading || undefined}
					>
						{#if loading}
							Saving...
						{:else if changeCount > 0}
							Save {plural(changeCount, 'change')}
						{:else}
							No changes
						{/if}
					</Button>
				</Sheet.Footer>
			</form>
		</Sheet.Content>
	{/if}
</Sheet.Root>

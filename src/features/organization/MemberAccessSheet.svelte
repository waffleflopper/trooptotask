<script lang="ts">
	import { onDestroy } from 'svelte';
	import Check from '@lucide/svelte/icons/check';
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

	const SECTION_TITLE = 'flex-1 font-heading text-lg leading-[22px] font-semibold';
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
			class="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-140"
			aria-busy={loading || undefined}
			showCloseButton={!loading}
			escapeKeydownBehavior={loading ? 'ignore' : 'close'}
			interactOutsideBehavior={loading ? 'ignore' : 'close'}
		>
			<Sheet.Header class="gap-2 border-b-2 border-foreground px-5 pt-7 pb-5 sm:px-8">
				<p class="font-mono text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
					Manage access
				</p>
				<Sheet.Title class="font-heading text-[32px] leading-8 font-bold tracking-[-0.01em] wrap-anywhere">
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
				<fieldset class="min-h-0 min-w-0 flex-1 overflow-y-auto px-5 sm:px-8" disabled={loading}>
					<input type="hidden" name="membershipId" value={member.id} />
					<input type="hidden" name="membershipRole" value={draft.role} />
					<input type="hidden" name="memberPreset" value={draft.preset} />

					<section class="grid gap-2 border-b py-4.5" aria-label="Role">
						<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
							<h3 class={SECTION_TITLE}>Role</h3>
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
						</div>
						<p id="access-role-helper" class="text-sm text-muted-foreground">{roleHelper(draft.role)}</p>
					</section>

					{#if draft.role === 'member'}
						<section class="grid gap-2 border-b py-4.5" aria-label="Preset">
							<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
								<h3 class={SECTION_TITLE}>Preset</h3>
								<SegmentedFilter.Root
									label="Preset"
									describedBy="access-preset-helper"
									options={PRESET_OPTIONS}
									bind:value={() => draft.preset, (preset: EditablePreset) => workspace.setPreset(preset)}
								/>
							</div>
							<p id="access-preset-helper" class="text-sm text-muted-foreground">{presetHelper(draft.preset)}</p>
						</section>

						<section class="grid pt-4.5" aria-label="Area by area">
							<div class="flex flex-wrap items-baseline gap-x-3 pb-1">
								<h3 class={SECTION_TITLE}>Area by area</h3>
								<p
									class={cn(
										'font-mono text-xs',
										areaChangeCount > 0 ? 'font-semibold text-warning-foreground' : 'text-muted-foreground'
									)}
								>
									{areaChangeCount > 0
										? `${plural(areaChangeCount, 'change')} from ${presetLabel(draft.preset)}`
										: `Matches ${presetLabel(draft.preset)}`}
								</p>
							</div>
							<p class="pb-2 text-sm text-muted-foreground">
								Change an area only when the preset is too broad or too narrow for it.
							</p>
							<ul class="grid">
								{#each SETTINGS_ACCESS_LANES as lane (lane.id)}
									{@const off = workspace.isOff(lane.id)}
									{@const gap = workspace.presetGap(lane.id)}
									<li class="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 border-b py-1.5">
										<input type="hidden" name="capabilityOverride:{lane.id}" value={draft.levels[lane.id]} />
										<span class="flex w-2 shrink-0" aria-hidden="true">
											{#if gap}
												<span class="size-1.5 rounded-full bg-warning"></span>
											{/if}
										</span>
										<div class="grid min-w-24 flex-1">
											<p class={cn('text-sm', gap && 'font-semibold')}>{lane.label}</p>
											{#if off}
												<p class="font-mono text-[11px] leading-3.5 text-muted-foreground">Off for {unit}</p>
											{:else if gap}
												<p class="font-mono text-[11px] leading-3.5 text-muted-foreground">{gap}</p>
											{/if}
										</div>
										<div class="ml-auto">
											<SegmentedFilter.Root
												label={`${lane.label} access`}
												options={SETTINGS_CAPABILITY_OPTIONS}
												disabled={off}
												bind:value={
													() => draft.levels[lane.id], (level: CapabilityLevel) => workspace.setLevel(lane.id, level)
												}
											/>
										</div>
									</li>
								{/each}
							</ul>
						</section>

						<section class="grid gap-2.5 py-4.5" aria-label="Groups">
							<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
								<h3 class={SECTION_TITLE}>Groups</h3>
								<SegmentedFilter.Root
									label="Groups"
									options={SCOPE_OPTIONS}
									bind:value={() => draft.scope.kind, (kind: ScopeSet['kind']) => workspace.setScopeKind(kind)}
								/>
							</div>
							<input type="hidden" name="scopeSetKind" value={draft.scope.kind} />
							{#if draft.scope.kind === 'groups'}
								{@const selected = draft.scope.groupIds}
								<div class="flex flex-wrap gap-1.5">
									{#each groups as group (group.id)}
										{@const chosen = selected.includes(group.id)}
										{#if chosen}
											<input type="hidden" name="scopeSetGroupIds" value={group.id} />
										{/if}
										<Button
											type="button"
											size="sm"
											variant={chosen ? 'default' : 'outline'}
											class="rounded-full text-[13px]"
											aria-pressed={chosen}
											onclick={() => workspace.toggleScopeGroup(group.id)}
										>
											{#if chosen}<Check data-icon="inline-start" aria-hidden="true" />{/if}
											{group.name}
										</Button>
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
						<p class="py-4.5 text-sm text-muted-foreground">
							Admins work across every area and group in {unit}. Presets and groups apply to members.
						</p>
					{/if}

					{#if shownError}
						<Alert.Root variant="destructive" class="mb-4.5">
							<Alert.Description>{shownError}</Alert.Description>
						</Alert.Root>
					{/if}
				</fieldset>
				<!-- Outside the fieldset so Save keeps focus (aria-disabled) while the request is pending. -->
				<Sheet.Footer class="flex-row flex-wrap items-center gap-2 border-t bg-muted px-5 py-3.5 sm:px-8">
					<Button
						type="button"
						variant="ghost"
						class="text-destructive-text"
						disabled={loading}
						onclick={() => {
							const target = member;
							close();
							onRemove(target);
						}}>Remove from {unit}</Button
					>
					<div class="ml-auto flex gap-2">
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
					</div>
				</Sheet.Footer>
			</form>
		</Sheet.Content>
	{/if}
</Sheet.Root>

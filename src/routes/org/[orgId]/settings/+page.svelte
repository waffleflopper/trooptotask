<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import { Edit, Trash2, UserPlus } from '@lucide/svelte';
	import { explainPolicyReasonCode } from '$lib/access/policyDecisionExplanations';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as AppDialog from '$lib/components/ui/app-dialog/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { TIER_CONFIG, type EffectiveTier } from '$lib/types/subscription';
	import { addMonths, formatRelativeDate } from '$lib/utils/dates';
	import { downloadBlob } from './settingsDownloads';
	import ArchivedPersonnelSettingsSection from './ArchivedPersonnelSettingsSection.svelte';
	import DangerZoneSettingsSection from './DangerZoneSettingsSection.svelte';
	import DataExportSettingsSection from './DataExportSettingsSection.svelte';
	import OrganizationSettingsSection from './OrganizationSettingsSection.svelte';
	import PoliciesSettingsSection from './PoliciesSettingsSection.svelte';
	import SettingsActivityRail from './SettingsActivityRail.svelte';
	import {
		formatCompactDate,
		formatCap,
		formatExportLimit,
		formatPrice,
		normalizeOrganizationName,
		pluralize
	} from './settingsWorkspaceFormatters';
	import { createSettingsWorkspaceState } from './settingsWorkspaceState.svelte';
	import type { EditablePreset } from './settingsMemberAccessWorkspace.svelte';
	import type { SettingsMemberAccessRow } from './settingsMemberAccessModel';

	let { data, form } = $props();
	const orgId = $derived($page.params.orgId);

	type SectionId = 'organization' | 'members' | 'policies' | 'archived' | 'data-export' | 'danger';
	type ArchivedPerson = (typeof data.archivedPersonnel)[number];
	type AuditLog = (typeof data.auditLog.logs)[number];
	type SectionConfig = { id: SectionId; label: string; eyebrow: string; danger?: boolean };

	const standardSections: SectionConfig[] = [
		{ id: 'organization', label: 'Organization', eyebrow: 'Profile' },
		{ id: 'members', label: 'Members', eyebrow: 'Access Control' },
		{ id: 'policies', label: 'Policies', eyebrow: 'Operational Defaults' },
		{ id: 'archived', label: 'Archived Personnel', eyebrow: 'Retention Queue' },
		{ id: 'data-export', label: 'Data & Export', eyebrow: 'Backup & Migration' }
	];
	const ownerSection: SectionConfig = { id: 'danger', label: 'Danger Zone', eyebrow: 'Owner Authority', danger: true };
	const settingsState = createSettingsWorkspaceState(() => data.workspace);
	const syncPoliciesFromWorkspace = () => settingsState.policies.syncFromWorkspace();
	const membersSection = $derived(data.workspace.sections.members);
	const policiesSection = $derived(data.workspace.sections.policies);
	const currentMember = $derived(data.workspace.currentMember);
	const isOwner = $derived(currentMember.isOwner);
	const sections = $derived(isOwner ? [...standardSections, ownerSection] : standardSections);

	let activeSection = $state<SectionId>('organization');
	let activityCollapsed = $state(false);
	let loading = $state(false);
	let showTransferConfirm = $state(false);
	let transferTargetId = $state<string | null>(null);
	let pendingRemoveMemberForm = $state<HTMLFormElement | null>(null);
	let pendingRemoveMemberEmail = $state('');

	let showDeleteConfirm = $state(false);
	let deleteConfirmText = $state('');
	const normalizedOrgName = $derived(normalizeOrganizationName(data.orgName ?? ''));
	const deleteConfirmMatches = $derived(normalizeOrganizationName(deleteConfirmText) === normalizedOrgName);
	const deleteOrganizationCloseBlocked = $derived(loading || deleteConfirmText.trim() !== '');

	let exportingOrgJson = $state(false);
	let exportingOrgExcel = $state(false);
	let exportError = $state('');
	let exportSuccess = $state(false);

	let restoring = $state<string | null>(null);
	let exportingPerson = $state<string | null>(null);
	let confirmPermanentDelete = $state<{ id: string; name: string } | null>(null);

	const memberAccess = settingsState.members;
	const sortedMembers = $derived(memberAccess.sortedMembers);
	const transferOwnershipCandidates = $derived(
		sortedMembers.filter(
			(member: SettingsMemberAccessRow) => isOwner && member.membershipRole !== 'owner' && member.userId
		)
	);
	const availablePresetOptions = $derived(memberAccess.availablePresetOptions);
	const accessLanes = memberAccess.accessLanes;
	const capabilityOptions = memberAccess.capabilityOptions;
	const governanceRoleExplanation = explainPolicyReasonCode('denied:governance-role');

	const activeSectionConfig = $derived(sections.find((section) => section.id === activeSection) ?? sections[0]);
	const activeSectionDescription = $derived(getSectionDescription(activeSection));
	const nextPurgeDate = $derived.by(() => {
		if (data.archivedPersonnel.length === 0) return null;
		const purgeTimes = data.archivedPersonnel.map((person: ArchivedPerson) =>
			addMonths(new Date(person.archivedAt), policiesSection.archiveRetention.savedMonths).getTime()
		);
		return new Date(Math.min(...purgeTimes));
	});
	const auditEntriesLast30Days = $derived.by(() => {
		if (typeof data.auditLog.last30DaysCount === 'number') return data.auditLog.last30DaysCount;
		const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
		return data.auditLog.logs.filter((log: AuditLog) => new Date(log.createdAt).getTime() >= cutoff).length;
	});
	const summaryRows = $derived([
		{
			label: 'Members',
			value: String(membersSection.rows.length),
			detail: membersSection.memberRoleSummary,
			target: 'members' as SectionId
		},
		{
			label: 'Pending approvals',
			value: String(membersSection.pendingApprovalSummary.count),
			detail: membersSection.pendingApprovalSummary.oldestCreatedAt
				? `Oldest ${formatRelativeDate(membersSection.pendingApprovalSummary.oldestCreatedAt)}`
				: 'No pending requests',
			target: 'members' as SectionId
		},
		{
			label: 'Archived personnel',
			value: String(data.archivedPersonnel.length),
			detail: nextPurgeDate
				? `Next purge ${formatCompactDate(nextPurgeDate)}`
				: `Retention ${policiesSection.archiveRetention.savedMonths} months`,
			target: 'archived' as SectionId
		},
		{
			label: 'Audit entries',
			value: String(auditEntriesLast30Days),
			detail: 'Last 30 days',
			target: 'data-export' as SectionId
		}
	]);
	const tier = $derived(
		data.effectiveTier ??
			({
				tier: 'free',
				source: 'default',
				personnelCount: membersSection.rows.length,
				personnelCap: TIER_CONFIG.free.personnelCap,
				isReadOnly: false,
				giftExpiresAt: null,
				giftTier: null
			} satisfies EffectiveTier)
	);
	const tierConfig = $derived(TIER_CONFIG[tier.tier]);
	const planName = $derived(tierConfig.name);
	const planBadge = $derived(`${planName} tier`);
	const planPrice = $derived(formatPrice(tierConfig.priceMonthly));
	const planCopy = $derived(
		`Includes ${formatCap(tierConfig.personnelCap).toLowerCase()} members, audit log, ${formatExportLimit(tierConfig.bulkExportsPerMonth)}.`
	);
	const personnelCount = $derived(`${tier.personnelCount} / ${formatCap(tierConfig.personnelCap).toUpperCase()}`);
	const billingStatus = $derived(getBillingStatus(tier));
	const sessionEmail = $derived((data.session as { user?: { email?: string | null } } | null | undefined)?.user?.email);

	$effect.pre(syncPoliciesFromWorkspace);

	function getBillingStatus(tier: EffectiveTier): string {
		if (tier.isReadOnly) return 'Read-only';
		if (tier.source === 'gift') return 'Gifted access';
		return 'Active';
	}

	function getSectionDescription(sectionId: SectionId): string | null {
		switch (sectionId) {
			case 'members':
				return 'Manage member presets, lane overrides, and shared scope without changing governance roles.';
			case 'policies':
				return 'Retention windows, warning lead times, and shared expiration thresholds.';
			case 'archived':
				return 'Records pending automatic deletion. Restore, export, or purge early.';
			case 'data-export':
				return 'Move data in and out of T2T. JSON for backups, Excel for human review.';
			case 'danger':
				return 'Destructive actions that cannot be undone. Owner authentication required.';
			case 'organization':
				return null;
		}
	}

	function isCurrentMember(member: SettingsMemberAccessRow): boolean {
		if (sessionEmail && member.email === sessionEmail) return true;
		return Boolean(isOwner && member.membershipRole === 'owner');
	}

	function closeDeleteOrganizationDialog() {
		showDeleteConfirm = false;
		deleteConfirmText = '';
	}

	async function saveSettings(body: Record<string, number | null>) {
		const res = await fetch(`/org/${orgId}/api/organization/settings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!res.ok) throw new Error();
	}

	async function handleRetentionSave() {
		if (
			!settingsState.policies.hasRetentionChanges ||
			!settingsState.policies.isRetentionValid ||
			settingsState.policies.savingRetention
		)
			return;
		settingsState.policies.savingRetention = true;
		try {
			await saveSettings({ archiveRetentionMonths: settingsState.policies.retentionMonths });
			settingsState.policies.markRetentionSaved();
			toastStore.success('Retention policy saved');
		} catch {
			toastStore.error('Failed to save retention policy');
		} finally {
			settingsState.policies.savingRetention = false;
		}
	}

	async function handleLossWarningSave() {
		if (
			!settingsState.policies.hasLossWarningChanges ||
			!settingsState.policies.isLossWarningValid ||
			settingsState.policies.savingWarningWindow
		)
			return;
		settingsState.policies.savingWarningWindow = true;
		try {
			await saveSettings({ lossWarningWindowDays: settingsState.policies.warningWindowDays });
			settingsState.policies.markLossWarningSaved();
			toastStore.success('Warning window saved');
		} catch {
			toastStore.error('Failed to save warning window');
		} finally {
			settingsState.policies.savingWarningWindow = false;
		}
	}

	async function handleCriticalTasksSave() {
		if (
			!settingsState.policies.hasCriticalTasksChanges ||
			!settingsState.policies.isCriticalTasksValid ||
			settingsState.policies.savingCriticalTasks
		)
			return;
		settingsState.policies.savingCriticalTasks = true;
		try {
			await saveSettings({
				criticalTasksDefaultExpirationMonths: settingsState.policies.criticalTasksDefaultExpirationMonths,
				criticalTasksExpiringSoonWarningDays: settingsState.policies.criticalTasksExpiringSoonWarningDays
			});
			settingsState.policies.markCriticalTasksSaved();
			toastStore.success('Critical Tasks settings saved');
		} catch {
			toastStore.error('Failed to save Critical Tasks settings');
		} finally {
			settingsState.policies.savingCriticalTasks = false;
		}
	}

	async function handleOrganizationExport(format: 'json' | 'excel') {
		if (exportingOrgJson || exportingOrgExcel) return;
		exportError = '';
		exportSuccess = false;
		exportingOrgJson = format === 'json';
		exportingOrgExcel = format === 'excel';
		const endpoint = format === 'json' ? 'export' : 'export-excel';
		const fallbackName = `org-export-${data.orgId}.${format === 'json' ? 'json' : 'xlsx'}`;

		try {
			const res = await fetch(`/org/${data.orgId}/api/${endpoint}`, { method: 'POST' });

			if (!res.ok) {
				if (res.headers.get('Content-Type')?.includes('application/json')) {
					const body = await res.json();
					exportError = body.error || 'Export failed. Please try again.';
				} else {
					exportError = 'Export failed. Please try again.';
				}
				return;
			}

			const blob = await res.blob();
			const disposition = res.headers.get('Content-Disposition');
			const filenameMatch = disposition?.match(/filename="(.+)"/);
			const filename = filenameMatch?.[1] ?? fallbackName;
			downloadBlob(blob, filename);
			exportSuccess = true;
		} catch {
			exportError = 'Export failed. Please try again.';
		} finally {
			exportingOrgJson = false;
			exportingOrgExcel = false;
		}
	}

	async function handleRestore(id: string) {
		restoring = id;
		try {
			const res = await fetch(`/org/${orgId}/api/personnel`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'restore', id })
			});
			if (!res.ok) {
				const errData = await res.json();
				toastStore.error(errData.message ?? 'Failed to restore');
				return;
			}
			toastStore.success('Personnel restored to active status');
			await invalidateAll();
		} catch {
			toastStore.error('Failed to restore personnel');
		} finally {
			restoring = null;
		}
	}

	async function handlePermanentDelete(id: string) {
		try {
			const res = await fetch(`/org/${orgId}/api/personnel/permanent`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
			if (!res.ok) throw new Error();
			toastStore.success('Personnel permanently deleted');
			confirmPermanentDelete = null;
			await invalidateAll();
		} catch {
			toastStore.error('Failed to permanently delete');
		}
	}

	async function handlePersonnelExport(id: string, name: string) {
		exportingPerson = id;
		try {
			const res = await fetch(`/org/${orgId}/api/personnel/${id}/export`);
			if (!res.ok) throw new Error();
			const blob = await res.blob();
			downloadBlob(blob, `${name}-records.xlsx`);
		} catch {
			toastStore.error('Failed to export records');
		} finally {
			exportingPerson = null;
		}
	}
</script>

<svelte:head>
	<title>Settings - {data.orgName} - Troop to Task</title>
</svelte:head>

<main class="flex flex-1 flex-col gap-6 p-4 md:p-6">
	<header class="grid gap-3">
		<div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
			<div class="grid gap-1">
				<p class="text-sm text-muted-foreground">{isOwner ? 'Owner access' : 'Admin access'}</p>
				<h1 class="text-2xl font-semibold tracking-tight">Organization Settings</h1>
				<p class="max-w-3xl text-sm text-muted-foreground">
					{data.orgName} governance, access, policies, retention, and export controls.
				</p>
			</div>
			{#if activeSection === 'members' && membersSection.canInvite}
				<Button href="#invite-member-section">
					<UserPlus />
					Invite Member
				</Button>
			{/if}
		</div>
	</header>

	<section class="grid gap-3 md:grid-cols-4" aria-label="Organization settings summary">
		{#each summaryRows as row (row.label)}
			<button
				type="button"
				class="grid gap-2 rounded-lg border bg-card p-4 text-left text-card-foreground"
				onclick={() => (activeSection = row.target)}
			>
				<p class="text-sm font-medium">{row.label}</p>
				<p class="text-2xl font-semibold tracking-tight">{row.value}</p>
				<p class="text-sm text-muted-foreground">{row.detail}</p>
			</button>
		{/each}
	</section>

	<Tabs.Root bind:value={activeSection} class="grid gap-4">
		<Tabs.List class="w-full justify-start">
			{#each sections as section (section.id)}
				<Tabs.Trigger value={section.id}>{section.label}</Tabs.Trigger>
			{/each}
		</Tabs.List>

		<section class="grid gap-1" aria-labelledby="settings-section-title">
			<p class="text-sm text-muted-foreground">{activeSectionConfig.eyebrow}</p>
			<h2 id="settings-section-title" class="text-xl font-semibold tracking-tight">{activeSectionConfig.label}</h2>
			{#if activeSectionDescription}
				<p class="max-w-3xl text-sm text-muted-foreground">{activeSectionDescription}</p>
			{/if}
		</section>

		<Tabs.Content value="organization" class="grid gap-4">
			<OrganizationSettingsSection
				{data}
				{form}
				bind:loading
				{planBadge}
				{planPrice}
				{planCopy}
				{billingStatus}
				{personnelCount}
			/>
		</Tabs.Content>

		<Tabs.Content value="members" class="grid gap-4">
			<section
				class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground"
				aria-labelledby="roster-access-heading"
			>
				<div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
					<div class="grid gap-1">
						<h3 id="roster-access-heading" class="text-lg font-semibold tracking-tight">Access Management</h3>
						<p class="text-sm text-muted-foreground">
							Viewer, Operator, and Editor shape feature access. {governanceRoleExplanation}
						</p>
					</div>
					<Badge variant="outline">{membersSection.rows.length} {pluralize('Member', membersSection.rows.length)}</Badge
					>
				</div>
				<Separator />
				<div class="rounded-md border bg-muted/30 p-3 text-sm">
					<strong>Member presets do not grant admin authority.</strong>
				</div>

				<div class="grid gap-3" role="list" aria-label="Organization members">
					{#each sortedMembers as member (member.id)}
						{@const accessShape = memberAccess.getMemberAccessShape(member)}
						{@const accessBadge = memberAccess.getMemberAccessBadge(member, accessShape)}
						{@const selectedPreset = memberAccess.getSelectedPreset(member)}
						{@const selectedScopeKind = memberAccess.getSelectedScopeKind(member)}
						{@const selectedScopeGroupIds = memberAccess.getSelectedScopeGroupIds(member)}
						{@const overrides = memberAccess.overriddenCapabilityLabels(member)}
						<div
							class="grid gap-4 rounded-md border bg-card p-3 md:grid-cols-[auto_minmax(0,1fr)_auto]"
							role="listitem"
						>
							<div
								class="flex size-10 items-center justify-center rounded-md border bg-muted text-sm font-medium"
								aria-hidden="true"
							>
								{memberAccess.getMemberInitials(member.email)}
							</div>
							<div class="grid gap-2">
								<div class="grid gap-1">
									<p class="font-medium">{member.email ?? `${member.userId.slice(0, 8)}...`}</p>
									<p class="text-sm text-muted-foreground">{memberAccess.formatScopeSet(accessShape.scopeSet)}</p>
								</div>
								<div class="flex flex-wrap gap-2">
									<Badge variant="secondary">{memberAccess.getAccessLabel(accessBadge)}</Badge>
									{#each overrides as override (override)}
										<Badge variant="outline">{override}</Badge>
									{/each}
									{#if overrides.length === 0 && member.membershipRole !== 'owner' && member.membershipRole !== 'admin'}
										<Badge variant="outline">Preset defaults</Badge>
									{/if}
								</div>
							</div>
							<div class="flex flex-wrap items-start justify-end gap-2">
								{#if member.membershipRole === 'owner'}
									{#if isCurrentMember(member)}<Badge>You</Badge>{/if}
								{:else if membersSection.canManageMemberAccess && (member.membershipRole !== 'admin' || isOwner)}
									<Button
										type="button"
										variant="outline"
										size="sm"
										onclick={() => memberAccess.openMemberEditor(member)}
									>
										<Edit />
										Manage Access
									</Button>
									<form method="POST" action="?/removeMember" use:enhance>
										<input type="hidden" name="membershipId" value={member.id} />
										<Button
											type="button"
											variant="destructive"
											size="sm"
											onclick={(event) => {
												pendingRemoveMemberForm = (event.currentTarget as HTMLButtonElement).closest('form');
												pendingRemoveMemberEmail = member.email ?? 'this member';
											}}
										>
											<Trash2 />
											Remove
										</Button>
									</form>
								{/if}
							</div>

							{#if memberAccess.memberEditorId === member.id}
								<form
									method="POST"
									action="?/updatePermissions"
									class="grid gap-4 rounded-md border bg-muted/30 p-3 md:col-span-3"
									use:enhance={() => {
										loading = true;
										return async ({ update }) => {
											loading = false;
											memberAccess.closeMemberEditor(member.id);
											await update();
										};
									}}
								>
									<input type="hidden" name="membershipId" value={member.id} />
									<div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
										<label class="grid gap-2">
											<span class="text-sm font-medium">Access assignment</span>
											<select
												name="preset"
												class="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
												value={selectedPreset}
												onchange={(event) =>
													memberAccess.setMemberPreset(member.id, event.currentTarget.value as EditablePreset)}
											>
												{#each availablePresetOptions as option (option.value)}
													<option value={option.value}>{option.label}</option>
												{/each}
											</select>
											<p class="text-sm text-muted-foreground">{memberAccess.getAccessOptionHelper(selectedPreset)}</p>
										</label>
										<div class="flex flex-wrap items-end gap-2">
											<Button type="submit" size="sm" disabled={loading}>
												{loading ? 'Saving...' : 'Save Access'}
											</Button>
											<Button
												type="button"
												variant="outline"
												size="sm"
												onclick={() => memberAccess.closeMemberEditor(member.id)}
											>
												Cancel
											</Button>
											{#if isOwner}
												<Button
													type="button"
													variant="outline"
													size="sm"
													onclick={() => {
														transferTargetId = member.userId;
														showTransferConfirm = true;
													}}
												>
													Transfer Ownership
												</Button>
											{/if}
										</div>
									</div>

									{#if selectedPreset !== 'admin'}
										<input type="hidden" name="accessScopeKind" value={selectedScopeKind} />
										<div class="grid gap-4 md:grid-cols-2">
											<section
												class="grid gap-3 rounded-md border bg-card p-3"
												aria-labelledby="capability-overrides-{member.id}"
											>
												<div class="grid gap-1">
													<h4 id="capability-overrides-{member.id}" class="font-medium">Capability Overrides</h4>
													<p class="text-sm text-muted-foreground">
														Override individual lanes only when the preset default is not enough.
													</p>
												</div>
												<div class="grid gap-3 sm:grid-cols-2">
													{#each accessLanes as lane (lane.id)}
														<label class="grid gap-2">
															<span class="text-sm font-medium">{lane.label}</span>
															<select
																name="capability:{lane.id}"
																class="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
																value={memberAccess.getEditorCapabilityValue(member, lane.id, selectedPreset)}
																aria-label="{lane.label} capability for {member.email ?? 'member'}"
															>
																{#each capabilityOptions as option (option.value)}
																	<option value={option.value}>{option.label}</option>
																{/each}
															</select>
														</label>
													{/each}
												</div>
											</section>
											<section class="grid gap-3 rounded-md border bg-card p-3" aria-labelledby="scope-set-{member.id}">
												<div class="grid gap-1">
													<h4 id="scope-set-{member.id}" class="font-medium">Scope Set</h4>
													<p class="text-sm text-muted-foreground">
														Scope is shared across scoped feature lanes. It is not configured per feature.
													</p>
												</div>
												<div class="flex flex-wrap gap-4">
													<label class="flex items-center gap-2 text-sm">
														<input
															type="radio"
															name="scope-choice-{member.id}"
															checked={selectedScopeKind === 'organization'}
															onchange={() => memberAccess.setMemberScopeKind(member.id, 'organization')}
														/>
														All groups
													</label>
													<label class="flex items-center gap-2 text-sm">
														<input
															type="radio"
															name="scope-choice-{member.id}"
															checked={selectedScopeKind === 'groups'}
															onchange={() => memberAccess.setMemberScopeKind(member.id, 'groups')}
														/>
														Selected groups
													</label>
												</div>
												{#if selectedScopeKind === 'groups'}
													<div class="grid gap-2">
														{#each membersSection.groups as group (group.id)}
															<label class="flex items-center gap-2 text-sm">
																<input
																	type="checkbox"
																	name="accessScopeGroupIds"
																	value={group.id}
																	checked={selectedScopeGroupIds.includes(group.id)}
																	onchange={(event) =>
																		memberAccess.toggleMemberScopeGroup(
																			member.id,
																			group.id,
																			event.currentTarget.checked
																		)}
																/>
																{group.name}
															</label>
														{/each}
													</div>
												{/if}
											</section>
										</div>
									{/if}
								</form>
							{/if}
						</div>
					{/each}
				</div>

				{#if form?.memberError}<p class="text-sm text-destructive">{form.memberError}</p>{/if}
				{#if form?.permissionError}<p class="text-sm text-destructive">{form.permissionError}</p>{/if}
				{#if form?.permissionSuccess}<p class="text-sm text-muted-foreground">Permissions updated.</p>{/if}
			</section>

			{#if membersSection.canInvite}
				<section
					id="invite-member-section"
					class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground"
					aria-labelledby="invite-member-heading"
				>
					<div class="grid gap-1">
						<h3 id="invite-member-heading" class="text-lg font-semibold tracking-tight">Invite Member</h3>
						<p class="text-sm text-muted-foreground">
							Invitee logs in to T2T to accept. No email is sent automatically.
						</p>
					</div>
					<Separator />
					<form
						method="POST"
						action="?/invite"
						use:enhance={() => {
							loading = true;
							return async ({ update }) => {
								loading = false;
								await update();
								if (!form?.inviteError) memberAccess.clearInviteEmail();
							};
						}}
					>
						{#if form?.inviteError}<p class="text-sm text-destructive">{form.inviteError}</p>{/if}
						{#if form?.inviteSuccess}
							<p class="text-sm text-muted-foreground">{form.inviteMessage ?? 'Invitation created.'}</p>
						{/if}
						<div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_14rem_auto]">
							<div class="grid gap-2">
								<Label for="invite-email">Send invitation</Label>
								<Input
									id="invite-email"
									name="email"
									type="email"
									placeholder="colleague@example.com"
									bind:value={memberAccess.inviteEmail}
									required
								/>
							</div>
							<label class="grid gap-2">
								<span class="text-sm font-medium">Preset</span>
								<select
									name="preset"
									class="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
									bind:value={memberAccess.invitePreset}
									aria-label="Invite member preset"
								>
									{#each availablePresetOptions as option (option.value)}
										<option value={option.value}>{option.label}</option>
									{/each}
								</select>
							</label>
							<div class="flex items-end">
								<Button type="submit" disabled={loading}>
									{loading ? 'Inviting...' : 'Invite'}
								</Button>
							</div>
						</div>
						{#if memberAccess.invitePreset !== 'admin'}
							<div class="mt-4 grid gap-3 rounded-md border bg-muted/30 p-3">
								<input type="hidden" name="accessScopeKind" value={memberAccess.inviteScopeKind} />
								<div class="flex flex-wrap gap-4">
									<label class="flex items-center gap-2 text-sm">
										<input
											type="radio"
											name="inviteScopeChoice"
											checked={memberAccess.inviteScopeKind === 'organization'}
											onchange={() => memberAccess.setInviteScopeKind('organization')}
										/>
										All groups
									</label>
									<label class="flex items-center gap-2 text-sm">
										<input
											type="radio"
											name="inviteScopeChoice"
											checked={memberAccess.inviteScopeKind === 'groups'}
											onchange={() => memberAccess.setInviteScopeKind('groups')}
										/>
										Selected groups
									</label>
								</div>
								{#if memberAccess.inviteScopeKind === 'groups'}
									<div class="grid gap-2">
										{#each membersSection.groups as group (group.id)}
											<label class="flex items-center gap-2 text-sm">
												<input
													type="checkbox"
													name="accessScopeGroupIds"
													value={group.id}
													checked={memberAccess.inviteScopeGroupIds.includes(group.id)}
													onchange={(event) =>
														memberAccess.toggleInviteScopeGroup(group.id, event.currentTarget.checked)}
												/>
												{group.name}
											</label>
										{/each}
									</div>
								{/if}
							</div>
						{/if}
					</form>
				</section>
			{/if}

			{#if membersSection.invitations.length > 0}
				<section
					class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground"
					aria-labelledby="pending-invites-heading"
				>
					<div class="flex items-center justify-between gap-3">
						<h3 id="pending-invites-heading" class="text-lg font-semibold tracking-tight">Pending Invitations</h3>
						<Badge variant="outline">{membersSection.invitations.length} Pending</Badge>
					</div>
					<div class="grid gap-3">
						{#each membersSection.invitations as invite (invite.id)}
							{@const invitePermissionPreset = memberAccess.getInvitePreset(invite)}
							<div class="flex flex-col gap-3 rounded-md border p-3 md:flex-row md:items-center md:justify-between">
								<div>
									<p class="font-medium">{invite.email}</p>
									<p class="text-sm text-muted-foreground">
										{memberAccess.getAccessLabel(invitePermissionPreset)} · Sent {formatRelativeDate(invite.createdAt)}
									</p>
								</div>
								<form method="POST" action="?/revokeInvite" use:enhance>
									<input type="hidden" name="inviteId" value={invite.id} />
									<Button type="submit" variant="outline" size="sm">Revoke</Button>
								</form>
							</div>
						{/each}
					</div>
				</section>
			{/if}
		</Tabs.Content>

		<Tabs.Content value="policies" class="grid gap-4">
			<PoliciesSettingsSection
				bind:retentionMonths={settingsState.policies.retentionMonths}
				bind:warningWindowDays={settingsState.policies.warningWindowDays}
				bind:criticalTasksDefaultExpirationMonths={settingsState.policies.criticalTasksDefaultExpirationMonths}
				bind:criticalTasksExpiringSoonWarningDays={settingsState.policies.criticalTasksExpiringSoonWarningDays}
				hasRetentionChanges={settingsState.policies.hasRetentionChanges}
				isRetentionValid={settingsState.policies.isRetentionValid}
				hasLossWarningChanges={settingsState.policies.hasLossWarningChanges}
				isLossWarningValid={settingsState.policies.isLossWarningValid}
				hasCriticalTasksChanges={settingsState.policies.hasCriticalTasksChanges}
				isCriticalTasksValid={settingsState.policies.isCriticalTasksValid}
				savingRetention={settingsState.policies.savingRetention}
				savingWarningWindow={settingsState.policies.savingWarningWindow}
				savingCriticalTasks={settingsState.policies.savingCriticalTasks}
				onSaveRetention={handleRetentionSave}
				onSaveLossWarning={handleLossWarningSave}
				onSaveCriticalTasks={handleCriticalTasksSave}
			/>
		</Tabs.Content>

		<Tabs.Content value="archived" class="grid gap-4">
			<ArchivedPersonnelSettingsSection
				archivedPersonnel={data.archivedPersonnel}
				retentionMonths={policiesSection.archiveRetention.savedMonths}
				{restoring}
				{exportingPerson}
				onRestore={handleRestore}
				onExport={handlePersonnelExport}
				onConfirmPermanentDelete={(person) => (confirmPermanentDelete = person)}
			/>
		</Tabs.Content>

		<Tabs.Content value="data-export" class="grid gap-4">
			<DataExportSettingsSection
				orgId={data.orgId}
				exportInfo={data.exportInfo}
				{exportError}
				{exportSuccess}
				{exportingOrgJson}
				{exportingOrgExcel}
				onExportOrganization={handleOrganizationExport}
			/>
			<SettingsActivityRail
				orgId={data.orgId}
				pendingApprovalsCount={data.pendingApprovalsCount}
				approvalRequests={data.approvalRequests}
				auditLog={data.auditLog}
				bind:collapsed={activityCollapsed}
			/>
		</Tabs.Content>

		<Tabs.Content value="danger" class="grid gap-4">
			{#if isOwner}
				<DangerZoneSettingsSection
					orgName={data.orgName}
					{form}
					{transferOwnershipCandidates}
					bind:transferTargetId
					onTransferConfirm={() => (showTransferConfirm = true)}
					onDeleteConfirm={() => (showDeleteConfirm = true)}
				/>
			{/if}
		</Tabs.Content>
	</Tabs.Root>
</main>

{#if showDeleteConfirm}
	<AppDialog.Root
		bind:open={showDeleteConfirm}
		closeBlocked={deleteOrganizationCloseBlocked}
		onClose={closeDeleteOrganizationDialog}
	>
		<AppDialog.Content closeBlocked={deleteOrganizationCloseBlocked}>
			<AppDialog.Header>
				<AppDialog.Title>Delete Organization</AppDialog.Title>
				<AppDialog.Description>
					This will permanently delete {data.orgName} and all associated data. This action cannot be undone.
				</AppDialog.Description>
			</AppDialog.Header>

			<AppDialog.Body>
				<form
					id="delete-org-form"
					method="POST"
					action="?/deleteOrganization"
					class="grid gap-3"
					use:enhance={() => {
						loading = true;
						return async ({ update }) => {
							loading = false;
							await update();
						};
					}}
					onsubmit={(event) => {
						if (!deleteConfirmMatches) event.preventDefault();
					}}
				>
					<Label for="confirmDelete">Type {data.orgName} to confirm</Label>
					<Input
						id="confirmDelete"
						name="confirmName"
						type="text"
						bind:value={deleteConfirmText}
						placeholder="Enter organization name"
						autocomplete="off"
					/>
				</form>
			</AppDialog.Body>

			<AppDialog.Footer>
				<Button type="button" variant="outline" onclick={closeDeleteOrganizationDialog}>Cancel</Button>
				<Button type="submit" form="delete-org-form" variant="destructive" disabled={loading || !deleteConfirmMatches}>
					{loading ? 'Deleting...' : 'Delete Permanently'}
				</Button>
			</AppDialog.Footer>
		</AppDialog.Content>
	</AppDialog.Root>
{/if}

{#if showTransferConfirm && transferTargetId}
	<AppDialog.Root bind:open={showTransferConfirm} closeBlocked={loading}>
		<AppDialog.Content closeBlocked={loading}>
			<AppDialog.Header>
				<AppDialog.Title>Transfer Ownership</AppDialog.Title>
				<AppDialog.Description>
					You will become an Admin member and lose owner privileges. This action cannot be undone by you.
				</AppDialog.Description>
			</AppDialog.Header>

			<AppDialog.Body>
				{#if form?.transferError}<p class="text-sm text-destructive">{form.transferError}</p>{/if}

				<form
					id="transfer-ownership-form"
					method="POST"
					action="?/transferOwnership"
					use:enhance={() => {
						loading = true;
						return async ({ update }) => {
							loading = false;
							showTransferConfirm = false;
							await update();
						};
					}}
				>
					<input type="hidden" name="newOwnerId" value={transferTargetId} />
				</form>
			</AppDialog.Body>

			<AppDialog.Footer>
				<Button type="button" variant="outline" onclick={() => (showTransferConfirm = false)}>Cancel</Button>
				<Button type="submit" form="transfer-ownership-form" variant="destructive" disabled={loading}>
					{loading ? 'Transferring...' : 'Transfer Ownership'}
				</Button>
			</AppDialog.Footer>
		</AppDialog.Content>
	</AppDialog.Root>
{/if}

{#if confirmPermanentDelete}
	<AppDialog.Root open={Boolean(confirmPermanentDelete)} onClose={() => (confirmPermanentDelete = null)}>
		<AppDialog.Content>
			<AppDialog.Header>
				<AppDialog.Title>Permanently Delete Personnel</AppDialog.Title>
				<AppDialog.Description>
					Are you sure you want to permanently delete {confirmPermanentDelete.name}? This action cannot be undone and
					all associated records will be lost.
				</AppDialog.Description>
			</AppDialog.Header>
			<AppDialog.Footer>
				<Button type="button" variant="outline" onclick={() => (confirmPermanentDelete = null)}>Cancel</Button>
				<Button type="button" variant="destructive" onclick={() => handlePermanentDelete(confirmPermanentDelete!.id)}>
					Permanently Delete
				</Button>
			</AppDialog.Footer>
		</AppDialog.Content>
	</AppDialog.Root>
{/if}

{#if pendingRemoveMemberForm}
	<AppDialog.Root
		open={Boolean(pendingRemoveMemberForm)}
		onOpenChange={(open) => {
			if (!open) {
				pendingRemoveMemberForm = null;
				pendingRemoveMemberEmail = '';
			}
		}}
	>
		<AppDialog.Content>
			<AppDialog.Header>
				<AppDialog.Title>Remove Member</AppDialog.Title>
				<AppDialog.Description>Remove {pendingRemoveMemberEmail} from this organization?</AppDialog.Description>
			</AppDialog.Header>
			<AppDialog.Footer>
				<Button
					type="button"
					variant="outline"
					onclick={() => {
						pendingRemoveMemberForm = null;
						pendingRemoveMemberEmail = '';
					}}>Cancel</Button
				>
				<Button
					type="button"
					variant="destructive"
					onclick={() => {
						pendingRemoveMemberForm?.requestSubmit();
						pendingRemoveMemberForm = null;
						pendingRemoveMemberEmail = '';
					}}>Remove</Button
				>
			</AppDialog.Footer>
		</AppDialog.Content>
	</AppDialog.Root>
{/if}

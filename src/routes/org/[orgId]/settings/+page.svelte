<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import { Edit, RefreshCw, Trash2, UserPlus } from '@lucide/svelte';
	import { explainPolicyReasonCode } from '$lib/access/policyDecisionExplanations';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as AppDialog from '$lib/components/ui/app-dialog/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as RadioGroup from '$lib/components/ui/radio-group/index.js';
	import * as PageShell from '$lib/components/ui/page-shell/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
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
		pluralize
	} from './settingsWorkspaceFormatters';
	import { createSettingsWorkspaceState } from './settingsWorkspaceState.svelte';
	import type { EditableMembershipRole, EditablePreset } from './settingsMemberAccessWorkspace.svelte';
	import type { SettingsMemberAccessRow } from './settingsMemberAccessModel';

	let { data, form } = $props();
	const orgId = $derived($page.params.orgId);

	type SectionId = 'organization' | 'members' | 'policies' | 'archived' | 'data-export' | 'danger';
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
	const organizationSection = $derived(data.workspace.sections.organization);
	const membersSection = $derived(data.workspace.sections.members);
	const archivedPersonnelSection = $derived({
		rows: settingsState.archivedPersonnel.rows,
		retention: settingsState.archivedPersonnel.retention,
		commands: settingsState.archivedPersonnel.commands
	});
	const dataExportSection = $derived(settingsState.dataExport.section);
	const dangerZoneSection = $derived(settingsState.dangerZone.section);
	const currentMember = $derived(data.workspace.currentMember);
	const isOwner = $derived(currentMember.isOwner);
	const sections = $derived(isOwner ? [...standardSections, ownerSection] : standardSections);

	let activeSection = $state<SectionId>('organization');
	let activityCollapsed = $state(false);
	let loading = $state(false);
	let pendingRemoveMemberForm = $state<HTMLFormElement | null>(null);
	let pendingRemoveMemberEmail = $state('');

	let restoring = $state<string | null>(null);
	let exportingPerson = $state<string | null>(null);

	const memberAccess = settingsState.members;
	const sortedMembers = $derived(memberAccess.sortedMembers);
	const availablePresetOptions = $derived(memberAccess.availablePresetOptions);
	const availableMembershipRoleOptions = $derived(memberAccess.availableMembershipRoleOptions);
	const accessLanes = memberAccess.accessLanes;
	const capabilityOptions = memberAccess.capabilityOptions;
	const governanceRoleExplanation = explainPolicyReasonCode('denied:governance-role');

	const activeSectionConfig = $derived(sections.find((section) => section.id === activeSection) ?? sections[0]);
	const activeSectionDescription = $derived(getSectionDescription(activeSection));
	const nextPurgeDate = $derived.by(() => {
		if (archivedPersonnelSection.rows.length === 0) return null;
		const purgeTimes = archivedPersonnelSection.rows.map((person) =>
			addMonths(new Date(person.archivedAt), archivedPersonnelSection.retention.months).getTime()
		);
		return new Date(Math.min(...purgeTimes));
	});
	const auditEntriesLast30Days = $derived.by(() => {
		if (typeof dataExportSection.activity.auditLog.last30DaysCount === 'number') {
			return dataExportSection.activity.auditLog.last30DaysCount;
		}
		const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
		return dataExportSection.activity.auditLog.logs.filter((log) => new Date(log.createdAt).getTime() >= cutoff).length;
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
			value: String(archivedPersonnelSection.rows.length),
			detail: nextPurgeDate
				? `Next purge ${formatCompactDate(nextPurgeDate)}`
				: archivedPersonnelSection.retention.purgeSummary,
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
				readOnlyReason: null,
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
	const planUsageSummary = $derived(data.planUsageSummary ?? null);
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
				return 'Control who can view, update, and manage each part of the organization. Admin authority stays separate.';
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

	function getPresetLabel(value: string | null | undefined): string {
		return availablePresetOptions.find((option) => option.value === value)?.label ?? 'Select access level';
	}

	function getCapabilityLabel(value: string): string {
		return capabilityOptions.find((option) => option.value === value)?.label ?? value;
	}

	function closeDeleteOrganizationDialog() {
		settingsState.dangerZone.closeDeleteConfirmation();
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
		if (settingsState.dataExport.isExporting || settingsState.dataExport.exportLimitReached) return;
		settingsState.dataExport.beginExport(format);
		const endpoint = format === 'json' ? 'export' : 'export-excel';
		const fallbackName = `org-export-${data.orgId}.${format === 'json' ? 'json' : 'xlsx'}`;

		try {
			const res = await fetch(`/org/${data.orgId}/api/${endpoint}`, { method: 'POST' });

			if (!res.ok) {
				if (res.headers.get('Content-Type')?.includes('application/json')) {
					const body = await res.json();
					settingsState.dataExport.markExportFailed(body.error || 'Export failed. Please try again.');
				} else {
					settingsState.dataExport.markExportFailed('Export failed. Please try again.');
				}
				return;
			}

			const blob = await res.blob();
			const disposition = res.headers.get('Content-Disposition');
			const filenameMatch = disposition?.match(/filename="(.+)"/);
			const filename = filenameMatch?.[1] ?? fallbackName;
			downloadBlob(blob, filename);
			settingsState.dataExport.markExportSucceeded();
		} catch {
			settingsState.dataExport.markExportFailed('Export failed. Please try again.');
		} finally {
			settingsState.dataExport.finishExport();
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
			settingsState.archivedPersonnel.clearPermanentDeleteConfirmation();
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
	<title>Settings - {organizationSection.name} - Troop to Task</title>
</svelte:head>

<PageShell.Root width="wide" bodyClass="gap-5">
	<PageShell.Header
		title="Organization Settings"
		subtitle={`${organizationSection.name} governance, access, policies, retention, and export controls.`}
	>
		{#snippet meta()}
			<Badge variant="outline">{isOwner ? 'Owner access' : 'Admin access'}</Badge>
		{/snippet}
		{#snippet actions()}
			{#if activeSection === 'members' && membersSection.canInvite}
				<Button href="#invite-member-section">
					<UserPlus />
					Invite Member
				</Button>
			{/if}
		{/snippet}
	</PageShell.Header>

	<section class="rounded-lg border bg-border p-px" aria-label="Organization settings summary">
		<div class="grid grid-cols-2 gap-px overflow-hidden rounded-[calc(var(--radius-lg)-1px)] md:grid-cols-4">
			{#each summaryRows as row (row.label)}
				<button
					type="button"
					aria-pressed={activeSection === row.target}
					aria-label={`${row.label} ${row.value}. ${row.detail}. Show settings section.`}
					class={[
						'grid min-h-24 gap-1 bg-card p-3 text-left text-card-foreground transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-ring',
						activeSection === row.target && 'bg-muted'
					]}
					onclick={() => (activeSection = row.target)}
				>
					<span class="text-sm font-medium">{row.label}</span>
					<strong class="text-2xl font-semibold tracking-tight">{row.value}</strong>
					<span class="text-xs text-muted-foreground">{row.detail}</span>
				</button>
			{/each}
		</div>
	</section>

	<Tabs.Root bind:value={activeSection} class="grid gap-4">
		<div class="-mx-4 overflow-x-auto overflow-y-hidden px-4 py-0.5 md:mx-0 md:px-0">
			<Tabs.List class="w-max min-w-full justify-start">
				{#each sections as section (section.id)}
					<Tabs.Trigger value={section.id} class="flex-none px-3">{section.label}</Tabs.Trigger>
				{/each}
			</Tabs.List>
		</div>

		{#if activeSectionDescription}
			<section class="grid gap-1" aria-labelledby="settings-section-title">
				<p class="text-sm text-muted-foreground">{activeSectionConfig.eyebrow}</p>
				<h2 id="settings-section-title" class="text-xl font-semibold tracking-tight">{activeSectionConfig.label}</h2>
				<p class="max-w-3xl text-sm text-muted-foreground">{activeSectionDescription}</p>
			</section>
		{/if}

		<Tabs.Content value="organization" class="grid gap-4">
			<OrganizationSettingsSection
				organization={organizationSection}
				{form}
				bind:loading
				{planBadge}
				{planPrice}
				{planCopy}
				{billingStatus}
				{personnelCount}
				{planUsageSummary}
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
							Set each member's access level, then narrow it to specific groups when needed. {governanceRoleExplanation}
						</p>
					</div>
					<Badge variant="outline">{membersSection.rows.length} {pluralize('Member', membersSection.rows.length)}</Badge
					>
				</div>
				<Separator />
				<div class="rounded-md border bg-muted/30 p-3 text-sm">
					<strong>Admin authority is separate from member access.</strong>
				</div>

				<div class="grid gap-3" role="list" aria-label="Organization members">
					{#each sortedMembers as member (member.id)}
						{@const accessShape = memberAccess.getMemberAccessShape(member)}
						{@const accessBadge = memberAccess.getMemberAccessBadge(member, accessShape)}
						{@const selectedMembershipRole = memberAccess.getSelectedMembershipRole(member)}
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
										{isOwner ? 'Manage Role & Access' : 'Manage Access'}
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
									<input type="hidden" name="membershipRole" value={selectedMembershipRole} />
									<div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
										<Field.Root>
											<Field.Label id="membership-role-label-{member.id}">Membership Role</Field.Label>
											{#if isOwner}
												<Select.Root
													type="single"
													value={selectedMembershipRole}
													onValueChange={(value) =>
														memberAccess.setMemberMembershipRole(member.id, value as EditableMembershipRole)}
												>
													<Select.Trigger
														aria-labelledby="membership-role-label-{member.id}"
														class="w-full md:min-w-56"
													>
														{memberAccess.getGovernanceRoleLabel(selectedMembershipRole)}
													</Select.Trigger>
													<Select.Content>
														{#each availableMembershipRoleOptions as option (option.value)}
															<Select.Item value={option.value} label={option.label} />
														{/each}
													</Select.Content>
												</Select.Root>
											{:else}
												<p class="rounded-md border bg-background px-3 py-2 text-sm">
													{memberAccess.getGovernanceRoleLabel(selectedMembershipRole)}
												</p>
											{/if}
											<Field.Description
												>{memberAccess.getGovernanceRoleHelper(selectedMembershipRole)}</Field.Description
											>
										</Field.Root>
										{#if selectedMembershipRole === 'member'}
											<Field.Root>
												<Field.Label id="access-level-label-{member.id}">Member Preset</Field.Label>
												<input type="hidden" name="memberPreset" value={selectedPreset} />
												<Select.Root
													type="single"
													value={selectedPreset}
													onValueChange={(value) => memberAccess.setMemberPreset(member.id, value as EditablePreset)}
												>
													<Select.Trigger aria-labelledby="access-level-label-{member.id}" class="w-full md:min-w-56">
														{getPresetLabel(selectedPreset)}
													</Select.Trigger>
													<Select.Content>
														{#each availablePresetOptions as option (option.value)}
															<Select.Item value={option.value} label={option.label} />
														{/each}
													</Select.Content>
												</Select.Root>
												<Field.Description>{memberAccess.getAccessOptionHelper(selectedPreset)}</Field.Description>
											</Field.Root>
										{:else}
											<input type="hidden" name="memberPreset" value={selectedPreset} />
										{/if}
										<div class="flex flex-wrap items-end gap-2">
											<Button type="submit" size="sm" disabled={loading}>
												{loading ? 'Saving...' : 'Save Member'}
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
													onclick={() => settingsState.dangerZone.openTransferConfirmation(member.userId)}
												>
													Transfer Ownership
												</Button>
											{/if}
										</div>
									</div>

									{#if selectedMembershipRole === 'member'}
										<input type="hidden" name="scopeSetKind" value={selectedScopeKind} />
										<div class="grid gap-4 md:grid-cols-2">
											<section
												class="grid gap-3 rounded-md border bg-card p-3"
												aria-labelledby="capability-overrides-{member.id}"
											>
												<div class="grid gap-1">
													<h4 id="capability-overrides-{member.id}" class="font-medium">Area-by-area access</h4>
													<p class="text-sm text-muted-foreground">
														Use this only when the access level is too broad or too limited for one area.
													</p>
												</div>
												<div class="grid gap-3 sm:grid-cols-2">
													{#each accessLanes as lane (lane.id)}
														{@const capabilityValue = memberAccess.getEditorCapabilityValue(
															member,
															lane.id,
															selectedPreset
														)}
														<Field.Root>
															<Field.Label id="capability-{member.id}-{lane.id}">{lane.label}</Field.Label>
															<input type="hidden" name="capabilityOverride:{lane.id}" value={capabilityValue} />
															<Select.Root
																type="single"
																value={capabilityValue}
																onValueChange={(value) =>
																	memberAccess.setMemberCapability(member.id, lane.id, value as typeof capabilityValue)}
															>
																<Select.Trigger aria-labelledby="capability-{member.id}-{lane.id}" class="w-full">
																	{getCapabilityLabel(capabilityValue)}
																</Select.Trigger>
																<Select.Content>
																	{#each capabilityOptions as option (option.value)}
																		<Select.Item value={option.value} label={option.label} />
																	{/each}
																</Select.Content>
															</Select.Root>
														</Field.Root>
													{/each}
												</div>
											</section>
											<section class="grid gap-3 rounded-md border bg-card p-3" aria-labelledby="scope-set-{member.id}">
												<div class="grid gap-1">
													<h4 id="scope-set-{member.id}" class="font-medium">Group access</h4>
													<p class="text-sm text-muted-foreground">
														Choose whether this access applies to every group or only selected groups.
													</p>
												</div>
												<RadioGroup.Root
													value={selectedScopeKind}
													onValueChange={(value) =>
														memberAccess.setMemberScopeKind(member.id, value as 'organization' | 'groups')}
													class="sm:grid-cols-2"
												>
													<Field.Root orientation="horizontal">
														<RadioGroup.Item id="scope-all-{member.id}" value="organization" />
														<Field.Label for="scope-all-{member.id}">All groups</Field.Label>
													</Field.Root>
													<Field.Root orientation="horizontal">
														<RadioGroup.Item id="scope-groups-{member.id}" value="groups" />
														<Field.Label for="scope-groups-{member.id}">Selected groups</Field.Label>
													</Field.Root>
												</RadioGroup.Root>
												{#if selectedScopeKind === 'groups'}
													<div class="grid gap-2">
														{#each membersSection.groups as group (group.id)}
															{@const checked = selectedScopeGroupIds.includes(group.id)}
															{#if checked}<input type="hidden" name="scopeSetGroupIds" value={group.id} />{/if}
															<Field.Root orientation="horizontal">
																<Checkbox
																	id="scope-group-{member.id}-{group.id}"
																	{checked}
																	onCheckedChange={(value) =>
																		memberAccess.toggleMemberScopeGroup(member.id, group.id, value === true)}
																/>
																<Field.Label for="scope-group-{member.id}-{group.id}">{group.name}</Field.Label>
															</Field.Root>
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
							Create an invite they can accept after signing in. T2T sends the invitation email.
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
						<input type="hidden" name="membershipRole" value={memberAccess.inviteMembershipRole} />
						<div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem_14rem_auto]">
							<div class="grid gap-2">
								<Label for="invite-email">Email address</Label>
								<Input
									id="invite-email"
									name="email"
									type="email"
									placeholder="colleague@example.com"
									bind:value={memberAccess.inviteEmail}
									required
								/>
							</div>
							{#if isOwner}
								<Field.Root>
									<Field.Label id="invite-membership-role-label">Membership Role</Field.Label>
									<Select.Root
										type="single"
										value={memberAccess.inviteMembershipRole}
										onValueChange={(value) => memberAccess.setInviteMembershipRole(value as EditableMembershipRole)}
									>
										<Select.Trigger aria-labelledby="invite-membership-role-label" class="w-full">
											{memberAccess.getGovernanceRoleLabel(memberAccess.inviteMembershipRole)}
										</Select.Trigger>
										<Select.Content>
											{#each availableMembershipRoleOptions as option (option.value)}
												<Select.Item value={option.value} label={option.label} />
											{/each}
										</Select.Content>
									</Select.Root>
								</Field.Root>
							{/if}
							<Field.Root>
								<Field.Label id="invite-access-level-label">Member Preset</Field.Label>
								{#if memberAccess.inviteMembershipRole === 'member'}
									<input type="hidden" name="memberPreset" value={memberAccess.invitePreset} />
									<Select.Root type="single" bind:value={memberAccess.invitePreset}>
										<Select.Trigger aria-label="Invite member preset" class="w-full">
											{getPresetLabel(memberAccess.invitePreset)}
										</Select.Trigger>
										<Select.Content>
											{#each availablePresetOptions as option (option.value)}
												<Select.Item value={option.value} label={option.label} />
											{/each}
										</Select.Content>
									</Select.Root>
								{:else}
									<p class="rounded-md border bg-background px-3 py-2 text-sm">Uses Admin authority</p>
								{/if}
							</Field.Root>
							<div class="flex items-end">
								<Button type="submit" disabled={loading}>
									{loading ? 'Inviting...' : 'Invite'}
								</Button>
							</div>
						</div>
						{#if memberAccess.inviteMembershipRole === 'member'}
							<div class="mt-4 grid gap-3 rounded-md border bg-muted/30 p-3">
								<input type="hidden" name="scopeSetKind" value={memberAccess.inviteScopeKind} />
								<RadioGroup.Root
									value={memberAccess.inviteScopeKind}
									onValueChange={(value) => memberAccess.setInviteScopeKind(value as 'organization' | 'groups')}
									class="sm:grid-cols-2"
								>
									<Field.Root orientation="horizontal">
										<RadioGroup.Item id="invite-scope-all" value="organization" />
										<Field.Label for="invite-scope-all">All groups</Field.Label>
									</Field.Root>
									<Field.Root orientation="horizontal">
										<RadioGroup.Item id="invite-scope-groups" value="groups" />
										<Field.Label for="invite-scope-groups">Selected groups</Field.Label>
									</Field.Root>
								</RadioGroup.Root>
								{#if memberAccess.inviteScopeKind === 'groups'}
									<div class="grid gap-2">
										{#each membersSection.groups as group (group.id)}
											{@const checked = memberAccess.inviteScopeGroupIds.includes(group.id)}
											{#if checked}<input type="hidden" name="scopeSetGroupIds" value={group.id} />{/if}
											<Field.Root orientation="horizontal">
												<Checkbox
													id="invite-scope-group-{group.id}"
													{checked}
													onCheckedChange={(value) => memberAccess.toggleInviteScopeGroup(group.id, value === true)}
												/>
												<Field.Label for="invite-scope-group-{group.id}">{group.name}</Field.Label>
											</Field.Root>
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
									<p class="text-sm text-muted-foreground">
										{invite.deliveryStatusLabel}
										{#if invite.deliverySentAt}
											{formatRelativeDate(invite.deliverySentAt)}
										{:else if invite.deliveryUpdatedAt}
											{formatRelativeDate(invite.deliveryUpdatedAt)}
										{/if}
									</p>
								</div>
								<div class="flex flex-wrap gap-2">
									<form method="POST" action="?/resendInvite" use:enhance>
										<input type="hidden" name="inviteId" value={invite.id} />
										<Button type="submit" variant="outline" size="sm" disabled={!invite.canResend}>
											<RefreshCw class="mr-2 size-4" />
											Resend
										</Button>
									</form>
									<form method="POST" action="?/revokeInvite" use:enhance>
										<input type="hidden" name="inviteId" value={invite.id} />
										<Button type="submit" variant="outline" size="sm">Revoke</Button>
									</form>
								</div>
							</div>
						{/each}
					</div>
				</section>
			{/if}

			{#if membersSection.invitationHistory.length > 0}
				<section
					class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground"
					aria-labelledby="invitation-history-heading"
				>
					<div class="flex items-center justify-between gap-3">
						<h3 id="invitation-history-heading" class="text-lg font-semibold tracking-tight">Invitation History</h3>
						<Badge variant="secondary">{membersSection.invitationHistory.length} Closed</Badge>
					</div>
					<div class="grid gap-3">
						{#each membersSection.invitationHistory as invite (invite.id)}
							{@const invitePermissionPreset = memberAccess.getInvitePreset(invite)}
							<div class="flex flex-col gap-2 rounded-md border p-3 md:flex-row md:items-center md:justify-between">
								<div>
									<p class="font-medium">{invite.email}</p>
									<p class="text-sm text-muted-foreground">
										{memberAccess.getAccessLabel(invitePermissionPreset)} · {invite.lifecycleStatusLabel}
										{formatRelativeDate(invite.lifecycleAt)}
									</p>
									{#if invite.lifecycleDetail}
										<p class="text-sm text-muted-foreground">{invite.lifecycleDetail}</p>
									{/if}
								</div>
								<Badge variant="outline">{invite.lifecycleStatusLabel}</Badge>
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
				section={archivedPersonnelSection}
				{restoring}
				{exportingPerson}
				onRestore={handleRestore}
				onExport={handlePersonnelExport}
				onConfirmPermanentDelete={(person) => settingsState.archivedPersonnel.openPermanentDeleteConfirmation(person)}
			/>
		</Tabs.Content>

		<Tabs.Content value="data-export" class="grid gap-4">
			<DataExportSettingsSection
				orgId={data.orgId}
				section={dataExportSection}
				exportError={settingsState.dataExport.exportError}
				exportSuccess={settingsState.dataExport.exportSuccess}
				exportingOrgJson={settingsState.dataExport.exportingOrgJson}
				exportingOrgExcel={settingsState.dataExport.exportingOrgExcel}
				onExportOrganization={handleOrganizationExport}
			/>
			<SettingsActivityRail
				orgId={data.orgId}
				activity={dataExportSection.activity}
				bind:collapsed={activityCollapsed}
			/>
		</Tabs.Content>

		<Tabs.Content value="danger" class="grid gap-4">
			{#if isOwner}
				<DangerZoneSettingsSection
					orgName={organizationSection.name}
					{form}
					section={dangerZoneSection}
					bind:transferTargetId={settingsState.dangerZone.transferTargetId}
					onTransferConfirm={() => settingsState.dangerZone.openTransferConfirmation()}
					onDeleteConfirm={() => settingsState.dangerZone.openDeleteConfirmation()}
				/>
			{/if}
		</Tabs.Content>
	</Tabs.Root>
</PageShell.Root>

{#if settingsState.dangerZone.showDeleteConfirm}
	<AppDialog.Root
		bind:open={settingsState.dangerZone.showDeleteConfirm}
		closeBlocked={loading || settingsState.dangerZone.deleteOrganizationCloseBlocked}
		onClose={closeDeleteOrganizationDialog}
	>
		<AppDialog.Content closeBlocked={loading || settingsState.dangerZone.deleteOrganizationCloseBlocked}>
			<AppDialog.Header>
				<AppDialog.Title>Delete Organization</AppDialog.Title>
				<AppDialog.Description>
					This will permanently delete {organizationSection.name} and all associated data. This action cannot be undone.
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
						if (!settingsState.dangerZone.deleteConfirmMatches) event.preventDefault();
					}}
				>
					<Label for="confirmDelete">Type {organizationSection.name} to confirm</Label>
					<Input
						id="confirmDelete"
						name="confirmName"
						type="text"
						bind:value={settingsState.dangerZone.deleteConfirmText}
						placeholder="Enter organization name"
						autocomplete="off"
					/>
				</form>
			</AppDialog.Body>

			<AppDialog.Footer>
				<Button type="button" variant="outline" disabled={loading} onclick={closeDeleteOrganizationDialog}
					>Cancel</Button
				>
				<Button
					type="submit"
					form="delete-org-form"
					variant="destructive"
					disabled={loading || !settingsState.dangerZone.deleteConfirmMatches}
				>
					{loading ? 'Deleting...' : 'Delete Permanently'}
				</Button>
			</AppDialog.Footer>
		</AppDialog.Content>
	</AppDialog.Root>
{/if}

{#if settingsState.dangerZone.showTransferConfirm && settingsState.dangerZone.transferTargetId}
	<AppDialog.Root
		bind:open={settingsState.dangerZone.showTransferConfirm}
		closeBlocked={loading || settingsState.dangerZone.transferCloseBlocked}
		onClose={() => settingsState.dangerZone.closeTransferConfirmation()}
	>
		<AppDialog.Content closeBlocked={loading || settingsState.dangerZone.transferCloseBlocked}>
			<AppDialog.Header>
				<AppDialog.Title>Transfer Ownership</AppDialog.Title>
				<AppDialog.Description>
					Transfer owner authority to {settingsState.dangerZone.selectedTransferCandidate?.email ??
						'the selected member'}. You will become an Admin member and lose owner privileges.
				</AppDialog.Description>
			</AppDialog.Header>

			<AppDialog.Body>
				{#if form?.transferError}<p class="text-sm text-destructive">{form.transferError}</p>{/if}
				<div class="grid gap-3 rounded-md border bg-muted/30 p-3 text-sm">
					<p class="font-medium">This action cannot be undone by you.</p>
					<p class="text-muted-foreground">
						Confirm the target before transferring ownership. The new owner can remove owner-only controls from your
						account.
					</p>
				</div>

				<form
					id="transfer-ownership-form"
					method="POST"
					action="?/transferOwnership"
					class="grid gap-2"
					use:enhance={() => {
						loading = true;
						return async ({ update }) => {
							loading = false;
							settingsState.dangerZone.closeTransferConfirmation();
							await update();
						};
					}}
				>
					<input type="hidden" name="newOwnerId" value={settingsState.dangerZone.transferTargetId} />
					<Label for="confirmTransferOwner"
						>Type {settingsState.dangerZone.selectedTransferCandidate?.email ?? 'the member email'} to confirm</Label
					>
					<Input
						id="confirmTransferOwner"
						type="text"
						bind:value={settingsState.dangerZone.transferConfirmText}
						placeholder={settingsState.dangerZone.selectedTransferCandidate?.email ?? 'member@example.com'}
						autocomplete="off"
					/>
				</form>
			</AppDialog.Body>

			<AppDialog.Footer>
				<Button
					type="button"
					variant="outline"
					disabled={loading}
					onclick={() => settingsState.dangerZone.closeTransferConfirmation()}>Cancel</Button
				>
				<Button
					type="submit"
					form="transfer-ownership-form"
					variant="destructive"
					disabled={loading || !settingsState.dangerZone.transferConfirmMatches}
				>
					{loading ? 'Transferring...' : 'Transfer Ownership'}
				</Button>
			</AppDialog.Footer>
		</AppDialog.Content>
	</AppDialog.Root>
{/if}

{#if settingsState.archivedPersonnel.confirmPermanentDelete}
	<AppDialog.Root
		open={Boolean(settingsState.archivedPersonnel.confirmPermanentDelete)}
		onClose={() => settingsState.archivedPersonnel.clearPermanentDeleteConfirmation()}
	>
		<AppDialog.Content>
			<AppDialog.Header>
				<AppDialog.Title>Permanently Delete Personnel</AppDialog.Title>
				<AppDialog.Description>
					Permanently delete {settingsState.archivedPersonnel.confirmPermanentDelete.name}. This action cannot be undone
					and all associated records will be lost.
				</AppDialog.Description>
			</AppDialog.Header>
			<AppDialog.Body>
				<div class="grid gap-3 rounded-md border bg-muted/30 p-3 text-sm">
					<p class="font-medium">Export the record first if it may be needed later.</p>
					<p class="text-muted-foreground">
						Deleting removes the archived personnel record and its associated records from TroopToTask.
					</p>
				</div>
				<div class="grid gap-2">
					<Label for="confirmPermanentDeletePersonnel"
						>Type {settingsState.archivedPersonnel.confirmPermanentDelete.name} to confirm</Label
					>
					<Input
						id="confirmPermanentDeletePersonnel"
						type="text"
						bind:value={settingsState.archivedPersonnel.permanentDeleteConfirmText}
						placeholder="Enter archived personnel name"
						autocomplete="off"
					/>
				</div>
			</AppDialog.Body>
			<AppDialog.Footer>
				<Button
					type="button"
					variant="outline"
					onclick={() => settingsState.archivedPersonnel.clearPermanentDeleteConfirmation()}>Cancel</Button
				>
				<Button
					type="button"
					variant="destructive"
					disabled={!settingsState.archivedPersonnel.permanentDeleteConfirmMatches}
					onclick={() => handlePermanentDelete(settingsState.archivedPersonnel.confirmPermanentDelete!.id)}
				>
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

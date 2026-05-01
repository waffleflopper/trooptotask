<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import type { CriticalTasksSettings } from '$features/critical-tasks/criticalTasks.types';
	import { sortMembers } from '$features/groups/utils/sortMembers';
	import Modal from '$lib/components/Modal.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import type { OrganizationMember, PermissionPreset } from '$lib/types';
	import { getPermissionPreset } from '$lib/types';
	import { TIER_CONFIG, type EffectiveTier } from '$lib/types/subscription';
	import { addMonths, formatRelativeDate } from '$lib/utils/dates';
	import { downloadBlob } from './settingsDownloads';
	import './settingsWorkspace.css';
	import ArchivedPersonnelSettingsSection from './ArchivedPersonnelSettingsSection.svelte';
	import DangerZoneSettingsSection from './DangerZoneSettingsSection.svelte';
	import DataExportSettingsSection from './DataExportSettingsSection.svelte';
	import OrganizationSettingsSection from './OrganizationSettingsSection.svelte';
	import PoliciesSettingsSection from './PoliciesSettingsSection.svelte';
	import SettingsActivityRail from './SettingsActivityRail.svelte';
	import {
		formatCap,
		formatExportLimit,
		formatPrice,
		getPresetLabel,
		normalizeOrganizationName,
		pluralize
	} from './settingsWorkspaceFormatters';

	let { data, form } = $props();
	const orgId = $derived($page.params.orgId);

	type SectionId = 'organization' | 'members' | 'policies' | 'archived' | 'data-export' | 'danger';
	type ArchivedPerson = (typeof data.archivedPersonnel)[number];
	type ApprovalRequest = (typeof data.approvalRequests)[number];
	type AuditLog = (typeof data.auditLog.logs)[number];
	type RoleCount = { owner: number; admin: number; member: number };
	type EditablePreset = Exclude<PermissionPreset, 'owner'>;

	const sections = $derived.by(
		() =>
			[
				{ id: 'organization', label: 'Organization', eyebrow: 'Profile' },
				{ id: 'members', label: 'Members', eyebrow: 'Access Control' },
				{ id: 'policies', label: 'Policies', eyebrow: 'Operational Defaults' },
				{ id: 'archived', label: 'Archived Personnel', eyebrow: 'Retention Queue' },
				{ id: 'data-export', label: 'Data & Export', eyebrow: 'Backup & Migration' },
				...(data.isOwner ? [{ id: 'danger', label: 'Danger Zone', eyebrow: 'Owner Authority', danger: true }] : [])
			] as Array<{ id: SectionId; label: string; eyebrow: string; danger?: boolean }>
	);

	let activeSection = $state<SectionId>('organization');
	let activityCollapsed = $state(false);
	let loading = $state(false);
	let memberEditorId = $state<string | null>(null);
	let inviteEmail = $state('');
	let invitePreset = $state<Exclude<PermissionPreset, 'owner' | 'custom'>>('full-editor');
	let inviteScopedGroupId = $state('');
	let memberSelectedPreset = $state<Record<string, EditablePreset>>({});
	let memberSelectedGroupId = $state<Record<string, string>>({});
	let showTransferConfirm = $state(false);
	let transferTargetId = $state<string | null>(null);
	let pendingRemoveMemberForm = $state<HTMLFormElement | null>(null);
	let pendingRemoveMemberEmail = $state('');

	let showDeleteConfirm = $state(false);
	let deleteConfirmText = $state('');
	const normalizedOrgName = $derived(normalizeOrganizationName(data.orgName ?? ''));
	const deleteConfirmMatches = $derived(normalizeOrganizationName(deleteConfirmText) === normalizedOrgName);

	let exportingOrgJson = $state(false);
	let exportingOrgExcel = $state(false);
	let exportError = $state('');
	let exportSuccess = $state(false);

	const serverRetention = $derived(data.policies.retentionMonths);
	const serverWarningWindow = $derived(data.policies.lossWarningWindowDays);
	const serverCriticalTasksSettings = $derived(data.policies.criticalTasksSettings as CriticalTasksSettings);
	let retentionMonths = $state(0);
	let savedRetentionMonths = $state(0);
	let warningWindowDays = $state(0);
	let savedWarningWindowDays = $state(0);
	let criticalTasksDefaultExpirationMonths = $state(0);
	let savedCriticalTasksDefaultExpirationMonths = $state(0);
	let criticalTasksExpiringSoonWarningDays = $state(0);
	let savedCriticalTasksExpiringSoonWarningDays = $state(0);
	let savingRetention = $state(false);
	let savingWarningWindow = $state(false);
	let savingCriticalTasks = $state(false);
	const hasRetentionChanges = $derived(retentionMonths !== savedRetentionMonths);
	const isRetentionValid = $derived(retentionMonths >= 1 && retentionMonths <= 120);
	const hasLossWarningChanges = $derived(warningWindowDays !== savedWarningWindowDays);
	const isLossWarningValid = $derived(warningWindowDays >= 1 && warningWindowDays <= 365);
	const hasCriticalTasksChanges = $derived(
		criticalTasksDefaultExpirationMonths !== savedCriticalTasksDefaultExpirationMonths ||
			criticalTasksExpiringSoonWarningDays !== savedCriticalTasksExpiringSoonWarningDays
	);
	const isCriticalTasksValid = $derived(
		criticalTasksDefaultExpirationMonths >= 1 &&
			criticalTasksDefaultExpirationMonths <= 120 &&
			criticalTasksExpiringSoonWarningDays >= 1 &&
			criticalTasksExpiringSoonWarningDays <= 365
	);

	let restoring = $state<string | null>(null);
	let exportingPerson = $state<string | null>(null);
	let confirmPermanentDelete = $state<{ id: string; name: string } | null>(null);

	const sortedMembers = $derived(sortMembers(data.members));
	const transferOwnershipCandidates = $derived(
		sortedMembers.filter((member: OrganizationMember) => data.isOwner && member.role !== 'owner' && member.userId)
	);
	const presetOptions: Array<{ value: Exclude<PermissionPreset, 'owner' | 'custom'>; label: string }> = [
		{ value: 'admin', label: 'Admin' },
		{ value: 'full-editor', label: 'Full Editor' },
		{ value: 'team-leader', label: 'Team Leader' },
		{ value: 'viewer', label: 'Viewer' }
	];
	const availablePresetOptions = $derived(
		data.isOwner ? presetOptions : presetOptions.filter((option) => option.value !== 'admin')
	);

	const activeSectionConfig = $derived(sections.find((section) => section.id === activeSection) ?? sections[0]);
	const roleCounts = $derived.by(() =>
		data.members.reduce(
			(counts: RoleCount, member: { role: string }) => {
				if (member.role === 'owner' || member.role === 'admin' || member.role === 'member') counts[member.role] += 1;
				return counts;
			},
			{ owner: 0, admin: 0, member: 0 }
		)
	);
	const memberRoleSummary = $derived(
		`${roleCounts.owner} ${pluralize('Owner', roleCounts.owner)} · ${roleCounts.admin} ${pluralize('Admin', roleCounts.admin)} · ${roleCounts.member} ${pluralize('Member', roleCounts.member)}`
	);
	const oldestPendingApproval = $derived.by(() => {
		const pending = data.approvalRequests
			.filter((request: ApprovalRequest) => request.status === 'pending')
			.sort(
				(a: ApprovalRequest, b: ApprovalRequest) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
			);
		return pending[0] ?? null;
	});
	const nextPurgeDate = $derived.by(() => {
		if (data.archivedPersonnel.length === 0) return null;
		const purgeTimes = data.archivedPersonnel.map((person: ArchivedPerson) =>
			addMonths(new Date(person.archivedAt), data.policies.retentionMonths).getTime()
		);
		return new Date(Math.min(...purgeTimes));
	});
	const auditEntriesLast30Days = $derived.by(() => {
		if (typeof data.auditLog.last30DaysCount === 'number') return data.auditLog.last30DaysCount;
		const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
		return data.auditLog.logs.filter((log: AuditLog) => new Date(log.createdAt).getTime() >= cutoff).length;
	});
	const tier = $derived(
		data.effectiveTier ??
			({
				tier: 'free',
				source: 'default',
				personnelCount: data.members.length,
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
	const billingStatus = $derived(tier.isReadOnly ? 'Read-only' : tier.source === 'gift' ? 'Gifted access' : 'Active');

	$effect.pre(() => {
		retentionMonths = serverRetention;
		savedRetentionMonths = serverRetention;
		warningWindowDays = serverWarningWindow;
		savedWarningWindowDays = serverWarningWindow;
		criticalTasksDefaultExpirationMonths = serverCriticalTasksSettings.defaultExpirationMonths;
		savedCriticalTasksDefaultExpirationMonths = serverCriticalTasksSettings.defaultExpirationMonths;
		criticalTasksExpiringSoonWarningDays = serverCriticalTasksSettings.expiringSoonWarningDays;
		savedCriticalTasksExpiringSoonWarningDays = serverCriticalTasksSettings.expiringSoonWarningDays;
	});

	function getMemberPreset(member: OrganizationMember): PermissionPreset {
		if (member.role === 'owner') return 'owner';
		return getPermissionPreset(
			{
				canViewCalendar: member.canViewCalendar,
				canEditCalendar: member.canEditCalendar,
				canViewPersonnel: member.canViewPersonnel,
				canEditPersonnel: member.canEditPersonnel,
				canViewTraining: member.canViewTraining,
				canEditTraining: member.canEditTraining,
				canViewCriticalTasks: member.canViewCriticalTasks,
				canEditCriticalTasks: member.canEditCriticalTasks,
				canViewOnboarding: member.canViewOnboarding,
				canEditOnboarding: member.canEditOnboarding,
				canViewRatingScheme: member.canViewRatingScheme,
				canEditRatingScheme: member.canEditRatingScheme,
				canViewLeadersBook: member.canViewLeadersBook,
				canEditLeadersBook: member.canEditLeadersBook,
				canManageMembers: member.canManageMembers
			},
			member.scopedGroupId
		);
	}

	function getInvitePreset(invite: (typeof data.invitations)[number]): PermissionPreset {
		return getPermissionPreset(
			{
				canViewCalendar: invite.canViewCalendar,
				canEditCalendar: invite.canEditCalendar,
				canViewPersonnel: invite.canViewPersonnel,
				canEditPersonnel: invite.canEditPersonnel,
				canViewTraining: invite.canViewTraining,
				canEditTraining: invite.canEditTraining,
				canViewCriticalTasks: invite.canViewCriticalTasks,
				canEditCriticalTasks: invite.canEditCriticalTasks,
				canViewOnboarding: invite.canViewOnboarding,
				canEditOnboarding: invite.canEditOnboarding,
				canViewRatingScheme: invite.canViewRatingScheme,
				canEditRatingScheme: invite.canEditRatingScheme,
				canViewLeadersBook: invite.canViewLeadersBook,
				canEditLeadersBook: invite.canEditLeadersBook,
				canManageMembers: invite.canManageMembers
			},
			invite.scopedGroupId
		);
	}

	function getMemberInitials(email: string | null | undefined): string {
		const fallback = email?.trim() || 'Member';
		return fallback
			.split(/[^a-zA-Z0-9]+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase())
			.join('');
	}

	function getGroupName(groupId: string | null | undefined): string | null {
		if (!groupId) return null;
		return data.groups.find((group: { id: string; name: string }) => group.id === groupId)?.name ?? 'Unknown group';
	}

	function getMemberMeta(member: OrganizationMember, preset: PermissionPreset): string {
		const scopedGroupName = getGroupName(member.scopedGroupId);
		if (member.role === 'owner') return 'Organization owner';
		if (scopedGroupName) return `${getPresetLabel(preset)} · ${scopedGroupName}`;
		if (member.canManageMembers) return `${getPresetLabel(preset)} · Can manage access`;
		return `${getPresetLabel(preset)} · All groups`;
	}

	function isCurrentMember(member: OrganizationMember): boolean {
		const sessionEmail = (data.session as { user?: { email?: string | null } } | null | undefined)?.user?.email;
		if (sessionEmail && member.email === sessionEmail) return true;
		return Boolean(data.isOwner && member.role === 'owner');
	}

	function openMemberEditor(member: OrganizationMember, preset: PermissionPreset): void {
		if (member.role === 'owner') return;
		memberEditorId = member.id;
		memberSelectedPreset = {
			...memberSelectedPreset,
			[member.id]: preset === 'owner' ? 'full-editor' : preset
		};
		memberSelectedGroupId = {
			...memberSelectedGroupId,
			[member.id]: member.scopedGroupId ?? ''
		};
	}

	function closeMemberEditor(memberId: string): void {
		memberEditorId = null;
		const remainingPresets = { ...memberSelectedPreset };
		const remainingGroups = { ...memberSelectedGroupId };
		delete remainingPresets[memberId];
		delete remainingGroups[memberId];
		memberSelectedPreset = remainingPresets;
		memberSelectedGroupId = remainingGroups;
	}

	function roleBadgeClass(preset: PermissionPreset): string {
		return `member-role member-role--${preset.replace(/[^a-z0-9]+/g, '-')}`;
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
		if (!hasRetentionChanges || !isRetentionValid || savingRetention) return;
		savingRetention = true;
		try {
			await saveSettings({ archiveRetentionMonths: retentionMonths });
			savedRetentionMonths = retentionMonths;
			toastStore.success('Retention policy saved');
		} catch {
			toastStore.error('Failed to save retention policy');
		} finally {
			savingRetention = false;
		}
	}

	async function handleLossWarningSave() {
		if (!hasLossWarningChanges || !isLossWarningValid || savingWarningWindow) return;
		savingWarningWindow = true;
		try {
			await saveSettings({ lossWarningWindowDays: warningWindowDays });
			savedWarningWindowDays = warningWindowDays;
			toastStore.success('Warning window saved');
		} catch {
			toastStore.error('Failed to save warning window');
		} finally {
			savingWarningWindow = false;
		}
	}

	async function handleCriticalTasksSave() {
		if (!hasCriticalTasksChanges || !isCriticalTasksValid || savingCriticalTasks) return;
		savingCriticalTasks = true;
		try {
			await saveSettings({
				criticalTasksDefaultExpirationMonths,
				criticalTasksExpiringSoonWarningDays
			});
			savedCriticalTasksDefaultExpirationMonths = criticalTasksDefaultExpirationMonths;
			savedCriticalTasksExpiringSoonWarningDays = criticalTasksExpiringSoonWarningDays;
			toastStore.success('Critical Tasks settings saved');
		} catch {
			toastStore.error('Failed to save Critical Tasks settings');
		} finally {
			savingCriticalTasks = false;
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

<div class="settings-workspace" class:activity-collapsed={activityCollapsed}>
	<nav class="settings-nav" aria-label="Organization settings sections">
		<div class="settings-nav__header">
			<p>Settings</p>
			<h1>{data.orgName}</h1>
		</div>
		<div class="settings-nav__list">
			{#each sections as section, index (section.id)}
				<button
					type="button"
					class="settings-nav__item"
					class:is-active={activeSection === section.id}
					class:is-danger={section.danger}
					aria-current={activeSection === section.id ? 'page' : undefined}
					onclick={() => (activeSection = section.id)}
				>
					<span class="settings-nav__num">{String(index + 1).padStart(2, '0')}</span>
					<span class="settings-nav__label">{section.label}</span>
					<span class="settings-nav__meta">{section.eyebrow}</span>
				</button>
			{/each}
		</div>
		<div class="settings-nav__footer">
			<span>{data.isOwner ? 'Owner access' : 'Admin access'}</span>
			<span>{data.pendingApprovalsCount} pending approvals</span>
		</div>
	</nav>

	<main class="settings-main" aria-labelledby="settings-section-title">
		<div class="settings-main__header">
			<div>
				<p class="content-eyebrow">{activeSectionConfig.eyebrow}</p>
				<h2 id="settings-section-title">{activeSectionConfig.label}</h2>
				{#if activeSection === 'members'}
					<p class="content-description">Who can see and edit the roster, and how new invitations are granted.</p>
				{:else if activeSection === 'policies'}
					<p class="content-description">Retention windows, warning lead times, and shared expiration thresholds.</p>
				{:else if activeSection === 'archived'}
					<p class="content-description">Records pending automatic deletion. Restore, export, or purge early.</p>
				{:else if activeSection === 'data-export'}
					<p class="content-description">Move data in and out of T2T. JSON for backups, Excel for human review.</p>
				{:else if activeSection === 'danger'}
					<p class="content-description">Destructive actions that cannot be undone. Owner authentication required.</p>
				{/if}
			</div>
			{#if activeSection === 'members' && data.canManageMembers}
				<a class="btn btn-primary" href="#invite-member-section">+ Invite Member</a>
			{/if}
		</div>

		{#if activeSection === 'organization'}
			<OrganizationSettingsSection
				{data}
				{form}
				bind:loading
				{memberRoleSummary}
				{oldestPendingApproval}
				{nextPurgeDate}
				{auditEntriesLast30Days}
				{planBadge}
				{planPrice}
				{planCopy}
				{billingStatus}
				{personnelCount}
			/>
		{:else if activeSection === 'members'}
			<div class="members-tab">
				<section class="ledger-section" aria-labelledby="roster-access-heading">
					<div class="ledger-heading">
						<span>01</span>
						<h3 id="roster-access-heading">Roster Access</h3>
						<p class="state-label">{data.members.length} {pluralize('Member', data.members.length)}</p>
					</div>

					<div class="member-ledger" role="list" aria-label="Organization members">
						{#each sortedMembers as member (member.id)}
							{@const preset = getMemberPreset(member)}
							{@const selectedPreset = memberSelectedPreset[member.id] ?? (preset === 'owner' ? 'full-editor' : preset)}
							<div class="member-row" role="listitem">
								<div class="member-avatar" aria-hidden="true">{getMemberInitials(member.email)}</div>
								<div class="member-main">
									<p class="member-email">{member.email ?? `${member.userId.slice(0, 8)}...`}</p>
									<p class="member-meta">{getMemberMeta(member, preset)}</p>
								</div>
								<div class="member-actions">
									<span class={roleBadgeClass(preset)}>{getPresetLabel(preset)}</span>
									{#if member.role === 'owner'}
										{#if isCurrentMember(member)}<span class="member-you">You</span>{/if}
									{:else if data.canManageMembers && (member.role !== 'admin' || data.isOwner)}
										<button type="button" class="member-action" onclick={() => openMemberEditor(member, preset)}>
											Change Role
										</button>
										<form method="POST" action="?/removeMember" use:enhance>
											<input type="hidden" name="membershipId" value={member.id} />
											<button
												type="button"
												class="member-action member-action--danger"
												onclick={(event) => {
													pendingRemoveMemberForm = (event.currentTarget as HTMLButtonElement).closest('form');
													pendingRemoveMemberEmail = member.email ?? 'this member';
												}}
											>
												Remove
											</button>
										</form>
									{/if}
								</div>

								{#if memberEditorId === member.id}
									<form
										method="POST"
										action="?/updatePermissions"
										class="member-editor"
										use:enhance={() => {
											loading = true;
											return async ({ update }) => {
												loading = false;
												closeMemberEditor(member.id);
												await update();
											};
										}}
									>
										<input type="hidden" name="membershipId" value={member.id} />
										<div class="member-editor__topline">
											<label>
												<span>Role</span>
												<select
													name="preset"
													class="input"
													value={selectedPreset}
													onchange={(event) => {
														memberSelectedPreset = {
															...memberSelectedPreset,
															[member.id]: event.currentTarget.value as EditablePreset
														};
													}}
												>
													{#each availablePresetOptions as option (option.value)}
														<option value={option.value}>{option.label}</option>
													{/each}
													<option value="custom">Custom</option>
												</select>
											</label>
											{#if selectedPreset === 'team-leader'}
												<label>
													<span>Group scope</span>
													<select
														name="scopedGroupId"
														class="input"
														value={memberSelectedGroupId[member.id] ?? member.scopedGroupId ?? ''}
														onchange={(event) => {
															memberSelectedGroupId = {
																...memberSelectedGroupId,
																[member.id]: event.currentTarget.value
															};
														}}
													>
														<option value="">Select group...</option>
														{#each data.groups as group (group.id)}
															<option value={group.id}>{group.name}</option>
														{/each}
													</select>
												</label>
											{/if}
											<div class="member-editor__actions">
												<button type="submit" class="btn btn-primary btn-sm" disabled={loading}>
													{loading ? 'Saving...' : 'Save Role'}
												</button>
												<button
													type="button"
													class="btn btn-secondary btn-sm"
													onclick={() => closeMemberEditor(member.id)}
												>
													Cancel
												</button>
												{#if data.isOwner}
													<button
														type="button"
														class="member-action"
														onclick={() => {
															transferTargetId = member.userId;
															showTransferConfirm = true;
														}}
													>
														Transfer Ownership
													</button>
												{/if}
											</div>
										</div>

										{#if selectedPreset === 'custom'}
											<div class="permission-grid permission-grid--compact">
												<div class="permission-section">
													<h4>Calendar</h4>
													<label
														><input type="checkbox" name="canViewCalendar" checked={member.canViewCalendar} /> View</label
													>
													<label
														><input type="checkbox" name="canEditCalendar" checked={member.canEditCalendar} /> Edit</label
													>
												</div>
												<div class="permission-section">
													<h4>Personnel</h4>
													<label
														><input type="checkbox" name="canViewPersonnel" checked={member.canViewPersonnel} /> View</label
													>
													<label
														><input type="checkbox" name="canEditPersonnel" checked={member.canEditPersonnel} /> Edit</label
													>
												</div>
												<div class="permission-section">
													<h4>Training</h4>
													<label
														><input type="checkbox" name="canViewTraining" checked={member.canViewTraining} /> View</label
													>
													<label
														><input type="checkbox" name="canEditTraining" checked={member.canEditTraining} /> Edit</label
													>
												</div>
												<div class="permission-section">
													<h4>Critical Tasks</h4>
													<label
														><input type="checkbox" name="canViewCriticalTasks" checked={member.canViewCriticalTasks} /> View</label
													>
													<label
														><input type="checkbox" name="canEditCriticalTasks" checked={member.canEditCriticalTasks} /> Edit</label
													>
												</div>
												<div class="permission-section">
													<h4>Onboarding</h4>
													<label
														><input type="checkbox" name="canViewOnboarding" checked={member.canViewOnboarding} /> View</label
													>
													<label
														><input type="checkbox" name="canEditOnboarding" checked={member.canEditOnboarding} /> Edit</label
													>
												</div>
												<div class="permission-section">
													<h4>Rating Scheme</h4>
													<label
														><input type="checkbox" name="canViewRatingScheme" checked={member.canViewRatingScheme} /> View</label
													>
													<label
														><input type="checkbox" name="canEditRatingScheme" checked={member.canEditRatingScheme} /> Edit</label
													>
												</div>
												<div class="permission-section">
													<h4>Leader's Book</h4>
													<label
														><input type="checkbox" name="canViewLeadersBook" checked={member.canViewLeadersBook} /> View</label
													>
													<label
														><input type="checkbox" name="canEditLeadersBook" checked={member.canEditLeadersBook} /> Edit</label
													>
												</div>
												<div class="permission-section">
													<h4>Members</h4>
													<label
														><input type="checkbox" name="canManageMembers" checked={member.canManageMembers} /> Manage</label
													>
												</div>
											</div>
										{/if}
									</form>
								{/if}
							</div>
						{/each}
					</div>

					{#if form?.memberError}<div class="error-message error-message--inline">{form.memberError}</div>{/if}
					{#if form?.permissionError}<div class="error-message error-message--inline">{form.permissionError}</div>{/if}
					{#if form?.permissionSuccess}<div class="success-message success-message--inline">
							Permissions updated.
						</div>{/if}
				</section>

				{#if data.canManageMembers}
					<section id="invite-member-section" class="ledger-section" aria-labelledby="invite-member-heading">
						<div class="ledger-heading">
							<span>02</span>
							<h3 id="invite-member-heading">Invite Member</h3>
						</div>
						<form
							method="POST"
							action="?/invite"
							use:enhance={() => {
								loading = true;
								return async ({ update }) => {
									loading = false;
									await update();
									if (!form?.inviteError) inviteEmail = '';
								};
							}}
						>
							{#if form?.inviteError}<div class="error-message error-message--inline">{form.inviteError}</div>{/if}
							{#if form?.inviteSuccess}
								<div class="success-message success-message--inline">
									{form.inviteMessage ?? 'Invitation created.'}
								</div>
							{/if}
							<div class="ledger-row invite-row">
								<div>
									<label class="field-label" for="invite-email">Send invitation</label>
									<p class="field-hint">Invitee logs in to T2T to accept. No email is sent automatically.</p>
								</div>
								<div class="invite-control">
									<input
										id="invite-email"
										name="email"
										type="email"
										class="input"
										placeholder="colleague@example.com"
										bind:value={inviteEmail}
										required
									/>
									<select name="preset" class="input invite-role-select" bind:value={invitePreset}>
										{#each availablePresetOptions as option (option.value)}
											<option value={option.value}>{option.label}</option>
										{/each}
									</select>
									{#if invitePreset === 'team-leader'}
										<select name="scopedGroupId" class="input invite-role-select" bind:value={inviteScopedGroupId}>
											<option value="">Select group...</option>
											{#each data.groups as group (group.id)}
												<option value={group.id}>{group.name}</option>
											{/each}
										</select>
									{/if}
									<button type="submit" class="btn btn-primary" disabled={loading}>
										{loading ? 'Inviting...' : 'Invite'}
									</button>
								</div>
							</div>
						</form>
					</section>
				{/if}

				{#if data.invitations.length > 0}
					<section class="ledger-section" aria-labelledby="pending-invites-heading">
						<div class="ledger-heading">
							<span>03</span>
							<h3 id="pending-invites-heading">Pending Invitations</h3>
							<p class="state-label">{data.invitations.length} Pending</p>
						</div>
						<div class="member-ledger">
							{#each data.invitations as invite (invite.id)}
								{@const invitePermissionPreset = getInvitePreset(invite)}
								<div class="pending-invite-row">
									<div>
										<p class="member-email">{invite.email}</p>
										<p class="member-meta">
											{getPresetLabel(invitePermissionPreset)} · Sent {formatRelativeDate(invite.createdAt)}
										</p>
									</div>
									<form method="POST" action="?/revokeInvite" use:enhance>
										<input type="hidden" name="inviteId" value={invite.id} />
										<button type="submit" class="member-action">Revoke</button>
									</form>
								</div>
							{/each}
						</div>
					</section>
				{/if}
			</div>
		{:else if activeSection === 'policies'}
			<PoliciesSettingsSection
				bind:retentionMonths
				bind:warningWindowDays
				bind:criticalTasksDefaultExpirationMonths
				bind:criticalTasksExpiringSoonWarningDays
				{hasRetentionChanges}
				{isRetentionValid}
				{hasLossWarningChanges}
				{isLossWarningValid}
				{hasCriticalTasksChanges}
				{isCriticalTasksValid}
				{savingRetention}
				{savingWarningWindow}
				{savingCriticalTasks}
				onSaveRetention={handleRetentionSave}
				onSaveLossWarning={handleLossWarningSave}
				onSaveCriticalTasks={handleCriticalTasksSave}
			/>
		{:else if activeSection === 'archived'}
			<ArchivedPersonnelSettingsSection
				archivedPersonnel={data.archivedPersonnel}
				retentionMonths={data.policies.retentionMonths}
				{restoring}
				{exportingPerson}
				onRestore={handleRestore}
				onExport={handlePersonnelExport}
				onConfirmPermanentDelete={(person) => (confirmPermanentDelete = person)}
			/>
		{:else if activeSection === 'data-export'}
			<DataExportSettingsSection
				orgId={data.orgId}
				exportInfo={data.exportInfo}
				{exportError}
				{exportSuccess}
				{exportingOrgJson}
				{exportingOrgExcel}
				onExportOrganization={handleOrganizationExport}
			/>
		{:else if activeSection === 'danger' && data.isOwner}
			<DangerZoneSettingsSection
				orgName={data.orgName}
				{form}
				{transferOwnershipCandidates}
				bind:transferTargetId
				onTransferConfirm={() => (showTransferConfirm = true)}
				onDeleteConfirm={() => (showDeleteConfirm = true)}
			/>
		{/if}
	</main>

	<SettingsActivityRail
		orgId={data.orgId}
		pendingApprovalsCount={data.pendingApprovalsCount}
		approvalRequests={data.approvalRequests}
		auditLog={data.auditLog}
		bind:collapsed={activityCollapsed}
	/>
</div>

{#if showDeleteConfirm}
	<Modal
		title="Delete Organization"
		onClose={() => (showDeleteConfirm = false)}
		width="450px"
		titleId="delete-org-title"
	>
		<p>This will permanently delete <strong>{data.orgName}</strong> and all associated data.</p>
		<p class="danger-warning">This action cannot be undone.</p>

		<form
			id="delete-org-form"
			method="POST"
			action="?/deleteOrganization"
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
			<div class="form-group">
				<label class="label" for="confirmDelete">
					Type <strong>{data.orgName}</strong> to confirm:
				</label>
				<input
					id="confirmDelete"
					name="confirmName"
					type="text"
					class="input"
					bind:value={deleteConfirmText}
					placeholder="Enter organization name"
					autocomplete="off"
				/>
			</div>
		</form>

		{#snippet footer()}
			<button type="button" class="btn btn-secondary" onclick={() => (showDeleteConfirm = false)}>Cancel</button>
			<button type="submit" form="delete-org-form" class="btn btn-danger" disabled={loading || !deleteConfirmMatches}>
				{loading ? 'Deleting...' : 'Delete Permanently'}
			</button>
		{/snippet}
	</Modal>
{/if}

{#if showTransferConfirm && transferTargetId}
	<Modal
		title="Transfer Ownership"
		onClose={() => (showTransferConfirm = false)}
		width="400px"
		titleId="transfer-ownership-title"
	>
		<p>
			Are you sure you want to transfer ownership of this organization? You will become an Admin member and lose owner
			privileges.
		</p>
		<p class="danger-warning">This action cannot be undone by you.</p>

		{#if form?.transferError}<div class="error-message error-message--inline">{form.transferError}</div>{/if}

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

		{#snippet footer()}
			<button type="button" class="btn btn-secondary" onclick={() => (showTransferConfirm = false)}>Cancel</button>
			<button type="submit" form="transfer-ownership-form" class="btn btn-danger" disabled={loading}>
				{loading ? 'Transferring...' : 'Transfer Ownership'}
			</button>
		{/snippet}
	</Modal>
{/if}

{#if confirmPermanentDelete}
	<ConfirmDialog
		title="Permanently Delete Personnel"
		message="Are you sure you want to permanently delete {confirmPermanentDelete.name}? This action cannot be undone and all associated records will be lost."
		confirmLabel="Permanently Delete"
		variant="danger"
		onConfirm={() => handlePermanentDelete(confirmPermanentDelete!.id)}
		onCancel={() => (confirmPermanentDelete = null)}
	/>
{/if}

{#if pendingRemoveMemberForm}
	<ConfirmDialog
		title="Remove Member"
		message="Remove {pendingRemoveMemberEmail} from this organization?"
		confirmLabel="Remove"
		variant="danger"
		onConfirm={() => {
			pendingRemoveMemberForm?.requestSubmit();
			pendingRemoveMemberForm = null;
			pendingRemoveMemberEmail = '';
		}}
		onCancel={() => {
			pendingRemoveMemberForm = null;
			pendingRemoveMemberEmail = '';
		}}
	/>
{/if}

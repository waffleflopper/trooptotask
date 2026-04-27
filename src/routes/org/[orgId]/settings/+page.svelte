<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import type { CriticalTasksSettings } from '$features/critical-tasks/criticalTasks.types';
	import { sortMembers } from '$features/groups/utils/sortMembers';
	import Modal from '$lib/components/Modal.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import { isBillingEnabled } from '$lib/config/billing';
	import { toastStore } from '$lib/stores/toast.svelte';
	import type { OrganizationMember, PermissionPreset } from '$lib/types';
	import { getPermissionPreset } from '$lib/types';
	import { TIER_CONFIG, type EffectiveTier } from '$lib/types/subscription';
	import { addMonths, formatRelativeDate } from '$lib/utils/dates';

	let { data, form } = $props();
	const orgId = $derived($page.params.orgId);

	type SectionId = 'organization' | 'members' | 'policies' | 'archived' | 'data-export' | 'danger';
	type ActivityTab = 'approvals' | 'audit';
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
	let activityTab = $state<ActivityTab>('approvals');
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

	let denyingId = $state<string | null>(null);
	let denialReason = $state('');
	let processingApproval = $state<string | null>(null);
	const pendingApprovals = $derived(
		data.approvalRequests.filter((request: ApprovalRequest) => request.status === 'pending')
	);
	const visibleApprovals = $derived(pendingApprovals.slice(0, 4));
	const visibleAuditLogs = $derived(data.auditLog.logs.slice(0, 9));
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

	function normalizeOrganizationName(value: string): string {
		return value.trim().replace(/\s+/g, ' ');
	}

	function formatActionSegment(segment: string): string {
		return segment.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
	}

	function getAuditActionParts(action: string): { area: string; event: string } {
		const [area = action, ...eventParts] = action.split(/[.>]/);
		const event = eventParts.join(' ') || area;
		return {
			area: formatActionSegment(area),
			event: formatActionSegment(event)
		};
	}

	function getAuditTone(action: string): string {
		const area = action.split(/[.>_]/)[0] ?? '';
		if (['billing', 'export', 'data'].includes(area)) return 'info';
		if (['personnel', 'member', 'members'].includes(area)) return 'danger';
		if (['training', 'critical'].includes(area)) return 'success';
		if (['duty', 'calendar'].includes(area)) return 'warning';
		if (['user', 'preferences', 'user_preferences'].includes(area)) return 'neutral';
		return 'neutral';
	}

	function formatAuditTimestamp(dateStr: string): string {
		const date = new Date(dateStr);
		const day = date.toLocaleDateString('en-US', { day: '2-digit' });
		const month = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
		const time = date.toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit',
			hour12: false
		});
		return `${day} ${month} · ${time}`;
	}

	function formatRosterDate(dateStr: string): string {
		const date = new Date(dateStr);
		const day = date.toLocaleDateString('en-US', { day: '2-digit' });
		const month = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
		const year = date.toLocaleDateString('en-US', { year: '2-digit' });
		return `${day} ${month} ${year}`;
	}

	function pluralize(label: string, count: number): string {
		return count === 1 ? label : `${label}s`;
	}

	function getPresetLabel(preset: PermissionPreset): string {
		switch (preset) {
			case 'owner':
				return 'Owner';
			case 'admin':
				return 'Admin';
			case 'full-editor':
				return 'Full Editor';
			case 'team-leader':
				return 'Team Leader';
			case 'viewer':
				return 'Viewer';
			case 'custom':
				return 'Custom';
		}
	}

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

	function formatCompactDate(date: Date): string {
		return date
			.toLocaleDateString('en-US', {
				month: 'short',
				day: 'numeric',
				year: '2-digit'
			})
			.toUpperCase();
	}

	function formatPrice(cents: number): string {
		if (cents === 0) return 'Free';
		return `$${(cents / 100).toFixed(0)}/mo`;
	}

	function formatCap(cap: number): string {
		return cap === Infinity ? 'Unlimited' : String(cap);
	}

	function formatExportLimit(limit: number): string {
		return limit === Infinity ? 'exports' : `${limit} exports/mo`;
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
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement('a');
			anchor.href = url;
			anchor.download = filename;
			document.body.appendChild(anchor);
			anchor.click();
			document.body.removeChild(anchor);
			URL.revokeObjectURL(url);
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
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement('a');
			anchor.href = url;
			anchor.download = `${name}-records.xlsx`;
			anchor.click();
			URL.revokeObjectURL(url);
		} catch {
			toastStore.error('Failed to export records');
		} finally {
			exportingPerson = null;
		}
	}

	async function handleApprovalAction(id: string, action: 'approve' | 'deny', reason?: string) {
		if (processingApproval) return;
		processingApproval = id;
		try {
			const res = await fetch(`/org/${orgId}/api/deletion-requests/review`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, action, denialReason: reason ?? null })
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({ message: 'Unknown error' }));
				toastStore.error(err.message || 'Failed to process request');
				return;
			}
			denyingId = null;
			denialReason = '';
			await invalidateAll();
		} finally {
			processingApproval = null;
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
			<div class="organization-tab">
				<div class="org-metrics" aria-label="Organization settings summary">
					<div class="org-metric">
						<span>Members</span>
						<strong>{data.members.length}</strong>
						<p>{memberRoleSummary}</p>
					</div>
					<div class="org-metric">
						<span>Pending approvals</span>
						<strong>{data.pendingApprovalsCount}</strong>
						<p>
							{#if oldestPendingApproval}
								Oldest {formatRelativeDate(oldestPendingApproval.created_at)}
							{:else}
								No pending requests
							{/if}
						</p>
					</div>
					<div class="org-metric">
						<span>Archived</span>
						<strong>{data.archivedPersonnel.length}</strong>
						<p>
							{#if nextPurgeDate}
								Next purge {formatCompactDate(nextPurgeDate)}
							{:else}
								Retention {data.policies.retentionMonths} months
							{/if}
						</p>
					</div>
					<div class="org-metric">
						<span>Audit entries</span>
						<strong>{auditEntriesLast30Days}</strong>
						<p>Last 30 days</p>
					</div>
				</div>

				<section class="ledger-section" aria-labelledby="organization-profile-heading">
					<div class="ledger-heading">
						<span>01</span>
						<h3 id="organization-profile-heading">Organization Profile</h3>
						{#if form?.nameSuccess}<p class="state-label state-label--success">Saved</p>{/if}
					</div>
					<form
						method="POST"
						action="?/updateName"
						use:enhance={() => {
							loading = true;
							return async ({ update }) => {
								loading = false;
								await update();
							};
						}}
					>
						{#if form?.error}<div class="error-message error-message--inline">{form.error}</div>{/if}
						<div class="ledger-row">
							<div>
								<label class="field-label" for="name">Organization name</label>
								<p class="field-hint">Displayed across briefs, exports, and printed rosters.</p>
							</div>
							<div class="ledger-control">
								<input id="name" name="name" type="text" class="input" value={data.orgName ?? ''} required />
								<button type="submit" class="btn btn-primary" disabled={loading}>
									{loading ? 'Saving...' : 'Update'}
								</button>
							</div>
						</div>
					</form>
					<div class="ledger-row">
						<div>
							<p id="short-code-label" class="field-label">Short code</p>
							<p class="field-hint">Used in URLs and DA-form headers. 3-6 chars.</p>
						</div>
						<div class="ledger-control">
							<div class="coming-soon-field">
								<button
									type="button"
									class="short-code-preview"
									aria-disabled="true"
									aria-labelledby="short-code-label short-code-value"
									aria-describedby="short-code-tooltip"
								>
									<span id="short-code-value">Coming soon</span>
								</button>
								<span id="short-code-tooltip" class="coming-soon-tooltip" role="tooltip">
									Coming soon: future organization slugs for URLs and printed headers.
								</span>
							</div>
						</div>
					</div>
				</section>

				<section class="ledger-section" aria-labelledby="subscription-heading">
					<div class="ledger-heading">
						<span>02</span>
						<h3 id="subscription-heading">Subscription & Billing</h3>
						<p class="state-label">{planBadge} · {planPrice}</p>
					</div>
					<div class="ledger-row">
						<div>
							<p class="field-label">Plan</p>
							<p class="field-hint">{planCopy}</p>
						</div>
						<div class="billing-control">
							<span class="tier-pill">{planBadge}</span>
							<span class="billing-meta">{billingStatus}</span>
							{#if isBillingEnabled}
								<a class="btn btn-primary btn-sm" href={`/org/${data.orgId}/billing`}>Manage Billing</a>
							{/if}
						</div>
					</div>
					<div class="ledger-row">
						<div>
							<p class="field-label">Personnel count</p>
						</div>
						<div class="session-actions">
							<span class="mono-value">{personnelCount}</span>
						</div>
					</div>
				</section>

				<section class="ledger-section" aria-labelledby="session-heading">
					<div class="ledger-heading">
						<span>03</span>
						<h3 id="session-heading">Session</h3>
					</div>
					<div class="ledger-row">
						<div>
							<p class="field-label">Active session</p>
							<p class="field-hint">Sign out of this browser only. Other sessions are unaffected.</p>
						</div>
						<div class="session-actions">
							<a class="btn btn-secondary btn-sm" href="/auth/logout">Sign Out</a>
							<a class="btn btn-secondary btn-sm" href="/dashboard?show=all">Switch Organization</a>
						</div>
					</div>
				</section>
			</div>
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
			<div class="policies-tab">
				<section class="ledger-section" aria-labelledby="archive-retention-heading">
					<div class="ledger-heading">
						<span>01</span>
						<h3 id="archive-retention-heading">Archive Retention</h3>
						<div class="ledger-status-actions">
							<p
								class="state-label"
								class:state-label--success={!hasRetentionChanges}
								class:state-label--warning={hasRetentionChanges}
							>
								{hasRetentionChanges ? 'Unsaved changes' : 'Saved'}
							</p>
							<button
								class="btn btn-primary btn-sm"
								disabled={!hasRetentionChanges || !isRetentionValid || savingRetention}
								onclick={handleRetentionSave}
							>
								{#if savingRetention}<Spinner />{/if}
								{savingRetention ? 'Saving...' : 'Save'}
							</button>
						</div>
					</div>
					<div class="ledger-row">
						<div>
							<label class="field-label" for="retention-months">Retention period</label>
							<p class="field-hint">Archived personnel are automatically purged after this window.</p>
						</div>
						<div class="policy-control">
							<input
								id="retention-months"
								class="input input--number"
								type="number"
								min="1"
								max="120"
								bind:value={retentionMonths}
							/>
							<span>Months</span>
							{#if !isRetentionValid}<p class="validation-hint">Must be between 1 and 120 months.</p>{/if}
						</div>
					</div>
				</section>

				<section class="ledger-section" aria-labelledby="loss-warning-heading">
					<div class="ledger-heading">
						<span>02</span>
						<h3 id="loss-warning-heading">Loss Warning Window</h3>
						<div class="ledger-status-actions">
							<p
								class="state-label"
								class:state-label--success={!hasLossWarningChanges}
								class:state-label--warning={hasLossWarningChanges}
							>
								{hasLossWarningChanges ? 'Unsaved changes' : 'Saved'}
							</p>
							<button
								class="btn btn-primary btn-sm"
								disabled={!hasLossWarningChanges || !isLossWarningValid || savingWarningWindow}
								onclick={handleLossWarningSave}
							>
								{#if savingWarningWindow}<Spinner />{/if}
								{savingWarningWindow ? 'Saving...' : 'Save'}
							</button>
						</div>
					</div>
					<div class="ledger-row">
						<div>
							<label class="field-label" for="loss-warning-window">Warning lead time</label>
							<p class="field-hint">Flag personnel approaching ETS / PCS / DEROS this far out.</p>
						</div>
						<div class="policy-control">
							<input
								id="loss-warning-window"
								class="input input--number"
								type="number"
								min="1"
								max="365"
								bind:value={warningWindowDays}
							/>
							<span>Days</span>
							{#if !isLossWarningValid}<p class="validation-hint">Must be between 1 and 365 days.</p>{/if}
						</div>
					</div>
				</section>

				<section class="ledger-section" aria-labelledby="critical-tasks-defaults-heading">
					<div class="ledger-heading">
						<span>03</span>
						<h3 id="critical-tasks-defaults-heading">Critical Tasks Defaults</h3>
						<div class="ledger-status-actions">
							<p
								class="state-label"
								class:state-label--success={!hasCriticalTasksChanges}
								class:state-label--warning={hasCriticalTasksChanges}
							>
								{hasCriticalTasksChanges ? 'Unsaved changes' : 'Saved'}
							</p>
							<button
								class="btn btn-primary btn-sm"
								disabled={!hasCriticalTasksChanges || !isCriticalTasksValid || savingCriticalTasks}
								onclick={handleCriticalTasksSave}
							>
								{#if savingCriticalTasks}<Spinner />{/if}
								{savingCriticalTasks ? 'Saving...' : 'Save'}
							</button>
						</div>
					</div>
					<div class="ledger-row">
						<div>
							<label class="field-label" for="critical-tasks-default-expiration">Default expiration</label>
							<p class="field-hint">Used when an ICT task does not define its own override.</p>
						</div>
						<div class="policy-control">
							<input
								id="critical-tasks-default-expiration"
								class="input input--number"
								type="number"
								min="1"
								max="120"
								bind:value={criticalTasksDefaultExpirationMonths}
							/>
							<span>Months</span>
						</div>
					</div>
					<div class="ledger-row">
						<div>
							<label class="field-label" for="critical-tasks-expiring-window">Expiring-soon window</label>
							<p class="field-hint">Threshold that flips status from current to expiring.</p>
						</div>
						<div class="policy-control">
							<input
								id="critical-tasks-expiring-window"
								class="input input--number"
								type="number"
								min="1"
								max="365"
								bind:value={criticalTasksExpiringSoonWarningDays}
							/>
							<span>Days</span>
							{#if !isCriticalTasksValid}
								<p class="validation-hint">
									Default expiration must be 1-120 months. Warning window must be 1-365 days.
								</p>
							{/if}
						</div>
					</div>
					<div class="ledger-row">
						<div>
							<label class="field-label" for="critical-tasks-auto-notify">Auto-notify squad leader</label>
							<p class="field-hint">Send a daily digest of expiring tasks to assigned NCO.</p>
						</div>
						<div class="policy-control">
							<select
								id="critical-tasks-auto-notify"
								class="input policy-select"
								disabled
								aria-describedby="critical-tasks-auto-notify-note"
							>
								<option>Coming soon</option>
							</select>
							<span id="critical-tasks-auto-notify-note">Not configured</span>
						</div>
					</div>
				</section>
			</div>
		{:else if activeSection === 'archived'}
			<div class="archived-tab">
				<section class="ledger-section" aria-labelledby="archived-records-heading">
					<div class="ledger-heading">
						<span>01</span>
						<h3 id="archived-records-heading">Archived Records</h3>
						<p class="state-label">
							{data.archivedPersonnel.length}
							{pluralize('Record', data.archivedPersonnel.length)} · {data.policies.retentionMonths} mo retention
						</p>
					</div>

					<div class="archived-records-table" role="region" aria-label="Archived personnel records">
						<table>
							<thead>
								<tr>
									<th>Name</th>
									<th>MOS</th>
									<th>Group</th>
									<th>Archived</th>
									<th>Auto-delete</th>
									<th>Actions</th>
								</tr>
							</thead>
							<tbody>
								{#each data.archivedPersonnel as row (row.id)}
									<tr>
										<td class="name-cell">{row.rank} {row.lastName}, {row.firstName}</td>
										<td>{row.mos || '--'}</td>
										<td>{row.groupName || '--'}</td>
										<td>{formatRosterDate(row.archivedAt)}</td>
										<td><span class="retention-pill">{data.policies.retentionMonths} mo</span></td>
										<td>
											<div class="archived-actions">
												<button
													class="btn btn-primary btn-sm"
													onclick={() => handleRestore(row.id)}
													disabled={restoring === row.id}
												>
													{#if restoring === row.id}<Spinner />{/if}
													Restore
												</button>
												<button
													class="member-action"
													onclick={() => handlePersonnelExport(row.id, `${row.rank}-${row.lastName}`)}
													disabled={exportingPerson === row.id}
												>
													{exportingPerson === row.id ? 'Exporting...' : 'Export'}
												</button>
												<button
													class="member-action member-action--danger"
													onclick={() =>
														(confirmPermanentDelete = {
															id: row.id,
															name: `${row.rank} ${row.lastName}, ${row.firstName}`
														})}
												>
													Delete
												</button>
											</div>
										</td>
									</tr>
								{:else}
									<tr>
										<td colspan="6" class="archived-empty">No archived personnel records.</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</section>
			</div>
		{:else if activeSection === 'data-export'}
			<div class="data-export-tab">
				<section class="ledger-section" aria-labelledby="data-export-heading">
					<div class="ledger-heading">
						<span>01</span>
						<h3 id="data-export-heading">Export</h3>
						<p class="state-label">{data.exportInfo.isLimited ? 'Plan limited' : 'Unlimited exports'}</p>
					</div>

					{#if exportError}<div class="error-message ledger-message">{exportError}</div>{/if}
					{#if exportSuccess}<div class="success-message ledger-message">Export downloaded successfully.</div>{/if}

					<div class="ledger-row">
						<div>
							<p class="field-label">Full organization</p>
							<p class="field-hint">
								JSON for backups and integrations. Excel for a human-readable workbook with named sheets.
							</p>
						</div>
						<div class="export-command-group">
							<button
								class="btn btn-primary btn-sm"
								onclick={() => handleOrganizationExport('json')}
								disabled={exportingOrgJson ||
									exportingOrgExcel ||
									(data.exportInfo.isLimited && data.exportInfo.exportsUsed >= data.exportInfo.exportsLimit)}
							>
								{#if exportingOrgJson}<Spinner />{/if}
								{exportingOrgJson ? 'Generating...' : 'Export JSON'}
							</button>
							<button
								class="btn btn-secondary btn-sm"
								onclick={() => handleOrganizationExport('excel')}
								disabled={exportingOrgJson ||
									exportingOrgExcel ||
									(data.exportInfo.isLimited && data.exportInfo.exportsUsed >= data.exportInfo.exportsLimit)}
							>
								{#if exportingOrgExcel}<Spinner />{/if}
								{exportingOrgExcel ? 'Generating...' : 'Export Excel'}
							</button>
							<span class="export-help">
								Full organization exports include roster, training, onboarding, calendar, and duty data.
							</span>
						</div>
					</div>

					<div class="ledger-row">
						<div>
							<p class="field-label">Export allowance</p>
							<p class="field-hint">Monthly export limits follow the active subscription tier.</p>
						</div>
						<div class="export-quota">
							{#if data.exportInfo.isLimited}
								<span class="tier-pill">{data.exportInfo.exportsUsed} / {data.exportInfo.exportsLimit} used</span>
								{#if data.exportInfo.exportsUsed >= data.exportInfo.exportsLimit}
									<p class="export-limit-warning">Export limit reached. Upgrade your plan for unlimited exports.</p>
								{/if}
							{:else}
								<span class="tier-pill">Unlimited exports</span>
							{/if}
						</div>
					</div>

					<div class="ledger-row">
						<div>
							<p class="field-label">Personnel only</p>
							<p class="field-hint">Roster and group data only, without the full organization bundle.</p>
						</div>
						<div class="export-command-group">
							<button
								type="button"
								class="btn btn-secondary btn-sm btn-coming-soon"
								disabled
								title="Coming soon"
								aria-disabled="true"
							>
								Export Roster
								<span>Coming Soon</span>
							</button>
						</div>
					</div>

					<div class="ledger-row">
						<div>
							<p class="field-label">Audit log</p>
							<p class="field-hint">Last 90 days of activity.</p>
						</div>
						<div class="export-command-group">
							<a class="btn btn-secondary btn-sm" href={`/org/${data.orgId}/settings/audit`}>View Audit Log</a>
							<button
								type="button"
								class="btn btn-secondary btn-sm btn-coming-soon"
								disabled
								title="Coming soon"
								aria-disabled="true"
							>
								Export Audit
								<span>Coming Soon</span>
							</button>
						</div>
					</div>
				</section>
			</div>
		{:else if activeSection === 'danger' && data.isOwner}
			<div class="danger-zone-tab">
				<section class="ledger-section danger-ledger" aria-labelledby="destructive-actions-heading">
					<div class="ledger-heading">
						<span>!</span>
						<h3 id="destructive-actions-heading">Destructive Actions</h3>
						<p class="state-label state-label--danger">Owner only</p>
					</div>

					<div class="ledger-row">
						<div>
							<label class="field-label" for="transfer-owner-target">Transfer ownership</label>
							<p class="field-hint">Hand the Owner role to another member. You will become Admin.</p>
						</div>
						<div class="danger-command-group">
							<select
								id="transfer-owner-target"
								class="input danger-select"
								value={transferTargetId ?? ''}
								onchange={(event) => (transferTargetId = event.currentTarget.value || null)}
							>
								<option value="">Select member...</option>
								{#each transferOwnershipCandidates as member (member.id)}
									<option value={member.userId}>{member.email}</option>
								{/each}
							</select>
							<button
								type="button"
								class="btn btn-secondary btn-sm btn-danger-outline"
								disabled={!transferTargetId}
								onclick={() => (showTransferConfirm = true)}
							>
								Transfer Ownership
							</button>
							{#if transferOwnershipCandidates.length === 0}
								<span class="export-help">No eligible member account is available.</span>
							{/if}
						</div>
					</div>

					<div class="ledger-row">
						<div>
							<p class="field-label">Purge archived</p>
							<p class="field-hint">Permanently delete all archived personnel. Bypasses the retention window.</p>
						</div>
						<div class="danger-command-group">
							<button
								type="button"
								class="btn btn-secondary btn-sm btn-danger-outline btn-coming-soon"
								disabled
								title="Coming soon"
								aria-disabled="true"
							>
								Purge Archived
								<span>Coming Soon</span>
							</button>
						</div>
					</div>

					<div class="ledger-row">
						<div>
							<p class="field-label">Delete organization</p>
							<p class="field-hint">
								All personnel, training, calendar, and audit data is permanently destroyed. This action cannot be
								undone.
							</p>
						</div>
						<div class="danger-command-group">
							{#if form?.deleteError}<div class="error-message">{form.deleteError}</div>{/if}
							<button type="button" class="btn btn-danger btn-sm" onclick={() => (showDeleteConfirm = true)}>
								Delete {data.orgName}
							</button>
						</div>
					</div>
				</section>
			</div>
		{/if}
	</main>

	<aside class="activity-rail" aria-label="Settings activity">
		{#if activityCollapsed}
			<button
				type="button"
				class="activity-rail__restore"
				aria-label="Show activity panel"
				onclick={() => (activityCollapsed = false)}
			>
				Activity
			</button>
		{:else}
			<div class="activity-tabs" role="tablist" aria-label="Settings activity views">
				<button
					type="button"
					role="tab"
					aria-selected={activityTab === 'approvals'}
					class:is-active={activityTab === 'approvals'}
					onclick={() => (activityTab = 'approvals')}
				>
					Approvals <span>{data.pendingApprovalsCount}</span>
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={activityTab === 'audit'}
					class:is-active={activityTab === 'audit'}
					onclick={() => (activityTab = 'audit')}
				>
					Audit Log
				</button>
				<button
					type="button"
					class="activity-tabs__collapse"
					aria-label="Collapse"
					onclick={() => (activityCollapsed = true)}
				>
					Hide
				</button>
			</div>
			<div class="activity-rail__body">
				{#if activityTab === 'approvals'}
					<div class="activity-list" aria-label="Pending approval requests">
						{#each visibleApprovals as request (request.id)}
							<article class="approval-item">
								<header>
									<strong>{request.requester_email ?? 'Unknown requester'}</strong>
								</header>
								{#if request.resource_url}
									<a class="approval-item__title" href={request.resource_url}>
										{request.resource_description ?? request.resource_type}
									</a>
								{:else}
									<p class="approval-item__title">{request.resource_description ?? request.resource_type}</p>
								{/if}
								<div class="approval-item__footer">
									<span>{formatRelativeDate(request.created_at)} · Pending</span>
									{#if denyingId === request.id}
										<div class="deny-form deny-form--rail">
											<input
												type="text"
												class="input deny-input"
												placeholder="Reason"
												bind:value={denialReason}
												onkeydown={(event) => {
													if (event.key === 'Enter') handleApprovalAction(request.id, 'deny', denialReason);
													if (event.key === 'Escape') {
														denyingId = null;
														denialReason = '';
													}
												}}
											/>
											<button
												class="btn btn-danger btn-sm"
												disabled={processingApproval === request.id}
												onclick={() => handleApprovalAction(request.id, 'deny', denialReason)}
											>
												{#if processingApproval === request.id}<Spinner />{/if}
												Confirm
											</button>
										</div>
									{:else}
										<div class="approval-item__actions">
											<button
												class="btn btn-primary btn-sm"
												disabled={processingApproval === request.id}
												onclick={() => handleApprovalAction(request.id, 'approve')}
											>
												{#if processingApproval === request.id}<Spinner />{/if}
												Approve
											</button>
											<button class="rail-text-button" onclick={() => (denyingId = request.id)}>Deny</button>
										</div>
									{/if}
								</div>
							</article>
						{/each}
						{#if pendingApprovals.length === 0}
							<p class="activity-empty">No pending requests.</p>
						{:else if pendingApprovals.length <= visibleApprovals.length}
							<p class="activity-empty">No more pending requests.</p>
						{:else}
							<a class="activity-view-all" href={`/org/${data.orgId}/settings/approvals`}>
								View all {pendingApprovals.length} pending requests
							</a>
						{/if}
					</div>
				{:else}
					<div class="audit-feed" aria-label="Recent audit log entries">
						{#each visibleAuditLogs as log (log.id)}
							{@const actionParts = getAuditActionParts(log.action)}
							<article class="audit-event">
								<time datetime={log.createdAt}>{formatAuditTimestamp(log.createdAt)}</time>
								<div>
									<span class={`audit-event__badge audit-event__badge--${getAuditTone(log.action)}`}>
										{actionParts.area} › {actionParts.event}
									</span>
									<p>{log.actor ?? 'System'}</p>
								</div>
							</article>
						{/each}
						{#if data.auditLog.totalCount > 0}
							<a class="activity-view-all" href={`/org/${data.orgId}/settings/audit`}>
								View all {data.auditLog.totalCount} entries
							</a>
						{:else}
							<p class="activity-empty">No audit log entries yet.</p>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	</aside>
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

<style>
	.settings-workspace {
		min-height: calc(100vh - 4rem);
		display: grid;
		grid-template-columns: 244px minmax(0, 1fr) minmax(300px, 360px);
		background: var(--surface-page);
		border-top: var(--border-thin);
	}

	.settings-workspace.activity-collapsed {
		grid-template-columns: 244px minmax(0, 1fr) 52px;
	}

	.settings-nav {
		min-height: 0;
		background: var(--surface-panel);
		border-right: var(--border-thin);
		display: flex;
		flex-direction: column;
	}

	.settings-nav__header {
		padding: var(--sp-5);
		border-bottom: var(--border-thin);
	}

	.settings-nav__header p,
	.content-eyebrow {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--amber);
	}

	.settings-nav__header h1,
	.settings-main__header h2 {
		margin: var(--sp-1) 0 0;
		font-family: var(--font-display);
		font-weight: 800;
		line-height: 0.98;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		color: var(--text-strong);
	}

	.settings-nav__header h1 {
		font-size: 1.75rem;
	}

	.settings-nav__list {
		flex: 1;
		overflow: auto;
		padding: var(--sp-2) 0;
	}

	.settings-nav__item {
		width: 100%;
		display: grid;
		grid-template-columns: 28px 1fr;
		gap: var(--sp-2);
		padding: var(--sp-3) var(--sp-5);
		border: 0;
		border-bottom: 1px solid transparent;
		background: transparent;
		color: var(--text-secondary);
		text-align: left;
		cursor: pointer;
	}

	.settings-nav__item:hover {
		background: color-mix(in srgb, var(--surface-subtle) 72%, var(--surface-panel) 28%);
		color: var(--text-strong);
	}

	.settings-nav__item.is-danger {
		color: var(--danger);
	}

	.settings-nav__item.is-danger .settings-nav__num,
	.settings-nav__item.is-danger .settings-nav__meta {
		color: color-mix(in srgb, var(--danger) 72%, var(--text-muted) 28%);
	}

	.settings-nav__item.is-danger:hover {
		background: color-mix(in srgb, var(--danger-bg) 66%, var(--surface-panel) 34%);
		color: var(--danger);
	}

	.settings-nav__item.is-active {
		background: var(--surface-subtle);
		color: var(--text-strong);
		box-shadow: inset 2px 0 0 var(--amber);
	}

	.settings-nav__item.is-danger.is-active {
		background: color-mix(in srgb, var(--danger-bg) 72%, var(--surface-panel) 28%);
		color: var(--danger);
		box-shadow: inset 2px 0 0 var(--danger);
	}

	.settings-nav__num,
	.settings-nav__meta,
	.state-label,
	.validation-hint {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}

	.settings-nav__num {
		color: var(--text-muted);
	}

	.settings-nav__item.is-active .settings-nav__num {
		color: var(--amber-dark);
	}

	.settings-nav__label {
		font-family: var(--font-display);
		font-size: 0.95rem;
		font-weight: 700;
		line-height: 1;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.settings-nav__meta {
		grid-column: 2;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.settings-nav__footer {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
		padding: var(--sp-4) var(--sp-5);
		border-top: var(--border-thin);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.settings-main {
		min-width: 0;
		overflow: auto;
		padding: var(--sp-6) var(--sp-6) var(--sp-10);
	}

	.settings-main__header {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--sp-5);
		padding-bottom: var(--sp-4);
		margin-bottom: var(--sp-5);
		border-bottom: var(--border-thin);
	}

	.settings-main__header h2 {
		font-size: 2.5rem;
	}

	.workspace-actions,
	.export-buttons,
	.actions-cell,
	.deny-form {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}

	.organization-tab {
		display: flex;
		flex-direction: column;
		gap: var(--sp-6);
	}

	.members-tab {
		display: flex;
		flex-direction: column;
		gap: var(--sp-6);
	}

	.content-description {
		max-width: 48ch;
		margin: var(--sp-2) 0 0;
		color: var(--text-secondary);
		line-height: 1.55;
	}

	.org-metrics {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: var(--surface-panel);
		overflow: hidden;
	}

	.org-metric {
		min-width: 0;
		padding: var(--sp-4);
		border-right: var(--border-thin);
	}

	.org-metric:last-child {
		border-right: 0;
	}

	.org-metric span,
	.billing-meta,
	.mono-value {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.org-metric strong {
		display: block;
		margin-top: var(--sp-1);
		font-family: var(--font-display);
		font-size: 2rem;
		line-height: 0.95;
		color: var(--text-strong);
	}

	.org-metric p {
		margin: var(--sp-2) 0 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.ledger-section {
		background: transparent;
	}

	.ledger-heading {
		display: grid;
		grid-template-columns: 28px minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--sp-4);
		padding-bottom: var(--sp-3);
		border-bottom: var(--border-thin);
	}

	.ledger-heading > span {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.12em;
		color: var(--amber-dark);
	}

	.ledger-heading h3 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.2rem;
		line-height: 1;
		font-weight: 800;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-strong);
	}

	.ledger-row {
		display: grid;
		grid-template-columns: minmax(180px, 240px) minmax(0, 1fr);
		gap: var(--sp-6);
		padding: var(--sp-5) 0;
		border-bottom: var(--border-thin);
	}

	.ledger-row:last-child {
		border-bottom: 0;
	}

	.ledger-control,
	.billing-control,
	.session-actions {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		flex-wrap: wrap;
	}

	.ledger-control .input {
		max-width: 360px;
	}

	.member-ledger {
		margin-top: var(--sp-4);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: var(--surface-panel);
		overflow: hidden;
	}

	.member-row,
	.pending-invite-row {
		display: grid;
		grid-template-columns: 40px minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--sp-4);
		padding: var(--sp-3) var(--sp-4);
		border-bottom: var(--border-thin);
	}

	.member-row:last-child,
	.pending-invite-row:last-child {
		border-bottom: 0;
	}

	.member-avatar {
		width: 32px;
		height: 32px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 999px;
		background: var(--text-strong);
		color: var(--surface-page);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 800;
		letter-spacing: 0.06em;
	}

	.member-main {
		min-width: 0;
	}

	.member-email {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-weight: 700;
		color: var(--text-strong);
		overflow-wrap: anywhere;
	}

	.member-meta {
		margin: var(--sp-1) 0 0;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.member-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--sp-3);
		flex-wrap: wrap;
	}

	.member-role,
	.member-you {
		display: inline-flex;
		align-items: center;
		min-height: 22px;
		padding: 2px 8px;
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-secondary);
		background: var(--surface-subtle);
	}

	.member-role--owner {
		border-color: color-mix(in srgb, var(--amber-dark) 46%, var(--ink-15) 54%);
		background: color-mix(in srgb, var(--amber) 82%, var(--surface-panel) 18%);
		color: var(--text-on-dark);
	}

	.member-role--admin {
		border-color: color-mix(in srgb, var(--info) 36%, var(--ink-15) 64%);
		background: color-mix(in srgb, var(--info-bg) 78%, var(--surface-panel) 22%);
		color: var(--info);
	}

	.member-role--full-editor,
	.member-role--team-leader {
		border-color: color-mix(in srgb, var(--amber-dark) 34%, var(--ink-15) 66%);
		background: color-mix(in srgb, var(--amber-light) 58%, var(--surface-panel) 42%);
		color: var(--amber-dark);
	}

	.member-role--custom {
		border-color: color-mix(in srgb, var(--ink-40) 46%, var(--ink-15) 54%);
		background: var(--surface-subtle);
		color: var(--text-strong);
	}

	.member-you {
		border-color: transparent;
		background: transparent;
		color: var(--text-muted);
	}

	.member-action {
		border: 0;
		background: transparent;
		color: var(--text-strong);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		cursor: pointer;
	}

	.member-action:hover {
		color: var(--amber-dark);
	}

	.member-action--danger {
		padding: 4px 8px;
		border: 1px solid color-mix(in srgb, var(--danger) 34%, var(--ink-15) 66%);
		border-radius: var(--radius-sm);
		color: var(--danger);
	}

	.member-action--danger:hover {
		background: color-mix(in srgb, var(--danger-bg) 74%, var(--surface-panel) 26%);
		color: var(--danger);
	}

	.member-editor {
		grid-column: 1 / -1;
		margin: 0 calc(var(--sp-4) * -1) calc(var(--sp-3) * -1);
		padding: var(--sp-4);
		border-top: var(--border-thin);
		background: color-mix(in srgb, var(--surface-subtle) 76%, var(--surface-panel) 24%);
	}

	.member-editor__topline {
		display: flex;
		align-items: flex-end;
		gap: var(--sp-3);
		flex-wrap: wrap;
	}

	.member-editor__topline label {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.member-editor__topline .input {
		min-width: 160px;
	}

	.member-editor__actions,
	.invite-control {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}

	.permission-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(150px, 1fr));
		gap: var(--sp-3);
	}

	.permission-grid--compact {
		margin-top: var(--sp-4);
	}

	.permission-section {
		padding: var(--sp-3);
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
	}

	.permission-section h4 {
		margin: 0 0 var(--sp-2);
		font-family: var(--font-display);
		font-size: 0.92rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-strong);
	}

	.permission-section label {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		margin-right: var(--sp-3);
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}

	.invite-row {
		align-items: start;
	}

	.invite-control {
		width: 100%;
		flex-wrap: nowrap;
	}

	.invite-control .input {
		min-width: 180px;
	}

	.invite-control input.input {
		flex: 1 1 320px;
		width: auto;
		min-width: 0;
	}

	.invite-role-select {
		flex: 0 0 180px;
		width: 180px;
	}

	.invite-control .btn {
		flex: 0 0 auto;
		min-height: 44px;
	}

	.pending-invite-row {
		grid-template-columns: minmax(0, 1fr) auto;
	}

	.policies-tab,
	.archived-tab,
	.data-export-tab,
	.danger-zone-tab {
		display: flex;
		flex-direction: column;
		gap: var(--sp-6);
	}

	.ledger-status-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--sp-3);
		flex-wrap: wrap;
	}

	.policy-control {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		flex-wrap: wrap;
	}

	.policy-control > span {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.policy-select {
		width: auto;
		min-width: 160px;
	}

	.export-command-group,
	.danger-command-group,
	.export-quota {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		flex-wrap: wrap;
	}

	.export-help {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.ledger-message {
		margin: var(--sp-4) 0 0;
	}

	.danger-ledger {
		padding: var(--sp-4);
		border: 1px solid color-mix(in srgb, var(--danger) 28%, var(--ink-15) 72%);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--danger-bg) 38%, var(--surface-panel) 62%);
	}

	.danger-ledger .ledger-row {
		border-bottom-color: color-mix(in srgb, var(--danger) 14%, var(--ink-15) 86%);
	}

	.danger-select {
		width: min(100%, 280px);
	}

	.btn-danger-outline {
		border-color: color-mix(in srgb, var(--danger) 36%, var(--ink-15) 64%);
		background: color-mix(in srgb, var(--danger-bg) 72%, var(--surface-panel) 28%);
		color: var(--danger);
	}

	.btn-danger-outline:hover {
		background: color-mix(in srgb, var(--danger-bg) 88%, var(--surface-panel) 12%);
		color: var(--danger);
	}

	.btn-coming-soon {
		cursor: not-allowed;
		opacity: 1;
	}

	.btn-coming-soon span {
		margin-left: var(--sp-2);
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.archived-records-table {
		margin-top: var(--sp-4);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: var(--surface-panel);
		overflow: auto;
	}

	.archived-records-table table {
		width: 100%;
		border-collapse: collapse;
		min-width: 760px;
	}

	.archived-records-table th,
	.archived-records-table td {
		padding: var(--sp-3) var(--sp-4);
		border-bottom: var(--border-thin);
		text-align: left;
		vertical-align: middle;
	}

	.archived-records-table th {
		background: color-mix(in srgb, var(--surface-subtle) 74%, var(--surface-panel) 26%);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.archived-records-table td {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}

	.archived-records-table tbody tr:last-child td {
		border-bottom: 0;
	}

	.retention-pill {
		display: inline-flex;
		align-items: center;
		min-height: 24px;
		padding: 2px 8px;
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		background: var(--surface-subtle);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-secondary);
		white-space: nowrap;
	}

	.archived-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--sp-3);
		white-space: nowrap;
	}

	.archived-empty {
		text-align: center !important;
		color: var(--text-muted) !important;
		padding: var(--sp-6) !important;
	}

	.short-code-preview {
		width: 142px;
		min-height: 38px;
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		background: var(--surface-subtle);
		color: var(--text-muted);
		font-family: var(--font-mono);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		cursor: help;
	}

	.coming-soon-field {
		position: relative;
		display: inline-flex;
		outline: none;
	}

	.coming-soon-field:focus-visible {
		border-radius: var(--radius-sm);
		box-shadow: var(--focus-ring);
	}

	.coming-soon-tooltip {
		position: absolute;
		left: 0;
		top: calc(100% + var(--sp-2));
		z-index: var(--z-tooltip);
		width: min(260px, 70vw);
		padding: var(--sp-2) var(--sp-3);
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		background: var(--surface-elevated);
		color: var(--text-secondary);
		font-size: var(--text-xs);
		line-height: 1.35;
		box-shadow: var(--shadow-lg);
		opacity: 0;
		transform: translateY(-2px);
		pointer-events: none;
		transition:
			opacity 120ms ease-out,
			transform 120ms ease-out;
	}

	.coming-soon-field:hover .coming-soon-tooltip,
	.coming-soon-field:focus-within .coming-soon-tooltip,
	.coming-soon-field:focus .coming-soon-tooltip {
		opacity: 1;
		transform: translateY(0);
	}

	.tier-pill {
		display: inline-flex;
		align-items: center;
		border: 1px solid color-mix(in srgb, var(--amber-dark) 38%, var(--ink-15) 62%);
		background: color-mix(in srgb, var(--amber-light) 66%, var(--surface-panel) 34%);
		color: var(--amber-dark);
		padding: 3px 8px;
		border-radius: var(--radius-sm);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.mono-value {
		color: var(--text-strong);
		font-size: var(--text-sm);
	}

	.field-row {
		display: grid;
		grid-template-columns: minmax(180px, 240px) minmax(0, 1fr);
		gap: var(--sp-6);
		padding: var(--sp-4) var(--sp-5);
		border-bottom: var(--border-thin);
	}

	.field-row:last-child {
		border-bottom: 0;
	}

	.field-label {
		font-family: var(--font-display);
		font-size: 0.92rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-strong);
	}

	.field-hint,
	.section-description,
	.danger-warning {
		margin: var(--sp-1) 0 0;
		font-size: var(--text-sm);
		line-height: 1.55;
		color: var(--text-secondary);
	}

	.field-control {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		flex-wrap: wrap;
	}

	.field-control--stacked {
		align-items: flex-start;
		flex-direction: column;
	}

	.input--number {
		width: 124px;
	}

	.state-label {
		margin: 0;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.state-label--success {
		color: var(--success);
	}

	.state-label--warning {
		color: var(--amber-dark);
	}

	.state-label--danger,
	.danger-warning {
		color: var(--danger);
	}

	.error-message,
	.success-message,
	.export-limit-warning {
		margin: var(--sp-4) var(--sp-5) 0;
		padding: var(--sp-3) var(--sp-4);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
	}

	.error-message {
		background: color-mix(in srgb, var(--danger-bg) 84%, var(--surface-panel) 16%);
		color: var(--danger);
	}

	.error-message--inline {
		margin-left: 0;
		margin-right: 0;
	}

	.success-message {
		background: color-mix(in srgb, var(--success-bg) 84%, var(--surface-panel) 16%);
		color: var(--success);
	}

	.export-limit-warning {
		background: color-mix(in srgb, var(--amber-light) 86%, var(--surface-panel) 14%);
		color: var(--amber-dark);
	}

	.validation-hint {
		width: 100%;
		margin: 0;
		color: var(--danger);
	}

	.name-cell {
		font-weight: 600;
		white-space: nowrap;
	}

	.countdown {
		font-weight: 600;
	}

	.countdown.critical,
	.countdown.overdue {
		color: var(--danger);
	}

	.countdown.warning {
		color: var(--amber-dark);
	}

	.activity-rail {
		min-width: 0;
		min-height: 0;
		background: var(--surface-panel);
		border-left: var(--border-thin);
		display: flex;
		flex-direction: column;
	}

	.activity-rail__restore {
		height: 100%;
		width: 100%;
		border: 0;
		background: var(--surface-panel);
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		writing-mode: vertical-rl;
		cursor: pointer;
	}

	.activity-tabs {
		display: grid;
		grid-template-columns: 1fr 1fr auto;
		border-bottom: var(--border-thin);
	}

	.activity-tabs button {
		border: 0;
		border-bottom: 2px solid transparent;
		background: transparent;
		padding: var(--sp-3);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
		cursor: pointer;
	}

	.activity-tabs button:not(.activity-tabs__collapse).is-active {
		border-bottom-color: var(--amber);
		color: var(--text-strong);
	}

	.activity-tabs__collapse {
		width: 48px;
		border-left: var(--border-thin) !important;
		font-size: 0.6rem !important;
		letter-spacing: 0.08em !important;
	}

	.activity-tabs span {
		display: inline-flex;
		margin-left: var(--sp-1);
		padding: 1px 5px;
		border-radius: var(--radius-sm);
		background: var(--amber);
		color: var(--text-on-dark);
	}

	.activity-rail__body {
		min-height: 0;
		overflow: auto;
		padding: 0;
	}

	.activity-list,
	.audit-feed {
		display: flex;
		flex-direction: column;
	}

	.approval-item,
	.audit-event {
		padding: var(--sp-4);
		border-bottom: var(--border-thin);
	}

	.approval-item header {
		margin-bottom: var(--sp-2);
	}

	.approval-item strong {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-strong);
	}

	.approval-item__title {
		display: block;
		margin: 0;
		color: var(--text-strong);
		font-family: var(--font-serif);
		font-size: var(--text-sm);
		line-height: 1.45;
		text-decoration: none;
	}

	.approval-item__title:hover {
		text-decoration: underline;
	}

	.approval-item__footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-2);
		margin-top: var(--sp-3);
	}

	.approval-item__footer > span,
	.activity-empty,
	.audit-event time,
	.audit-event p {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-muted);
	}

	.approval-item__actions {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}

	.rail-text-button {
		border: 0;
		background: transparent;
		color: var(--text-strong);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		cursor: pointer;
	}

	.rail-text-button:hover {
		color: var(--danger);
	}

	.deny-form--rail {
		width: 100%;
		justify-content: flex-end;
	}

	.audit-event {
		display: grid;
		grid-template-columns: 82px minmax(0, 1fr);
		gap: var(--sp-3);
	}

	.audit-event time {
		line-height: 1.35;
		text-transform: uppercase;
	}

	.audit-event__badge {
		display: inline-flex;
		max-width: 100%;
		padding: 3px 6px;
		border-radius: var(--radius-sm);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 700;
		line-height: 1.15;
		color: var(--text-strong);
	}

	.audit-event__badge--neutral {
		background: color-mix(in srgb, var(--amber-light) 48%, var(--surface-panel) 52%);
		color: var(--amber-dark);
	}

	.audit-event__badge--info {
		background: color-mix(in srgb, var(--info-bg) 74%, var(--surface-panel) 26%);
		color: var(--info);
	}

	.audit-event__badge--warning {
		background: color-mix(in srgb, var(--amber-light) 72%, var(--surface-panel) 28%);
		color: var(--amber-dark);
	}

	.audit-event__badge--danger {
		background: color-mix(in srgb, var(--danger-bg) 74%, var(--surface-panel) 26%);
		color: var(--danger);
	}

	.audit-event__badge--success {
		background: color-mix(in srgb, var(--success-bg) 78%, var(--surface-panel) 22%);
		color: var(--success);
	}

	.audit-event p {
		margin: var(--sp-2) 0 0;
		color: var(--text-secondary);
		overflow-wrap: anywhere;
	}

	.activity-empty {
		margin: 0;
		padding: var(--sp-4);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.activity-view-all {
		margin: var(--sp-4);
		padding: var(--sp-2) var(--sp-3);
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		color: var(--text-strong);
		background: transparent;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 700;
		letter-spacing: 0.08em;
		text-align: center;
		text-transform: uppercase;
		text-decoration: none;
	}

	.activity-view-all:hover {
		background: var(--surface-subtle);
	}

	.deny-input {
		width: 160px;
		font-size: var(--text-sm);
	}

	.resource-type {
		font-size: var(--text-xs);
		font-weight: 600;
		text-transform: capitalize;
	}

	.resource-id {
		font-size: var(--text-xs);
		padding: 1px 4px;
		background: color-mix(in srgb, var(--surface-subtle) 72%, var(--surface-panel) 28%);
		border-radius: var(--radius-sm);
		margin-left: var(--sp-1);
	}

	.no-details {
		color: var(--text-muted);
	}

	@media (max-width: 1180px) {
		.settings-workspace,
		.settings-workspace.activity-collapsed {
			grid-template-columns: 220px minmax(0, 1fr);
		}

		.org-metrics {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.org-metric:nth-child(2) {
			border-right: 0;
		}

		.org-metric:nth-child(-n + 2) {
			border-bottom: var(--border-thin);
		}

		.activity-rail {
			grid-column: 1 / -1;
			border-left: 0;
			border-top: var(--border-thin);
			max-height: 520px;
		}

		.activity-rail__restore {
			height: 48px;
			writing-mode: horizontal-tb;
		}
	}

	@media (max-width: 760px) {
		.settings-workspace,
		.settings-workspace.activity-collapsed {
			grid-template-columns: 1fr;
		}

		.settings-nav {
			border-right: 0;
			border-bottom: var(--border-thin);
		}

		.settings-nav__list {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			padding: 0;
		}

		.settings-nav__item {
			padding: var(--sp-3) var(--sp-4);
			border-bottom: var(--border-thin);
		}

		.settings-main {
			padding: var(--sp-4) var(--sp-4) var(--sp-8);
		}

		.settings-main__header,
		.field-row,
		.ledger-row {
			grid-template-columns: 1fr;
			display: grid;
		}

		.org-metrics {
			grid-template-columns: 1fr;
		}

		.org-metric,
		.org-metric:nth-child(2) {
			border-right: 0;
			border-bottom: var(--border-thin);
		}

		.org-metric:last-child {
			border-bottom: 0;
		}

		.ledger-heading {
			grid-template-columns: 28px minmax(0, 1fr);
		}

		.ledger-heading .state-label {
			grid-column: 2;
		}

		.ledger-status-actions {
			grid-column: 2;
			justify-content: flex-start;
		}

		.invite-control {
			flex-wrap: wrap;
		}

		.invite-control input.input,
		.invite-role-select {
			flex: 1 1 100%;
			width: 100%;
		}
	}
</style>

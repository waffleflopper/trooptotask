<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import { Edit, Trash2, UserPlus } from '@lucide/svelte';
	import type { CriticalTasksSettings } from '$features/critical-tasks/criticalTasks.types';
	import { sortMembers } from '$features/groups/utils/sortMembers';
	import {
		DURABLE_FEATURE_LANES,
		resolveMemberAccessShapeFromStoredOrCurrent,
		TARGET_MEMBER_PRESET_CAPABILITIES,
		type CapabilityLevel,
		type DurableFeatureLane,
		type MemberAccessShape,
		type MemberPreset,
		type ScopeSet,
		type StoredMemberPreset
	} from '$lib/access/memberAccessShape';
	import { explainPolicyReasonCode } from '$lib/access/policyDecisionExplanations';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { toastStore } from '$lib/stores/toast.svelte';
	import type { OrganizationMember, PermissionPreset } from '$lib/types';
	import { getPermissionPreset } from '$lib/types';
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
	type EditablePreset = StoredMemberPreset | 'admin';
	type MemberAccessBadge = MemberPreset | 'admin' | 'owner';
	type ScopeKind = ScopeSet['kind'];
	type SectionConfig = { id: SectionId; label: string; eyebrow: string; danger?: boolean };
	type AccessLaneConfig = { id: DurableFeatureLane; label: string };
	type AccessOption = { value: EditablePreset; label: string; helper: string };

	const standardSections: SectionConfig[] = [
		{ id: 'organization', label: 'Organization', eyebrow: 'Profile' },
		{ id: 'members', label: 'Members', eyebrow: 'Access Control' },
		{ id: 'policies', label: 'Policies', eyebrow: 'Operational Defaults' },
		{ id: 'archived', label: 'Archived Personnel', eyebrow: 'Retention Queue' },
		{ id: 'data-export', label: 'Data & Export', eyebrow: 'Backup & Migration' }
	];
	const ownerSection: SectionConfig = { id: 'danger', label: 'Danger Zone', eyebrow: 'Owner Authority', danger: true };
	const sections = $derived(data.isOwner ? [...standardSections, ownerSection] : standardSections);

	let activeSection = $state<SectionId>('organization');
	let activityCollapsed = $state(false);
	let loading = $state(false);
	let memberEditorId = $state<string | null>(null);
	let inviteEmail = $state('');
	let invitePreset = $state<EditablePreset>('editor');
	let inviteScopeKind = $state<ScopeKind>('organization');
	let inviteScopeGroupIds = $state<string[]>([]);
	let memberSelectedPreset = $state<Record<string, EditablePreset>>({});
	let memberSelectedScopeKind = $state<Record<string, ScopeKind>>({});
	let memberSelectedScopeGroupIds = $state<Record<string, string[]>>({});
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
	const accessOptions: AccessOption[] = [
		{ value: 'admin', label: 'Admin', helper: 'Governance role. Can manage organization access.' },
		{ value: 'editor', label: 'Editor', helper: 'Configure feature lanes without admin governance.' },
		{ value: 'operator', label: 'Operator', helper: 'Day-to-day work across granted lanes.' },
		{ value: 'viewer', label: 'Viewer', helper: 'Read-oriented access across granted lanes.' }
	];
	const availablePresetOptions = $derived(
		data.isOwner ? accessOptions : accessOptions.filter((option) => option.value !== 'admin')
	);
	const accessLaneLabels: Record<DurableFeatureLane, string> = {
		calendar: 'Calendar',
		personnel: 'Personnel',
		training: 'Training',
		criticalTasks: 'Critical Tasks',
		onboarding: 'Onboarding',
		ratingScheme: 'Rating Scheme'
	};
	const accessLanes: AccessLaneConfig[] = DURABLE_FEATURE_LANES.map((id) => ({ id, label: accessLaneLabels[id] }));
	const capabilityOptions: Array<{ value: CapabilityLevel; label: string }> = [
		{ value: 'none', label: 'None' },
		{ value: 'view', label: 'View' },
		{ value: 'operate', label: 'Operate' },
		{ value: 'configure', label: 'Configure' }
	];
	const governanceRoleExplanation = explainPolicyReasonCode('denied:governance-role');

	const activeSectionConfig = $derived(sections.find((section) => section.id === activeSection) ?? sections[0]);
	const activeSectionDescription = $derived(getSectionDescription(activeSection));
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
	const summaryRows = $derived([
		{
			label: 'Members',
			value: String(data.members.length),
			detail: memberRoleSummary,
			target: 'members' as SectionId
		},
		{
			label: 'Pending approvals',
			value: String(data.pendingApprovalsCount),
			detail: oldestPendingApproval
				? `Oldest ${formatRelativeDate(oldestPendingApproval.created_at)}`
				: 'No pending requests',
			target: 'members' as SectionId
		},
		{
			label: 'Archived personnel',
			value: String(data.archivedPersonnel.length),
			detail: nextPurgeDate
				? `Next purge ${formatCompactDate(nextPurgeDate)}`
				: `Retention ${data.policies.retentionMonths} months`,
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
	const billingStatus = $derived(getBillingStatus(tier));
	const sessionEmail = $derived((data.session as { user?: { email?: string | null } } | null | undefined)?.user?.email);

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

	function isCurrentMember(member: OrganizationMember): boolean {
		if (sessionEmail && member.email === sessionEmail) return true;
		return Boolean(data.isOwner && member.role === 'owner');
	}

	function openMemberEditor(member: OrganizationMember): void {
		if (member.role === 'owner') return;
		const accessShape = getMemberAccessShape(member);
		const scopeGroupIds = accessShape.scopeSet.kind === 'groups' ? accessShape.scopeSet.groupIds : [];
		memberEditorId = member.id;
		memberSelectedPreset = {
			...memberSelectedPreset,
			[member.id]: member.role === 'admin' ? 'admin' : editablePresetForMemberPreset(accessShape.memberPreset)
		};
		memberSelectedScopeKind = {
			...memberSelectedScopeKind,
			[member.id]: accessShape.scopeSet.kind
		};
		memberSelectedScopeGroupIds = {
			...memberSelectedScopeGroupIds,
			[member.id]: scopeGroupIds
		};
	}

	function closeMemberEditor(memberId: string): void {
		memberEditorId = null;
		const remainingPresets = { ...memberSelectedPreset };
		const remainingScopeKinds = { ...memberSelectedScopeKind };
		const remainingScopeGroups = { ...memberSelectedScopeGroupIds };
		delete remainingPresets[memberId];
		delete remainingScopeKinds[memberId];
		delete remainingScopeGroups[memberId];
		memberSelectedPreset = remainingPresets;
		memberSelectedScopeKind = remainingScopeKinds;
		memberSelectedScopeGroupIds = remainingScopeGroups;
	}

	function getMemberAccessBadge(member: OrganizationMember, accessShape: MemberAccessShape): MemberAccessBadge {
		if (member.role === 'owner') return 'owner';
		if (member.role === 'admin') return 'admin';
		return accessShape.memberPreset;
	}

	function getAccessLabel(memberPreset: MemberAccessBadge): string {
		switch (memberPreset) {
			case 'owner':
				return 'Owner';
			case 'admin':
				return 'Admin governance';
			case 'editor':
				return 'Editor';
			case 'operator':
				return 'Operator';
			case 'viewer':
				return 'Viewer';
			case 'custom':
				return 'Custom';
			default:
				return memberPreset;
		}
	}

	function getAccessOptionHelper(preset: EditablePreset): string {
		return accessOptions.find((option) => option.value === preset)?.helper ?? '';
	}

	function editablePresetForMemberPreset(memberPreset: MemberPreset): StoredMemberPreset {
		return memberPreset === 'viewer' || memberPreset === 'operator' || memberPreset === 'editor'
			? memberPreset
			: 'editor';
	}

	function getMemberAccessShape(member: OrganizationMember) {
		return resolveMemberAccessShapeFromStoredOrCurrent({
			membershipRole: member.role,
			permissions: member,
			scopedGroupId: member.scopedGroupId,
			memberPreset: member.memberPreset,
			capabilityOverrides: member.capabilityOverrides,
			accessScopeKind: member.accessScopeKind,
			accessScopeGroupIds: member.accessScopeGroupIds
		});
	}

	function formatScopeSet(scopeSet: ScopeSet): string {
		if (scopeSet.kind === 'organization') return 'All groups';
		return scopeSet.groupIds.map((groupId) => getGroupName(groupId) ?? 'Unknown group').join(', ');
	}

	function formatCapability(level: CapabilityLevel): string {
		return level[0].toUpperCase() + level.slice(1);
	}

	function overriddenCapabilityLabels(member: OrganizationMember): string[] {
		const shape = getMemberAccessShape(member);
		const memberPreset = editablePresetForMemberPreset(shape.memberPreset);
		return accessLanes
			.filter((lane) => shape.capabilityMap[lane.id] !== TARGET_MEMBER_PRESET_CAPABILITIES[memberPreset][lane.id])
			.map((lane) => `${lane.label}: ${formatCapability(shape.capabilityMap[lane.id])}`);
	}

	function getEditorCapabilityValue(
		member: OrganizationMember,
		lane: DurableFeatureLane,
		selectedPreset: EditablePreset
	): CapabilityLevel {
		const accessShape = getMemberAccessShape(member);
		if (selectedPreset === 'admin') return TARGET_MEMBER_PRESET_CAPABILITIES.editor[lane];

		const currentPreset = editablePresetForMemberPreset(accessShape.memberPreset);
		if (selectedPreset !== currentPreset) {
			return TARGET_MEMBER_PRESET_CAPABILITIES[selectedPreset][lane];
		}

		return accessShape.capabilityMap[lane];
	}

	function getSelectedScopeKind(member: OrganizationMember): ScopeKind {
		return memberSelectedScopeKind[member.id] ?? getMemberAccessShape(member).scopeSet.kind;
	}

	function getSelectedScopeGroupIds(member: OrganizationMember): string[] {
		const current = getMemberAccessShape(member).scopeSet;
		return memberSelectedScopeGroupIds[member.id] ?? (current.kind === 'groups' ? current.groupIds : []);
	}

	function toggleMemberScopeGroup(memberId: string, groupId: string, checked: boolean): void {
		const current = memberSelectedScopeGroupIds[memberId] ?? [];
		const next = checked ? Array.from(new Set([...current, groupId])) : current.filter((id) => id !== groupId);
		memberSelectedScopeGroupIds = { ...memberSelectedScopeGroupIds, [memberId]: next };
	}

	function toggleInviteScopeGroup(groupId: string, checked: boolean): void {
		inviteScopeGroupIds = checked
			? Array.from(new Set([...inviteScopeGroupIds, groupId]))
			: inviteScopeGroupIds.filter((id) => id !== groupId);
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

<main class="flex flex-1 flex-col gap-6 p-4 md:p-6">
	<header class="grid gap-3">
		<div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
			<div class="grid gap-1">
				<p class="text-sm text-muted-foreground">{data.isOwner ? 'Owner access' : 'Admin access'}</p>
				<h1 class="text-2xl font-semibold tracking-tight">Organization Settings</h1>
				<p class="max-w-3xl text-sm text-muted-foreground">
					{data.orgName} governance, access, policies, retention, and export controls.
				</p>
			</div>
			{#if activeSection === 'members' && data.canManageMembers}
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
					<Badge variant="outline">{data.members.length} {pluralize('Member', data.members.length)}</Badge>
				</div>
				<Separator />
				<div class="rounded-md border bg-muted/30 p-3 text-sm">
					<strong>Member presets do not grant admin authority.</strong>
				</div>

				<div class="grid gap-3" role="list" aria-label="Organization members">
					{#each sortedMembers as member (member.id)}
						{@const accessShape = getMemberAccessShape(member)}
						{@const accessBadge = getMemberAccessBadge(member, accessShape)}
						{@const selectedPreset =
							memberSelectedPreset[member.id] ?? (member.role === 'admin' ? 'admin' : accessShape.memberPreset)}
						{@const selectedScopeKind = getSelectedScopeKind(member)}
						{@const selectedScopeGroupIds = getSelectedScopeGroupIds(member)}
						{@const overrides = overriddenCapabilityLabels(member)}
						<div
							class="grid gap-4 rounded-md border bg-card p-3 md:grid-cols-[auto_minmax(0,1fr)_auto]"
							role="listitem"
						>
							<div
								class="flex size-10 items-center justify-center rounded-md border bg-muted text-sm font-medium"
								aria-hidden="true"
							>
								{getMemberInitials(member.email)}
							</div>
							<div class="grid gap-2">
								<div class="grid gap-1">
									<p class="font-medium">{member.email ?? `${member.userId.slice(0, 8)}...`}</p>
									<p class="text-sm text-muted-foreground">{formatScopeSet(accessShape.scopeSet)}</p>
								</div>
								<div class="flex flex-wrap gap-2">
									<Badge variant="secondary">{getAccessLabel(accessBadge)}</Badge>
									{#each overrides as override (override)}
										<Badge variant="outline">{override}</Badge>
									{/each}
									{#if overrides.length === 0 && member.role !== 'owner' && member.role !== 'admin'}
										<Badge variant="outline">Preset defaults</Badge>
									{/if}
								</div>
							</div>
							<div class="flex flex-wrap items-start justify-end gap-2">
								{#if member.role === 'owner'}
									{#if isCurrentMember(member)}<Badge>You</Badge>{/if}
								{:else if data.canManageMembers && (member.role !== 'admin' || data.isOwner)}
									<Button type="button" variant="outline" size="sm" onclick={() => openMemberEditor(member)}>
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

							{#if memberEditorId === member.id}
								<form
									method="POST"
									action="?/updatePermissions"
									class="grid gap-4 rounded-md border bg-muted/30 p-3 md:col-span-3"
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
									<div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
										<label class="grid gap-2">
											<span class="text-sm font-medium">Access assignment</span>
											<select
												name="preset"
												class="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
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
											</select>
											<p class="text-sm text-muted-foreground">{getAccessOptionHelper(selectedPreset)}</p>
										</label>
										<div class="flex flex-wrap items-end gap-2">
											<Button type="submit" size="sm" disabled={loading}>
												{loading ? 'Saving...' : 'Save Access'}
											</Button>
											<Button type="button" variant="outline" size="sm" onclick={() => closeMemberEditor(member.id)}>
												Cancel
											</Button>
											{#if data.isOwner}
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
																value={getEditorCapabilityValue(member, lane.id, selectedPreset)}
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
															onchange={() => {
																memberSelectedScopeKind = { ...memberSelectedScopeKind, [member.id]: 'organization' };
															}}
														/>
														All groups
													</label>
													<label class="flex items-center gap-2 text-sm">
														<input
															type="radio"
															name="scope-choice-{member.id}"
															checked={selectedScopeKind === 'groups'}
															onchange={() => {
																memberSelectedScopeKind = { ...memberSelectedScopeKind, [member.id]: 'groups' };
															}}
														/>
														Selected groups
													</label>
												</div>
												{#if selectedScopeKind === 'groups'}
													<div class="grid gap-2">
														{#each data.groups as group (group.id)}
															<label class="flex items-center gap-2 text-sm">
																<input
																	type="checkbox"
																	name="accessScopeGroupIds"
																	value={group.id}
																	checked={selectedScopeGroupIds.includes(group.id)}
																	onchange={(event) =>
																		toggleMemberScopeGroup(member.id, group.id, event.currentTarget.checked)}
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

			{#if data.canManageMembers}
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
								if (!form?.inviteError) inviteEmail = '';
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
									bind:value={inviteEmail}
									required
								/>
							</div>
							<label class="grid gap-2">
								<span class="text-sm font-medium">Preset</span>
								<select
									name="preset"
									class="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
									bind:value={invitePreset}
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
						{#if invitePreset !== 'admin'}
							<div class="mt-4 grid gap-3 rounded-md border bg-muted/30 p-3">
								<input type="hidden" name="accessScopeKind" value={inviteScopeKind} />
								<div class="flex flex-wrap gap-4">
									<label class="flex items-center gap-2 text-sm">
										<input
											type="radio"
											name="inviteScopeChoice"
											checked={inviteScopeKind === 'organization'}
											onchange={() => (inviteScopeKind = 'organization')}
										/>
										All groups
									</label>
									<label class="flex items-center gap-2 text-sm">
										<input
											type="radio"
											name="inviteScopeChoice"
											checked={inviteScopeKind === 'groups'}
											onchange={() => (inviteScopeKind = 'groups')}
										/>
										Selected groups
									</label>
								</div>
								{#if inviteScopeKind === 'groups'}
									<div class="grid gap-2">
										{#each data.groups as group (group.id)}
											<label class="flex items-center gap-2 text-sm">
												<input
													type="checkbox"
													name="accessScopeGroupIds"
													value={group.id}
													checked={inviteScopeGroupIds.includes(group.id)}
													onchange={(event) => toggleInviteScopeGroup(group.id, event.currentTarget.checked)}
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

			{#if data.invitations.length > 0}
				<section
					class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground"
					aria-labelledby="pending-invites-heading"
				>
					<div class="flex items-center justify-between gap-3">
						<h3 id="pending-invites-heading" class="text-lg font-semibold tracking-tight">Pending Invitations</h3>
						<Badge variant="outline">{data.invitations.length} Pending</Badge>
					</div>
					<div class="grid gap-3">
						{#each data.invitations as invite (invite.id)}
							{@const invitePermissionPreset = getInvitePreset(invite)}
							<div class="flex flex-col gap-3 rounded-md border p-3 md:flex-row md:items-center md:justify-between">
								<div>
									<p class="font-medium">{invite.email}</p>
									<p class="text-sm text-muted-foreground">
										{getPresetLabel(invitePermissionPreset)} · Sent {formatRelativeDate(invite.createdAt)}
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
		</Tabs.Content>

		<Tabs.Content value="archived" class="grid gap-4">
			<ArchivedPersonnelSettingsSection
				archivedPersonnel={data.archivedPersonnel}
				retentionMonths={data.policies.retentionMonths}
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
			{#if data.isOwner}
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
	<Dialog.Root bind:open={showDeleteConfirm}>
		<Dialog.Content>
			<Dialog.Header>
				<Dialog.Title>Delete Organization</Dialog.Title>
				<Dialog.Description>
					This will permanently delete {data.orgName} and all associated data. This action cannot be undone.
				</Dialog.Description>
			</Dialog.Header>

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

			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (showDeleteConfirm = false)}>Cancel</Button>
				<Button type="submit" form="delete-org-form" variant="destructive" disabled={loading || !deleteConfirmMatches}>
					{loading ? 'Deleting...' : 'Delete Permanently'}
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>
{/if}

{#if showTransferConfirm && transferTargetId}
	<Dialog.Root bind:open={showTransferConfirm}>
		<Dialog.Content>
			<Dialog.Header>
				<Dialog.Title>Transfer Ownership</Dialog.Title>
				<Dialog.Description>
					You will become an Admin member and lose owner privileges. This action cannot be undone by you.
				</Dialog.Description>
			</Dialog.Header>

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

			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (showTransferConfirm = false)}>Cancel</Button>
				<Button type="submit" form="transfer-ownership-form" variant="destructive" disabled={loading}>
					{loading ? 'Transferring...' : 'Transfer Ownership'}
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>
{/if}

{#if confirmPermanentDelete}
	<Dialog.Root open={Boolean(confirmPermanentDelete)} onOpenChange={(open) => !open && (confirmPermanentDelete = null)}>
		<Dialog.Content>
			<Dialog.Header>
				<Dialog.Title>Permanently Delete Personnel</Dialog.Title>
				<Dialog.Description>
					Are you sure you want to permanently delete {confirmPermanentDelete.name}? This action cannot be undone and
					all associated records will be lost.
				</Dialog.Description>
			</Dialog.Header>
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (confirmPermanentDelete = null)}>Cancel</Button>
				<Button type="button" variant="destructive" onclick={() => handlePermanentDelete(confirmPermanentDelete!.id)}>
					Permanently Delete
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>
{/if}

{#if pendingRemoveMemberForm}
	<Dialog.Root
		open={Boolean(pendingRemoveMemberForm)}
		onOpenChange={(open) => {
			if (!open) {
				pendingRemoveMemberForm = null;
				pendingRemoveMemberEmail = '';
			}
		}}
	>
		<Dialog.Content>
			<Dialog.Header>
				<Dialog.Title>Remove Member</Dialog.Title>
				<Dialog.Description>Remove {pendingRemoveMemberEmail} from this organization?</Dialog.Description>
			</Dialog.Header>
			<Dialog.Footer>
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
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>
{/if}

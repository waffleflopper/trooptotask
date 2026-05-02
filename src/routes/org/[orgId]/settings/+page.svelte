<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import type { CriticalTasksSettings } from '$features/critical-tasks/criticalTasks.types';
	import { sortMembers } from '$features/groups/utils/sortMembers';
	import {
		DURABLE_FEATURE_LANES,
		isCapabilityLevel,
		resolveStoredMemberAccessShape,
		TARGET_MEMBER_PRESET_CAPABILITIES,
		type CapabilityLevel,
		type CapabilityMap,
		type DurableFeatureLane,
		type MemberAccessShape,
		type MemberPreset,
		type ScopeSet,
		type StoredMemberPreset
	} from '$lib/access/memberAccessShape';
	import { explainPolicyReasonCode } from '$lib/access/policyDecisionExplanations';
	import Modal from '$lib/components/Modal.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import type { OrganizationMember, PermissionPreset } from '$lib/types';
	import { getPermissionPreset, resolveRatingSchemePermissions } from '$lib/types';
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

	function accessBadgeClass(memberPreset: MemberAccessBadge): string {
		return `member-role member-role--${memberPreset.replace(/[^a-z0-9]+/g, '-')}`;
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

	function editablePresetForMemberPreset(memberPreset: MemberPreset): StoredMemberPreset {
		return memberPreset === 'viewer' || memberPreset === 'operator' || memberPreset === 'editor'
			? memberPreset
			: 'editor';
	}

	function getMemberAccessShape(member: OrganizationMember) {
		const storedPreset = normalizeStoredPreset(member.memberPreset);
		if (storedPreset) {
			return resolveStoredMemberAccessShape({
				membershipRole: member.role,
				memberPreset: storedPreset,
				capabilityOverrides: normalizeCapabilityOverrides(member.capabilityOverrides),
				scopeSet: normalizeStoredScope(member),
				canManageMembers: member.canManageMembers
			});
		}

		const ratingScheme = resolveRatingSchemePermissions(member);
		return resolveStoredMemberAccessShape({
			membershipRole: member.role,
			memberPreset: member.role === 'admin' ? 'editor' : storedPresetForPreset(getMemberPreset(member)),
			capabilityOverrides: currentCapabilityOverrides(member, ratingScheme),
			scopeSet: member.scopedGroupId ? { kind: 'groups', groupIds: [member.scopedGroupId] } : { kind: 'organization' },
			canManageMembers: member.canManageMembers
		});
	}

	function normalizeStoredPreset(value: unknown): StoredMemberPreset | null {
		return value === 'viewer' || value === 'operator' || value === 'editor' ? value : null;
	}

	function storedPresetForPreset(preset: PermissionPreset): StoredMemberPreset {
		if (preset === 'viewer') return 'viewer';
		if (preset === 'team-leader') return 'operator';
		return 'editor';
	}

	function normalizeCapabilityOverrides(value: unknown) {
		const overrides: Partial<Record<DurableFeatureLane, CapabilityLevel>> = {};
		if (!value || typeof value !== 'object') return overrides;
		const record = value as Record<string, unknown>;
		for (const lane of accessLanes) {
			const level = record[lane.id];
			if (isCapabilityLevel(level)) {
				overrides[lane.id] = level;
			}
		}
		return overrides;
	}

	function normalizeStoredScope(member: OrganizationMember): ScopeSet {
		if (member.accessScopeKind === 'groups') {
			const groupIds = Array.from(new Set((member.accessScopeGroupIds ?? []).filter(Boolean)));
			return groupIds.length > 0 ? { kind: 'groups', groupIds } : { kind: 'organization' };
		}
		return { kind: 'organization' };
	}

	function currentCapabilityOverrides(
		member: OrganizationMember,
		ratingScheme: { canViewRatingScheme: boolean; canEditRatingScheme: boolean }
	) {
		const map: CapabilityMap = {
			calendar: member.canEditCalendar ? 'configure' : member.canViewCalendar ? 'view' : 'none',
			personnel: member.canEditPersonnel ? 'configure' : member.canViewPersonnel ? 'view' : 'none',
			training: member.canEditTraining ? 'configure' : member.canViewTraining ? 'view' : 'none',
			criticalTasks: member.canEditCriticalTasks ? 'configure' : member.canViewCriticalTasks ? 'view' : 'none',
			onboarding: member.canEditOnboarding ? 'configure' : member.canViewOnboarding ? 'view' : 'none',
			ratingScheme: ratingScheme.canEditRatingScheme ? 'configure' : ratingScheme.canViewRatingScheme ? 'view' : 'none'
		};
		const preset = member.role === 'admin' ? 'editor' : storedPresetForPreset(getMemberPreset(member));
		const overrides: Partial<Record<DurableFeatureLane, CapabilityLevel>> = {};
		for (const lane of accessLanes) {
			if (map[lane.id] !== TARGET_MEMBER_PRESET_CAPABILITIES[preset][lane.id]) {
				overrides[lane.id] = map[lane.id];
			}
		}
		return overrides;
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
				{#if activeSectionDescription}
					<p class="content-description">{activeSectionDescription}</p>
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
						<h3 id="roster-access-heading">Access Management</h3>
						<p class="state-label">{data.members.length} {pluralize('Member', data.members.length)}</p>
					</div>
					<div class="access-guidance">
						<strong>Member presets do not grant admin authority.</strong>
						<span>Viewer, Operator, and Editor shape feature access. {governanceRoleExplanation}</span>
					</div>

					<div class="member-ledger" role="list" aria-label="Organization members">
						{#each sortedMembers as member (member.id)}
							{@const accessShape = getMemberAccessShape(member)}
							{@const accessBadge = getMemberAccessBadge(member, accessShape)}
							{@const selectedPreset =
								memberSelectedPreset[member.id] ?? (member.role === 'admin' ? 'admin' : accessShape.memberPreset)}
							{@const selectedScopeKind = getSelectedScopeKind(member)}
							{@const selectedScopeGroupIds = getSelectedScopeGroupIds(member)}
							{@const overrides = overriddenCapabilityLabels(member)}
							<div class="member-row" role="listitem">
								<div class="member-avatar" aria-hidden="true">{getMemberInitials(member.email)}</div>
								<div class="member-main">
									<p class="member-email">{member.email ?? `${member.userId.slice(0, 8)}...`}</p>
									<p class="member-meta">{formatScopeSet(accessShape.scopeSet)}</p>
									<div class="access-summary">
										<span>{getAccessLabel(accessBadge)}</span>
										{#each overrides as override (override)}
											<span>{override}</span>
										{/each}
										{#if overrides.length === 0 && member.role !== 'owner' && member.role !== 'admin'}
											<span>Preset defaults</span>
										{/if}
									</div>
								</div>
								<div class="member-actions">
									<span class={accessBadgeClass(accessBadge)}>
										{getAccessLabel(accessBadge)}
									</span>
									{#if member.role === 'owner'}
										{#if isCurrentMember(member)}<span class="member-you">You</span>{/if}
									{:else if data.canManageMembers && (member.role !== 'admin' || data.isOwner)}
										<button type="button" class="member-action" onclick={() => openMemberEditor(member)}>
											Manage Access
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
												<span>Access assignment</span>
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
												</select>
											</label>
											<div class="member-editor__actions">
												<button type="submit" class="btn btn-primary btn-sm" disabled={loading}>
													{loading ? 'Saving...' : 'Save Access'}
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

										{#if selectedPreset !== 'admin'}
											<input type="hidden" name="accessScopeKind" value={selectedScopeKind} />
											<div class="access-editor-grid">
												<section class="access-editor-panel" aria-labelledby="capability-overrides-{member.id}">
													<h4 id="capability-overrides-{member.id}">Capability Overrides</h4>
													<p>Override individual lanes only when the preset default is not enough.</p>
													<div class="capability-grid">
														{#each accessLanes as lane (lane.id)}
															<label>
																<span>{lane.label}</span>
																<select
																	name="capability:{lane.id}"
																	class="input"
																	value={accessShape.capabilityMap[lane.id]}
																>
																	{#each capabilityOptions as option (option.value)}
																		<option value={option.value}>{option.label}</option>
																	{/each}
																</select>
															</label>
														{/each}
													</div>
												</section>
												<section class="access-editor-panel" aria-labelledby="scope-set-{member.id}">
													<h4 id="scope-set-{member.id}">Scope Set</h4>
													<p>Scope is shared across scoped feature lanes. It is not configured per feature.</p>
													<div class="scope-choice">
														<label>
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
														<label>
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
														<div class="scope-group-list">
															{#each data.groups as group (group.id)}
																<label>
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
									<select
										name="preset"
										class="input invite-role-select"
										bind:value={invitePreset}
										aria-label="Invite member preset"
									>
										{#each availablePresetOptions as option (option.value)}
											<option value={option.value}>{option.label}</option>
										{/each}
									</select>
									<button type="submit" class="btn btn-primary" disabled={loading}>
										{loading ? 'Inviting...' : 'Invite'}
									</button>
								</div>
							</div>
							{#if invitePreset !== 'admin'}
								<div class="invite-access-options">
									<input type="hidden" name="accessScopeKind" value={inviteScopeKind} />
									<div class="scope-choice">
										<label>
											<input
												type="radio"
												name="inviteScopeChoice"
												checked={inviteScopeKind === 'organization'}
												onchange={() => (inviteScopeKind = 'organization')}
											/>
											All groups
										</label>
										<label>
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
										<div class="scope-group-list">
											{#each data.groups as group (group.id)}
												<label>
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

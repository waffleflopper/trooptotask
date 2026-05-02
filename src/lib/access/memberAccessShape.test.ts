import { describe, expect, it } from 'vitest';
import {
	currentPresetToMemberAccessShape,
	currentPresetToMemberAccessStorage,
	createCompatibilityLaneMap,
	getPermissionPreset,
	isFullEditor,
	PERMISSION_PRESETS,
	resolveMemberAccessShapeFromStoredOrCurrent,
	resolveStoredMemberAccessShape,
	resolveCurrentPresetPermissions,
	resolveCurrentUpdatePermissions,
	serializeScopeSetForStorage,
	toCurrentPermissionFlags,
	toMemberAccessShape,
	TARGET_MEMBER_PRESET_CAPABILITIES,
	type MemberAccessShape
} from './memberAccessShape';
import type { OrganizationMemberPermissions } from '$lib/types';

describe('member access shape', () => {
	it('maps current Viewer to target Viewer with view capabilities', () => {
		const shape = currentPresetToMemberAccessShape({ preset: 'viewer' });

		expect(shape.membershipRole).toBe('member');
		expect(shape.memberPreset).toBe('viewer');
		expect(shape.scopeSet).toEqual({ kind: 'organization' });
		expect(shape.capabilityMap).toEqual({
			calendar: 'view',
			personnel: 'view',
			training: 'view',
			criticalTasks: 'view',
			onboarding: 'view',
			ratingScheme: 'view'
		});
		expect(shape.compatibilityLanes).toEqual({ leadersBook: 'view' });
	});

	it('maps current Team Leader to target Operator with a group scope set', () => {
		const shape = currentPresetToMemberAccessShape({ preset: 'team-leader', scopedGroupId: 'group-1' });

		expect(shape.membershipRole).toBe('member');
		expect(shape.memberPreset).toBe('operator');
		expect(shape.scopeSet).toEqual({ kind: 'groups', groupIds: ['group-1'] });
		expect(Object.values(shape.capabilityMap)).toEqual([
			'configure',
			'configure',
			'configure',
			'configure',
			'configure',
			'configure'
		]);
	});

	it('maps current Full Editor to target Editor with organization scope', () => {
		const shape = currentPresetToMemberAccessShape({ preset: 'full-editor' });

		expect(shape.membershipRole).toBe('member');
		expect(shape.memberPreset).toBe('editor');
		expect(shape.scopeSet).toEqual({ kind: 'organization' });
		expect(shape.canManageMembers).toBe(false);
		expect(toCurrentPermissionFlags(shape)).toEqual(PERMISSION_PRESETS['full-editor']);
	});

	it('maps current Admin to governance role admin instead of a distinct member preset', () => {
		const shape = currentPresetToMemberAccessShape({ preset: 'admin' });

		expect(shape.membershipRole).toBe('admin');
		expect(shape.memberPreset).toBe('editor');
		expect(shape.canManageMembers).toBe(true);
		expect(toCurrentPermissionFlags(shape)).toEqual(PERMISSION_PRESETS.admin);
	});

	it("keeps Leader's Book outside the durable capability map", () => {
		const shape = currentPresetToMemberAccessShape({ preset: 'viewer' });

		expect(Object.keys(shape.capabilityMap)).not.toContain('leadersBook');
		expect(shape.compatibilityLanes.leadersBook).toBe('view');
	});

	it('does not emit operate from current boolean compatibility', () => {
		const customPermissions: OrganizationMemberPermissions = {
			...PERMISSION_PRESETS.viewer,
			canEditCalendar: true,
			canViewTraining: false
		};

		const shape = toMemberAccessShape({ permissions: customPermissions });

		expect(Object.values(shape.capabilityMap)).not.toContain('operate');
		expect(shape.capabilityMap.calendar).toBe('configure');
		expect(shape.capabilityMap.training).toBe('none');
	});

	it('can map target operate back to current view-only flags without pretending edit exists', () => {
		const shape: MemberAccessShape = {
			...currentPresetToMemberAccessShape({ preset: 'viewer' }),
			capabilityMap: {
				calendar: 'operate',
				personnel: 'operate',
				training: 'operate',
				criticalTasks: 'operate',
				onboarding: 'operate',
				ratingScheme: 'operate'
			},
			compatibilityLanes: createCompatibilityLaneMap('operate')
		};

		expect(toCurrentPermissionFlags(shape)).toEqual(PERMISSION_PRESETS.viewer);
	});

	it('exposes target Operator as operate capabilities', () => {
		expect(TARGET_MEMBER_PRESET_CAPABILITIES.operator).toEqual({
			calendar: 'operate',
			personnel: 'operate',
			training: 'operate',
			criticalTasks: 'operate',
			onboarding: 'operate',
			ratingScheme: 'operate'
		});
	});

	it('resolves a stored platform preset with explicit lane overrides while preserving preset lineage', () => {
		const shape = resolveStoredMemberAccessShape({
			membershipRole: 'member',
			memberPreset: 'viewer',
			capabilityOverrides: {
				calendar: 'operate',
				ratingScheme: 'none'
			},
			scopeSet: { kind: 'groups', groupIds: ['group-alpha', 'group-bravo', 'group-alpha'] }
		});

		expect(shape.memberPreset).toBe('viewer');
		expect(shape.capabilityMap).toEqual({
			...TARGET_MEMBER_PRESET_CAPABILITIES.viewer,
			calendar: 'operate',
			ratingScheme: 'none'
		});
		expect(shape.scopeSet).toEqual({ kind: 'groups', groupIds: ['group-alpha', 'group-bravo'] });
		expect(shape.canManageMembers).toBe(false);
	});

	it('resolves stored-or-current access from stored columns when they exist', () => {
		const shape = resolveMemberAccessShapeFromStoredOrCurrent({
			membershipRole: 'member',
			permissions: PERMISSION_PRESETS['full-editor'],
			scopedGroupId: null,
			memberPreset: 'viewer',
			capabilityOverrides: { calendar: 'operate', ratingScheme: 'none', unknown: 'configure' },
			accessScopeKind: 'groups',
			accessScopeGroupIds: ['group-alpha', 'group-alpha', 'group-bravo']
		});

		expect(shape.memberPreset).toBe('viewer');
		expect(shape.capabilityMap.calendar).toBe('operate');
		expect(shape.capabilityMap.ratingScheme).toBe('none');
		expect(shape.scopeSet).toEqual({ kind: 'groups', groupIds: ['group-alpha', 'group-bravo'] });
	});

	it('falls back to current permission flags when stored access columns are missing', () => {
		const shape = resolveMemberAccessShapeFromStoredOrCurrent({
			membershipRole: 'member',
			permissions: PERMISSION_PRESETS['full-editor'],
			scopedGroupId: 'group-alpha'
		});

		expect(shape.memberPreset).toBe('operator');
		expect(shape.capabilityMap).toEqual(TARGET_MEMBER_PRESET_CAPABILITIES.editor);
		expect(shape.scopeSet).toEqual({ kind: 'groups', groupIds: ['group-alpha'] });
	});

	it('translates current Team Leader storage as Operator lineage plus configure overrides and multi-group-ready scope columns', () => {
		const storage = currentPresetToMemberAccessStorage({
			preset: 'team-leader',
			scopedGroupId: 'group-alpha'
		});

		expect(storage.memberPreset).toBe('operator');
		expect(storage.capabilityOverrides).toEqual({
			calendar: 'configure',
			personnel: 'configure',
			training: 'configure',
			criticalTasks: 'configure',
			onboarding: 'configure',
			ratingScheme: 'configure'
		});
		expect(serializeScopeSetForStorage(storage.scopeSet)).toEqual({
			access_scope_kind: 'groups',
			access_scope_group_ids: ['group-alpha']
		});
	});

	it('preserves current preset inference with rating-scheme compatibility fallbacks', () => {
		const permissionsWithoutRatingSchemeColumns = {
			...PERMISSION_PRESETS['full-editor'],
			canViewRatingScheme: undefined,
			canEditRatingScheme: undefined
		};

		expect(getPermissionPreset(permissionsWithoutRatingSchemeColumns)).toBe('full-editor');
		expect(getPermissionPreset(permissionsWithoutRatingSchemeColumns, 'group-1')).toBe('team-leader');
	});

	it('centralizes current write mapping for presets and custom permissions', () => {
		expect(resolveCurrentPresetPermissions('unknown')).toEqual(PERMISSION_PRESETS['full-editor']);

		expect(
			resolveCurrentUpdatePermissions('custom', {
				canViewCalendar: true,
				canEditRatingScheme: true,
				canEditLeadersBook: true
			})
		).toEqual({
			canViewCalendar: true,
			canEditCalendar: false,
			canViewPersonnel: false,
			canEditPersonnel: false,
			canViewTraining: false,
			canEditTraining: false,
			canViewCriticalTasks: false,
			canEditCriticalTasks: false,
			canViewOnboarding: false,
			canEditOnboarding: false,
			canViewRatingScheme: true,
			canEditRatingScheme: true,
			canViewLeadersBook: true,
			canEditLeadersBook: true,
			canManageMembers: false
		});
	});

	it('keeps full-editor compatibility tied to organization-wide configure access', () => {
		expect(isFullEditor(PERMISSION_PRESETS['full-editor'])).toBe(true);
		expect(isFullEditor(PERMISSION_PRESETS.viewer)).toBe(false);
		expect(isFullEditor({ ...PERMISSION_PRESETS['full-editor'], canEditCriticalTasks: false })).toBe(false);
		expect(isFullEditor({ ...PERMISSION_PRESETS['full-editor'], canEditRatingScheme: false })).toBe(false);
		expect(isFullEditor(PERMISSION_PRESETS['full-editor'], 'group-1')).toBe(false);
	});
});

import { describe, expect, it } from 'vitest';
import {
	currentPresetToMemberAccessShape,
	getPermissionPreset,
	isFullEditor,
	PERMISSION_PRESETS,
	resolveCurrentPresetPermissions,
	resolveCurrentUpdatePermissions,
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

	it('keeps Leaders Book outside the durable capability map', () => {
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
			compatibilityLanes: { leadersBook: 'operate' }
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
	});
});

import { describe, expect, it } from 'vitest';
import { memberAccessCommandToStorage, parseMemberAccessEditFormData } from './memberAccessCommands';

describe('parseMemberAccessEditFormData', () => {
	it('parses target membership role, member preset, capability map, and scope set fields', () => {
		const formData = new FormData();
		formData.set('membershipRole', 'member');
		formData.set('memberPreset', 'operator');
		formData.set('capabilityOverride:calendar', 'configure');
		formData.set('scopeSetKind', 'groups');
		formData.append('scopeSetGroupIds', 'group-alpha');
		formData.append('scopeSetGroupIds', 'group-alpha');
		formData.append('scopeSetGroupIds', 'group-bravo');

		expect(parseMemberAccessEditFormData(formData)).toEqual({
			membershipRole: 'member',
			memberAccess: {
				memberPreset: 'operator',
				capabilityOverrides: { calendar: 'configure' },
				scopeSet: { kind: 'groups', groupIds: ['group-alpha', 'group-bravo'] }
			}
		});
	});

	it('keeps admin authority separate from member access edits', () => {
		const formData = new FormData();
		formData.set('membershipRole', 'admin');
		formData.set('memberPreset', 'viewer');
		formData.set('capabilityOverride:calendar', 'none');
		formData.set('scopeSetKind', 'groups');
		formData.set('scopeSetGroupIds', 'group-alpha');

		expect(parseMemberAccessEditFormData(formData)).toEqual({
			membershipRole: 'admin',
			memberAccess: {
				memberPreset: 'editor',
				capabilityOverrides: {},
				scopeSet: { kind: 'organization' }
			}
		});
	});

	it('rejects member access edits without a target member preset', () => {
		const formData = new FormData();
		formData.set('membershipRole', 'member');

		expect(() => parseMemberAccessEditFormData(formData)).toThrow('Member preset is required');
	});
});

describe('memberAccessCommandToStorage', () => {
	it('projects a member access command into storage and compatibility fields', () => {
		expect(
			memberAccessCommandToStorage({
				membershipRole: 'member',
				memberAccess: {
					memberPreset: 'operator',
					capabilityOverrides: { calendar: 'configure', ratingScheme: 'none' },
					scopeSet: { kind: 'groups', groupIds: ['group-alpha', 'group-bravo'] }
				}
			})
		).toEqual({
			role: 'member',
			singleGroupCompatibilityId: 'group-alpha',
			permissions: {
				canViewCalendar: true,
				canEditCalendar: true,
				canViewPersonnel: true,
				canEditPersonnel: false,
				canViewTraining: true,
				canEditTraining: false,
				canViewCriticalTasks: true,
				canEditCriticalTasks: false,
				canViewOnboarding: true,
				canEditOnboarding: false,
				canViewRatingScheme: false,
				canEditRatingScheme: false,
				canManageMembers: false
			},
			memberPreset: 'operator',
			capabilityOverrides: { calendar: 'configure', ratingScheme: 'none' },
			accessScopeKind: 'groups',
			accessScopeGroupIds: ['group-alpha', 'group-bravo']
		});
	});

	it('projects admin authority without requiring a separate member preset edit', () => {
		const storage = memberAccessCommandToStorage({
			membershipRole: 'admin'
		});

		expect(storage.role).toBe('admin');
		expect(storage.memberPreset).toBe('editor');
		expect(storage.accessScopeKind).toBe('organization');
		expect(storage.accessScopeGroupIds).toEqual([]);
		expect(storage.permissions.canManageMembers).toBe(true);
		expect(storage.permissions.canEditPersonnel).toBe(true);
	});
});

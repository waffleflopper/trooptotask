import { describe, expect, it } from 'vitest';
import { memberAccessCommandToStorage, parseMemberAccessEditFormData } from './memberAccessCommands';

describe('parseMemberAccessEditFormData', () => {
	it('parses target membership role, member preset, capability map, and scope set fields', () => {
		const formData = new FormData();
		formData.set('membershipRole', 'member');
		formData.set('memberPreset', 'operator');
		formData.set('capabilityOverride:calendar', 'configure');
		formData.set('scopeSetKind', 'groups');
		formData.append('scopeSetGroupIds', '11111111-1111-4111-8111-111111111111');
		formData.append('scopeSetGroupIds', '11111111-1111-4111-8111-111111111111');
		formData.append('scopeSetGroupIds', 'not-a-uuid');
		formData.append('scopeSetGroupIds', '22222222-2222-4222-8222-222222222222');

		expect(parseMemberAccessEditFormData(formData)).toEqual({
			membershipRole: 'member',
			memberAccess: {
				memberPreset: 'operator',
				capabilityOverrides: { calendar: 'configure' },
				scopeSet: {
					kind: 'groups',
					groupIds: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']
				}
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

	it.each([{ groupIds: [] }, { groupIds: ['not-a-uuid', 'also-not-a-uuid'] }])(
		'stores an explicit Group selection %j without widening access',
		({ groupIds }) => {
			const formData = new FormData();
			formData.set('membershipRole', 'member');
			formData.set('memberPreset', 'editor');
			formData.set('scopeSetKind', 'groups');
			for (const groupId of groupIds) formData.append('scopeSetGroupIds', groupId);

			expect(memberAccessCommandToStorage(parseMemberAccessEditFormData(formData))).toMatchObject({
				accessScopeKind: 'groups',
				accessScopeGroupIds: []
			});
		}
	);

	it('rejects member access edits without a target member preset', () => {
		const formData = new FormData();
		formData.set('membershipRole', 'member');

		expect(() => parseMemberAccessEditFormData(formData)).toThrow('Member preset is required');
	});
});

describe('memberAccessCommandToStorage', () => {
	it.each([{ groupIds: [] }, { groupIds: ['not-a-uuid'] }])(
		'keeps empty or invalid-only typed Group selections %j restricted',
		({ groupIds }) => {
			expect(
				memberAccessCommandToStorage({
					membershipRole: 'member',
					memberAccess: {
						memberPreset: 'operator',
						capabilityOverrides: {},
						scopeSet: { kind: 'groups', groupIds }
					}
				})
			).toMatchObject({ accessScopeKind: 'groups', accessScopeGroupIds: [] });
		}
	);

	it('projects a member access command into replacement storage fields only', () => {
		expect(
			memberAccessCommandToStorage({
				membershipRole: 'member',
				memberAccess: {
					memberPreset: 'operator',
					capabilityOverrides: { calendar: 'configure', ratingScheme: 'none' },
					scopeSet: {
						kind: 'groups',
						groupIds: ['11111111-1111-4111-8111-111111111111', 'not-a-uuid', '22222222-2222-4222-8222-222222222222']
					}
				}
			})
		).toEqual({
			role: 'member',
			memberPreset: 'operator',
			capabilityOverrides: { calendar: 'configure', ratingScheme: 'none' },
			accessScopeKind: 'groups',
			accessScopeGroupIds: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']
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
	});
});

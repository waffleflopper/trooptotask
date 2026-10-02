import { describe, expect, it } from 'vitest';
import { loadPersonnelDocumentStorageCapBytes } from './personnelDocumentSettings.server';

describe('Organization Personnel document storage setting', () => {
	it.each([null, undefined])('defaults an absent setting (%s) to 100 MiB', async (setting) => {
		await expect(
			loadPersonnelDocumentStorageCapBytes({ findStorageCapBytes: async () => setting }, 'org-a')
		).resolves.toBe(104857600);
	});

	it.each([0, 1234])('retains a configured cap of %s bytes in the admitted Organization', async (cap) => {
		const settings = new Map([
			['org-a', cap],
			['org-b', 9999]
		]);
		await expect(
			loadPersonnelDocumentStorageCapBytes({ findStorageCapBytes: async (orgId) => settings.get(orgId) }, 'org-a')
		).resolves.toBe(cap);
	});

	it('propagates a failed settings read instead of applying the default', async () => {
		await expect(
			loadPersonnelDocumentStorageCapBytes(
				{
					findStorageCapBytes: async () => {
						throw new Error('Settings unavailable');
					}
				},
				'org-a'
			)
		).rejects.toThrow('Settings unavailable');
	});
});

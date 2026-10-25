import { describe, expect, it } from 'vitest';
import { ADMIN_SECTIONS, isAdminSectionActive } from './sections';

const activeKeys = (pathname: string) =>
	ADMIN_SECTIONS.filter((section) => isAdminSectionActive(section, pathname)).map((section) => section.key);

describe('admin sections', () => {
	it.each([
		['/admin', ['inbox']],
		['/admin/organizations', ['organizations']],
		['/admin/organizations/abc', ['organizations']],
		['/admin/people', ['people']],
		['/admin/users/abc', ['people']],
		['/admin/audit', ['activity']],
		['/admin/activity', ['activity']],
		['/admin/announcements', ['announcements']],
		['/admin/organizationsX', []]
	])('%s selects %j', (pathname, expected) => {
		expect(activeKeys(pathname)).toEqual(expected);
	});
});

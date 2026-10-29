import { expect, it } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import { NESTED_GROUPS } from '$lib/test-support/nestedGroups';
import { buildCriticalTasksMatrix } from './criticalTasksMatrix';
import { buildCriticalTasksMatrixWorkbook } from './ictWorkbookExport';

it('writes the visible nested Group path in the Critical Tasks matrix workbook', async () => {
	const person: Personnel = {
		id: 'person',
		rank: 'SPC',
		firstName: 'Pat',
		lastName: 'Lee',
		mos: '',
		clinicRole: '',
		groupId: 'alpha',
		groupName: 'Alpha Team'
	};
	const matrix = buildCriticalTasksMatrix({
		personnel: [person],
		tasks: [],
		completions: [],
		groups: NESTED_GROUPS,
		asOf: '2026-10-01'
	});
	const workbook = await buildCriticalTasksMatrixWorkbook(matrix, NESTED_GROUPS);
	expect(workbook.getWorksheet('Critical Task Matrix')?.getCell('E2').value).toBe(
		'1st Platoon / 2nd Squad / Alpha Team'
	);
});

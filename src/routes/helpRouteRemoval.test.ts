import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const filesWithFormerHelpEntryPoints = [
	'src/lib/components/TopHeader.svelte',
	'src/lib/components/ui/HelpPanel.svelte',
	'src/lib/components/public/PublicFooter.svelte',
	'src/routes/dashboard/+page.svelte'
];

describe('removed standalone help route', () => {
	it('does not keep the old full-page help route file', () => {
		expect(existsSync('src/routes/help/+page.svelte')).toBe(false);
	});

	it('does not link former help entry points to /help', () => {
		for (const file of filesWithFormerHelpEntryPoints) {
			const source = readFileSync(file, 'utf8');

			expect(source, file).not.toContain('"/help"');
			expect(source, file).not.toContain("'/help'");
			expect(source, file).not.toContain('/help`');
		}
	});
});

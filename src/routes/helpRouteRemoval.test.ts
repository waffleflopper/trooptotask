import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const filesWithFormerHelpEntryPoints = [
	'src/lib/components/TopHeader.svelte',
	'src/lib/components/ui/HelpPanel.svelte',
	'src/lib/components/public/PublicFooter.svelte',
	'src/routes/dashboard/+page.svelte'
];

function svelteKitRouteIds(): string[] {
	const script = `
		const { load_config } = await import('./node_modules/@sveltejs/kit/src/core/config/index.js');
		const { default: create_manifest_data } = await import('./node_modules/@sveltejs/kit/src/core/sync/create_manifest_data/index.js');
		const config = await load_config({ cwd: process.cwd() });
		const manifest = create_manifest_data({ config, cwd: process.cwd() });
		console.log(JSON.stringify(manifest.routes.map((route) => route.id)));
	`;

	return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' }));
}

describe('removed standalone help route', () => {
	it('does not keep the old full-page help route file', () => {
		expect(existsSync('src/routes/help/+page.svelte')).toBe(false);
	});

	it('does not resolve /help in SvelteKit route generation', () => {
		expect(svelteKitRouteIds()).not.toContain('/help');
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

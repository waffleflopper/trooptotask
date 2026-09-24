import { describe, expect, it } from 'vitest';
import { checkModuleBoundaries, type Manifest } from './module-boundaries';
import { newViolations } from './module-governance';
import { buildImportGraph } from './module-imports';

const manifest: Manifest = {
	owners: {
		alpha: { roots: ['src/features/alpha/'], files: [], packet: '08-M04' },
		beta: { roots: ['src/features/beta/'], files: [], packet: '08-M05' }
	},
	rootExclusions: {},
	dependencies: { alpha: ['beta'], beta: [] },
	publicRoots: {},
	publicFiles: { alpha: ['src/features/alpha/index.ts'], beta: ['src/features/beta/index.ts'] },
	mixedFiles: {}
};

function findings(alpha: string) {
	const sources = [
		{ path: 'src/features/alpha/index.ts', content: alpha },
		{ path: 'src/features/beta/index.ts', content: 'export const publicValue = true;' },
		{ path: 'src/features/beta/private.ts', content: 'export const secret = true;' }
	];
	const graph = buildImportGraph(sources, (candidate) => sources.some((source) => source.path === candidate));
	return checkModuleBoundaries({ sourcePaths: sources.map((source) => source.path), ...graph }, manifest);
}

describe('module governance regression gate', () => {
	it('fails a newly introduced private import even while existing debt remains reported', () => {
		const before = findings("import { secret } from '$features/beta/private';");
		const after = findings(
			"import { secret } from '$features/beta/private'; import { again } from '$features/beta/private';"
		);
		expect(before.map((issue) => issue.kind)).toContain('private');
		expect(newViolations(after, before).map((issue) => issue.kind)).toContain('private');
	});

	it('does not classify unchanged or removed debt as a new violation', () => {
		const before = findings("import { secret } from '$features/beta/private';");
		expect(newViolations(before, before)).toEqual([]);
		expect(newViolations(findings("import { publicValue } from '$features/beta';"), before)).toEqual([]);
	});
});

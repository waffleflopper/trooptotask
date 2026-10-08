import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import type { Manifest } from './module-boundaries';
import { runModuleGovernance } from './module-governance';

it('fails every module-boundary finding in the scanned repository', () => {
	const directory = mkdtempSync(path.join(os.tmpdir(), 't2t-module-governance-'));
	const write = (file: string, content: string) => {
		mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
		writeFileSync(path.join(directory, file), content);
	};
	try {
		const manifest: Manifest = {
			owners: {
				alpha: { roots: ['src/features/alpha/'], files: [], packet: '08-M04' },
				beta: { roots: ['src/features/beta/'], files: [], packet: '08-M05' }
			},
			rootExclusions: {},
			dependencies: { alpha: ['beta'], beta: [] },
			publicRoots: {},
			publicFiles: { alpha: ['src/features/alpha/index.server.ts'], beta: ['src/features/beta/index.server.ts'] },
			mixedFiles: {}
		};
		write('scripts/module-boundaries.json', JSON.stringify(manifest));
		write('src/features/alpha/index.server.ts', "import '$features/beta/index.server'; export const value = true;");
		write('src/features/beta/index.server.ts', 'export const beta = true;');
		write('src/features/beta/private.server.ts', 'export const secret = true;');
		expect(runModuleGovernance(directory)).toEqual([]);

		write('src/features/alpha/index.server.ts', "import '$features/beta/private.server'; export const value = true;");
		expect(runModuleGovernance(directory).map(({ kind }) => kind)).toContain('private');

		write('src/features/alpha/index.server.ts', "import '$features/beta/index.server'; export const value = true;");
		write('src/features/beta/index.server.ts', "import '$features/alpha/index.server'; export const beta = true;");
		expect(runModuleGovernance(directory).map(({ kind }) => kind)).toEqual(
			expect.arrayContaining(['current-cycle', 'source-cycle'])
		);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

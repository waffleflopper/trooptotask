import { readFileSync } from 'node:fs';
import path from 'node:path';
import { checkModuleBoundaries, type Manifest, type Violation } from './module-boundaries.ts';
import { scanRepository } from './module-imports.ts';

function runModuleGovernance(repoRoot = process.cwd()): Violation[] {
	const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'scripts/module-boundaries.json'), 'utf8')) as Manifest;
	const findings = checkModuleBoundaries(scanRepository(repoRoot), manifest);
	console.log(`Module boundaries: ${findings.length} findings. Full report: node scripts/module-boundaries.ts`);
	return findings;
}

export { runModuleGovernance };

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkDocuments } from './documents.mjs';

const roots: string[] = [];
function repository(files: Record<string, string>) {
	const root = mkdtempSync(path.join(tmpdir(), 'ci-documents-'));
	roots.push(root);
	for (const [file, content] of Object.entries(files)) {
		const destination = path.join(root, file);
		mkdirSync(path.dirname(destination), { recursive: true });
		writeFileSync(destination, content);
	}
	return root;
}
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

describe('changed document links', () => {
	it('accepts local navigation, assets, references and encoded Unicode heading links', () => {
		const root = repository({
			'README.md': [
				'[guide](docs/Field%20Guide.md#caf%C3%A9-%E5%A3%AB%E5%85%B5)',
				'[code heading](docs/Field%20Guide.md#run-npm-test)',
				'[duplicate](docs/Field%20Guide.md#repeat-1)',
				'[setext](docs/Field%20Guide.md#another-heading)',
				'[explicit anchor](docs/Field%20Guide.md#custom)',
				'![diagram](<docs/some image.svg> "Diagram")',
				'[reference][Guide] [guide][] [GUIDE]',
				'[guide]: <docs/Field Guide.md> "Guide"',
				'[parentheses](docs/guide(old).md)',
				'[external](https://invalid.example/unreachable) [email](mailto:someone@example.test)'
			].join('\n'),
			'docs/Field Guide.md':
				'# Café 士兵\n## Run `npm test`\n## Repeat\n## Repeat\nAnother heading\n---\n<a id="custom"></a>',
			'docs/some image.svg': '<svg/>',
			'docs/guide(old).md': '# Old'
		});
		expect(checkDocuments(root, ['README.md'])).toEqual([]);
	});

	it('reports missing files, missing headings and invalid encoding in changed sources', () => {
		const root = repository({
			'docs/start.md':
				'[missing](gone.md)\n[heading](target.md#gone)\n![image](gone.svg)\n[bad](%zz.md)\n[ref][destination]\n[destination]: other.md',
			'docs/target.md': '# Present',
			'unchanged.md': '[old](legacy-missing.md)'
		});
		const errors = checkDocuments(root, ['docs/start.md']);
		expect(errors).toEqual([
			expect.stringContaining('missing local destination gone.md'),
			expect.stringContaining('missing heading target.md#gone'),
			expect.stringContaining('missing local destination gone.svg'),
			expect.stringContaining('malformed URL encoding in %zz.md'),
			expect.stringContaining('missing local destination other.md')
		]);
	});

	it('ignores code examples and comments without treating example headings as real anchors', () => {
		const root = repository({
			'README.md': [
				'`[inline example](missing.md)`',
				'``[example with ` backtick](missing.md)``',
				'```markdown',
				'# Example',
				'[example](missing.md)',
				'```',
				'~~~md',
				'[example](missing.md)',
				'~~~',
				'    [indented example](missing.md)',
				'<!-- [comment](missing.md) -->',
				'[absent](#example)'
			].join('\n')
		});
		expect(checkDocuments(root, ['README.md'])).toEqual([expect.stringContaining('missing heading #example')]);
	});
});

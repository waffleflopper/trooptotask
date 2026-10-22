import { readFileSync } from 'node:fs';

const wanted = readFileSync(new URL('../.nvmrc', import.meta.url), 'utf8')
	.trim()
	.replace(/^v/, '')
	.split('.')[0];
const active = process.versions.node.split('.')[0];

if (active !== wanted) {
	console.error(
		`Node ${process.versions.node} is active, but this repository needs Node ${wanted} (.nvmrc); ` +
			'@sveltejs/adapter-vercel fails on other majors. With mise, put ~/.local/share/mise/shims first on PATH ' +
			'or prefix the command with `mise exec --`.'
	);
	process.exit(1);
}

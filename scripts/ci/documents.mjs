import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Remove examples before looking for navigable Markdown links and headings.
 * @param {string} markdown
 */
function prose(markdown) {
	let fence = '';
	let width = 0;
	return markdown
		.replace(/<!--[\s\S]*?-->/g, '')
		.split('\n')
		.map((line) => {
			const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line);
			if (fence) {
				if (marker && marker[1][0] === fence && marker[1].length >= width) {
					fence = '';
				}
				return '';
			}
			if (marker) {
				fence = marker[1][0];
				width = marker[1].length;
				return '';
			}
			return /^( {4}|\t)/.test(line) ? '' : line;
		})
		.join('\n');
}

/** @param {string} text */
function anchors(text) {
	const found = new Set();
	const lines = prose(text).split('\n');
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		for (const id of line.matchAll(/\b(?:id|name)=["']([^"']+)["']/g)) found.add(id[1]);
		const heading = /^ {0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$/.exec(line)?.[1];
		const title = heading ?? (/^ {0,3}(?:=+|-+)\s*$/.test(lines[index + 1] ?? '') ? line : '');
		if (!title.trim()) continue;
		const base = title
			.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
			.replace(/<[^>]*>/g, '')
			.replace(/&amp;/g, '&')
			.replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)))
			.toLowerCase()
			.replace(/[^\p{L}\p{M}\p{N}_\-\s]/gu, '')
			.trim()
			.replace(/\s/g, '-');
		let slug = base;
		let suffix = 0;
		while (found.has(slug)) slug = `${base}-${++suffix}`;
		found.add(slug);
	}
	return found;
}

/** @param {string} label */
function referenceKey(label) {
	return label.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Extract common inline, image and reference destinations, ignoring inline code.
 * @param {string} markdown
 */
function destinations(markdown) {
	const text = prose(markdown).replace(/(`+)([\s\S]*?)\1(?!`)/g, '');
	const definitions = new Map();
	const body = text.replace(/^ {0,3}\[([^\]]+)\]:\s*(?:<([^>]+)>|(\S+)).*$/gm, (_, label, angle, bare) => {
		definitions.set(referenceKey(label), angle ?? bare);
		return '';
	});
	const found = [];
	// Balanced parentheses cover file names such as guide(old).md and optional titles.
	const links =
		/(?<!\\)!?\[([^\]\n]*(?:\[[^\]\n]*\][^\]\n]*)*)\](?:\(\s*(?:<([^>\n]*)>|((?:[^\s()\\]|\\.|\((?:[^()\\]|\\.)*\))*))(?:\s+["'][^\n]*?["'])?\s*\)|\[([^\]\n]*)\])?/g;
	for (const match of body.matchAll(links)) {
		const destination = match[2] ?? match[3] ?? definitions.get(referenceKey(match[4] || match[1]));
		if (destination !== undefined) found.push(destination.replace(/\\([\\()[\] ])/g, '$1'));
	}
	return found;
}

/** Check explicit existing Markdown sources. External URLs are never fetched.
 * Non-Markdown destinations are checked for existence; their fragment semantics
 * belong to their renderer (for example GitHub source-code line links).
 * @param {string} repoRoot
 * @param {string[]} files
 * @returns {string[]}
 */
export function checkDocuments(repoRoot, files) {
	const root = path.resolve(repoRoot);
	const errors = [];
	const headingCache = new Map();
	for (const file of files) {
		const source = path.resolve(root, file);
		if (!/\.md$/i.test(file) || !existsSync(source)) continue;
		for (const destination of destinations(readFileSync(source, 'utf8'))) {
			if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(destination)) continue;
			let targetPath;
			let fragment;
			try {
				const hash = destination.indexOf('#');
				const location = hash < 0 ? destination : destination.slice(0, hash);
				targetPath = decodeURIComponent(location.split('?')[0]);
				fragment = hash < 0 ? '' : decodeURIComponent(destination.slice(hash + 1));
			} catch {
				errors.push(`${file}: malformed URL encoding in ${destination}`);
				continue;
			}
			const target = targetPath
				? path.resolve(targetPath.startsWith('/') ? root : path.dirname(source), targetPath.replace(/^\//, ''))
				: source;
			if (path.relative(root, target).startsWith(`..${path.sep}`) || !existsSync(target)) {
				errors.push(`${file}: missing local destination ${destination}`);
				continue;
			}
			if (fragment && /\.md$/i.test(target)) {
				if (!headingCache.has(target)) headingCache.set(target, anchors(readFileSync(target, 'utf8')));
				if (!headingCache.get(target).has(fragment)) errors.push(`${file}: missing heading ${destination}`);
			}
		}
	}
	return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const errors = checkDocuments(process.cwd(), process.argv.slice(2));
	for (const error of errors) console.error(error);
	if (errors.length) process.exitCode = 1;
	else console.log('Local Markdown links and anchors passed.');
}

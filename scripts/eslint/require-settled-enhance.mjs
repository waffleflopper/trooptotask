import path from 'node:path';
import ts from 'typescript';

const configurations = new Map();

function compilerOptions(filename) {
	const configFile = ts.findConfigFile(path.dirname(filename), ts.sys.fileExists);
	if (!configFile) return {};
	if (!configurations.has(configFile)) {
		const config = ts.getParsedCommandLineOfConfigFile(
			configFile,
			{},
			{
				...ts.sys,
				onUnRecoverableConfigFileDiagnostic: () => {}
			}
		);
		configurations.set(configFile, config?.options ?? {});
	}
	return configurations.get(configFile);
}

function referencesSettlement(file) {
	const text = ts.sys.readFile(file);
	if (!text?.includes('settleAction')) return false;
	const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
	function visit(node) {
		if (ts.isIdentifier(node) && node.text === 'settleAction') return true;
		return ts.forEachChild(node, visit) ?? false;
	}
	return visit(source);
}

export default {
	meta: {
		type: 'problem',
		docs: { description: 'Keep form drafts when an enhanced action throws.' },
		schema: [],
		messages: {
			unsettled:
				'Settle use:enhance through settleAction so a thrown action keeps the draft. Call it here or import a local helper that calls it.'
		}
	},
	create(context) {
		const directives = [];
		const imports = [];
		let settles = false;
		return {
			Identifier(node) {
				if (node.name === 'settleAction') settles = true;
			},
			ImportDeclaration(node) {
				if (node.importKind !== 'type') imports.push(node.source.value);
			},
			SvelteDirective(node) {
				if (node.kind === 'Action' && node.key.name.name === 'enhance') directives.push(node);
			},
			'Program:exit'() {
				if (settles || directives.length === 0) return;
				const options = compilerOptions(context.filename);
				const helperSettles = imports.some((specifier) => {
					const resolved = ts.resolveModuleName(specifier, context.filename, options, ts.sys).resolvedModule;
					if (!resolved || resolved.isExternalLibraryImport || resolved.resolvedFileName.includes('/node_modules/'))
						return false;
					return referencesSettlement(resolved.resolvedFileName);
				});
				if (!helperSettles) for (const node of directives) context.report({ node, messageId: 'unsettled' });
			}
		};
	}
};

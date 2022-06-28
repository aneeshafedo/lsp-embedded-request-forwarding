/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as path from 'path';
import { commands, CompletionList, ExtensionContext, Uri, workspace, window as Window } from 'vscode';
import { getLanguageService } from 'vscode-html-languageservice';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient';
import { getCSSVirtualContent, isInsideStyleRegion } from './embeddedSupport';

let client: LanguageClient;

const htmlLanguageService = getLanguageService();



function activateSQLServer(context: ExtensionContext) {
	const SELECTORS = [
		{ language: "sql", scheme: "sql-language-server" },
		{ language: "sql", scheme: 'file', pattern: `**/*${".sql"}` },
	  ]

	let connectionNames = []
	let connectedConnectionName = ''
	const serverModule = "/home/aneesha/Documents/Dev-Zone/LowCode-VSCode/sql-ls-poc/sql-language-server/packages/server/dist/vscodeExtensionServer.js";
	const execArgs = ["false"]; // [1: debug]
	const debugOptions = { execArgv: ["--nolazy", "--inspect=6009"] };
	const serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc, args: execArgs },
		debug: {
			module: serverModule,
			transport: TransportKind.ipc,
			options: debugOptions,
			args: execArgs,
		},
	};
	const clientOptions: LanguageClientOptions = {
		documentSelector: SELECTORS,
		diagnosticCollectionName: "sqlLanguageServer",
		synchronize: {
			configurationSection: "sqlLanguageServer",
			// fileEvents: workspace.createFileSystemWatcher('**/.sqllsrc.json')
		},
	};

	const client = new LanguageClient(
		'sqlLanguageServer',
		'SQL Language Server',
		serverOptions,
		clientOptions
	)
	client.registerProposedFeatures()
	const disposable = client.start()
	context.subscriptions.push(disposable)
	client.onReady().then(() => {
		client.onNotification('sqlLanguageServer.finishSetup', (params) => {
			connectionNames = params.personalConfig?.connections
				?.map((v: { name: string }) => v.name)
				.filter((v: string) => !!v)
			connectedConnectionName = params.config?.name || ''
		})
		client.onNotification('sqlLanguageServer.error', (params) => {
			Window.showErrorMessage(params.message)
		})
	})
}

export function activate(context: ExtensionContext) {
	activateSQLServer(context);
	// The server is implemented in node
	const serverModule = context.asAbsolutePath(path.join('server', 'out', 'server.js'));
	// The debug options for the server
	// --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
	const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	const serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: {
			module: serverModule,
			transport: TransportKind.ipc,
			options: debugOptions
		}
	};

	const virtualDocumentContents = new Map<string, string>();

	workspace.registerTextDocumentContentProvider('sql-language-server', {
		provideTextDocumentContent: uri => {
			const originalUri = uri.path.slice(1).slice(0, -4);
			const decodedUri = decodeURIComponent(originalUri);
			const q = virtualDocumentContents.get(decodedUri);
			console.log("Query : " + q);
			return q;
		}
	});

	const clientOptions: LanguageClientOptions = {
		documentSelector: [{ scheme: 'file', language: 'html1' }],
		middleware: {
			provideCompletionItem: async (document, position, context, token, next) => {
				// If not in `<style>`, do not perform request forwarding
				if (!isInsideStyleRegion(htmlLanguageService, document.getText(), document.offsetAt(position))) {
					return await next(document, position, context, token);
				}

				const originalUri = document.uri.toString();
				virtualDocumentContents.set(originalUri, getCSSVirtualContent(htmlLanguageService, document.getText()));

				const vdocUriString = `sql-language-server://sql/${encodeURIComponent(
					originalUri
				)}.sql`;
				const vdocUri = Uri.parse(vdocUriString);
				const abc = await commands.executeCommand<CompletionList>(
					'vscode.executeCompletionItemProvider',
					vdocUri,
					position,
					context.triggerCharacter
				);
				return abc;
			}
		}
	};


	// Create the language client and start the client.
	client = new LanguageClient(
		'languageServerExample',
		'Language Server Example',
		serverOptions,
		clientOptions
	);

	// Start the client. This will also launch the server
	client.start();
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}

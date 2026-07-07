import * as vscode from 'vscode';
import { getDebugMode } from './config';

class Logger {
	private readonly channel = vscode.window.createOutputChannel('Aperture for Copilot');

	info(message: string, ...args: unknown[]): void {
		this.write('info', message, args);
	}

	debug(message: string, ...args: unknown[]): void {
		if (getDebugMode() === 'minimal') {
			return;
		}
		this.write('debug', message, args);
	}

	verbose(message: string, ...args: unknown[]): void {
		if (getDebugMode() !== 'verbose') {
			return;
		}
		this.write('verbose', message, args);
	}

	warn(message: string, ...args: unknown[]): void {
		this.write('warn', message, args);
	}

	error(message: string, ...args: unknown[]): void {
		this.write('error', message, args);
	}

	show(): void {
		this.channel.show();
	}

	dispose(): void {
		this.channel.dispose();
	}

	private write(level: string, message: string, args: unknown[]): void {
		const suffix = args.length > 0 ? ` ${args.map(formatArg).join(' ')}` : '';
		this.channel.appendLine(`[${new Date().toISOString()}] [${level}] ${message}${suffix}`);
	}
}

function formatArg(arg: unknown): string {
	if (arg instanceof Error) {
		return `${arg.name}: ${arg.message}${arg.stack ? `\n${arg.stack}` : ''}`;
	}
	if (typeof arg === 'string') {
		return arg;
	}
	try {
		return JSON.stringify(arg);
	} catch {
		return String(arg);
	}
}

export const logger = new Logger();

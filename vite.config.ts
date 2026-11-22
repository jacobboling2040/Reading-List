import adapter from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ command, mode }) => {
	// `vite dev` doesn't put .env values on process.env, which the server-side DB code reads.
	// Dev only (production gets its variables from the host); real environment variables win.
	if (command === 'serve') {
		const env = loadEnv(mode, process.cwd(), ['TURSO_', 'OPENLIBRARY_']);
		for (const [key, value] of Object.entries(env)) process.env[key] ??= value;
	}
	return {
		plugins: [
			sveltekit({
				compilerOptions: {
					// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true
				},

				adapter: adapter({ runtime: 'nodejs22.x' })
			})
		]
	};
});

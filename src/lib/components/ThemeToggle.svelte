<script lang="ts">
	import { SCHEMES, THEME_MODES, applyThemePrefs, nextMode, type Scheme, type ThemeMode } from '../theme';

	let { mode: initialMode, scheme: initialScheme }: { mode: ThemeMode; scheme: Scheme } = $props();

	const LABELS: Record<ThemeMode, string> = { system: 'System', light: 'Light', dark: 'Dark' };

	// svelte-ignore state_referenced_locally
	let mode = $state<ThemeMode>(initialMode);
	// svelte-ignore state_referenced_locally
	let scheme = $state<Scheme>(initialScheme);
	const next = $derived(nextMode(mode));

	// The Settings picker can change the live theme without reloading this component, so follow <html>.
	$effect(() => {
		const root = document.documentElement;
		const read = () => {
			mode = THEME_MODES.find((m) => m === root.dataset.theme) ?? mode;
			scheme = SCHEMES.find((s) => s === root.dataset.scheme) ?? scheme;
		};
		read();
		const observer = new MutationObserver(read);
		observer.observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-scheme'] });
		return () => observer.disconnect();
	});

	// With JS the mode cycles in place and saves in the background; without it the form posts and redirects back.
	function cycle(event: SubmitEvent) {
		event.preventDefault();
		mode = next;
		applyThemePrefs({ mode, scheme });
		const body = new FormData();
		body.set('mode', mode);
		fetch('/settings/theme', { method: 'POST', body, headers: { accept: 'application/json' } }).catch(() => {});
	}
</script>

<form method="POST" action="/settings/theme" onsubmit={cycle}>
	<input type="hidden" name="mode" value={next} />
	<button type="submit">
		<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			{#if mode === 'light'}
				<circle cx="12" cy="12" r="4" />
				<path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
			{:else if mode === 'dark'}
				<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
			{:else}
				<circle cx="12" cy="12" r="9" />
				<path d="M12 3v18" />
			{/if}
		</svg>
		Theme: {LABELS[mode]}
	</button>
</form>

<style>
	button {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		min-height: var(--tap);
		padding: 0 var(--space-2);
		background: none;
		border: 0;
		color: var(--color-ink-soft);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	button:hover {
		color: var(--color-ink);
	}
</style>

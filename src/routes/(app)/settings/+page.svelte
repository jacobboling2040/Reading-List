<script lang="ts">
	import { untrack } from 'svelte';
	import { pending } from '../../../lib/pending';
	import {
		SCHEMES,
		SCHEME_LABELS,
		THEME_MODES,
		applyThemePrefs,
		watchThemePrefs,
		type Scheme,
		type ThemeMode
	} from '../../../lib/theme';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const user = $derived(data.user!);

	const MODE_LABELS: Record<ThemeMode, string> = { system: 'System', light: 'Light', dark: 'Dark' };
	// Each scheme's light look, so the choice previews itself in any mode.
	const SWATCHES: Record<Scheme, { bg: string; accent: string }> = {
		paper: { bg: '#f6f0e4', accent: '#8c3a22' },
		sage: { bg: '#eef2e8', accent: '#3d6b3a' },
		slate: { bg: '#eceff3', accent: '#2c5aa0' },
		plum: { bg: '#f4eef3', accent: '#7a2e6e' }
	};

	let mode = $state<ThemeMode>(untrack(() => data.theme.mode));
	let scheme = $state<Scheme>(untrack(() => data.theme.scheme));

	// The sidebar toggle can change the live theme, so follow <html> rather than the first value seen.
	$effect(() =>
		watchThemePrefs(
			(prefs) => {
				mode = prefs.mode;
				scheme = prefs.scheme;
			},
			untrack(() => data.theme)
		)
	);

	// With JS the change applies at once and saves in the background; the button covers no-JS.
	function changed() {
		applyThemePrefs({ mode, scheme });
		const body = new FormData();
		body.set('mode', mode);
		body.set('scheme', scheme);
		fetch('/settings/theme', { method: 'POST', body, headers: { accept: 'application/json' } }).catch(() => {});
	}
</script>

<svelte:head><title>Settings</title></svelte:head>

<main class="page">
	<h1>Settings</h1>

	<section class="card">
		<h2>Appearance</h2>
		<form class="stack" method="POST" action="/settings/theme">
			<fieldset>
				<legend>Mode</legend>
				{#each THEME_MODES as m (m)}
					<label class="choice"><input type="radio" name="mode" value={m} bind:group={mode} onchange={changed} /> {MODE_LABELS[m]}</label>
				{/each}
			</fieldset>
			<fieldset>
				<legend>Colour scheme</legend>
				{#each SCHEMES as s (s)}
					<label class="choice">
						<input type="radio" name="scheme" value={s} bind:group={scheme} onchange={changed} />
						<span class="swatch" aria-hidden="true" style:background={SWATCHES[s].bg}><span style:background={SWATCHES[s].accent}></span></span>
						{SCHEME_LABELS[s]}
					</label>
				{/each}
			</fieldset>
			<button>Save appearance</button>
		</form>
	</section>

	<section class="card">
		<h2>Display name</h2>
		<form class="stack" method="POST" action="?/name" use:pending>
			<label>Display name <input name="displayName" required maxlength="40" value={user.displayName} /></label>
			{#if form?.section === 'name'}
				{#if form.message}<p class="error" role="alert">{form.message}</p>{/if}
				{#if form.saved}<p class="notice" role="status">{form.saved}</p>{/if}
			{/if}
			<button>Save name</button>
		</form>
	</section>

	<section class="card">
		<h2>Password</h2>
		<form class="stack" method="POST" action="?/password" use:pending>
			<label>Current password <input name="current" type="password" autocomplete="current-password" required /></label>
			<label>New password <input name="next" type="password" autocomplete="new-password" required minlength="10" maxlength="256" /></label>
			{#if form?.section === 'password'}
				{#if form.message}<p class="error" role="alert">{form.message}</p>{/if}
				{#if form.saved}<p class="notice" role="status">{form.saved}</p>{/if}
			{/if}
			<button>Change password</button>
		</form>
		<p class="hint">Changing your password signs you out on your other devices.</p>
	</section>

	<section class="card">
		<h2>More</h2>
		<p><a href="/invite">Invite a friend</a></p>
		{#if user.isAdmin}<p><a href="/admin">Admin</a></p>{/if}
		<form method="POST" action="/logout" use:pending>
			<button>Log out</button>
		</form>
	</section>

	<section class="card danger">
		<h2>Delete account</h2>
		<p>
			This permanently deletes your shelves, reviews and follows. Your username
			<strong>{user.username}</strong> becomes free again.
		</p>
		<form class="stack" method="POST" action="?/delete" use:pending>
			<label>Type your username to confirm <input name="confirm" autocomplete="off" required /></label>
			{#if form?.section === 'delete' && form.message}<p class="error" role="alert">{form.message}</p>{/if}
			<button>Delete my account</button>
		</form>
	</section>
</main>

<style>
	section {
		margin-bottom: var(--space-5);
	}
	fieldset {
		border: 0;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-4);
	}
	legend {
		font-weight: 600;
		margin-bottom: var(--space-2);
		padding: 0;
	}
	.choice {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--tap);
	}
	.swatch {
		display: inline-flex;
		align-items: flex-end;
		justify-content: flex-end;
		width: 1.75rem;
		height: 1.75rem;
		border: 1px solid var(--color-line);
		border-radius: var(--radius-s);
		overflow: hidden;
	}
	.swatch span {
		width: 50%;
		height: 50%;
	}
	.danger {
		border-color: var(--color-error);
	}
</style>

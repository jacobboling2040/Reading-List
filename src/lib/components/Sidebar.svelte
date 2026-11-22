<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';

	let {
		user,
		children
	}: {
		user: { username: string; displayName: string; isAdmin: boolean };
		children?: Snippet;
	} = $props();

	let nav: HTMLElement;
	let menuButton: HTMLButtonElement;
	let expanded = $state(false);

	const links = $derived([
		{ href: '/', label: 'For You' },
		{ href: '/search', label: 'Search' },
		{ href: '/shelves', label: 'Shelves' },
		{ href: '/people', label: 'People' },
		{ href: `/u/${user.username}`, label: 'Profile' }
	]);

	const current = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);

	// Native popover handles Escape and light dismiss; this only syncs state and focus.
	function onToggle(event: ToggleEvent) {
		expanded = event.newState === 'open';
		if (expanded) nav.querySelector<HTMLElement>('a')?.focus();
		else menuButton.focus();
	}

	function trapTab(event: KeyboardEvent) {
		if (event.key !== 'Tab') return;
		const focusable = [...nav.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')];
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	// Skip the initial hydration ('enter'): a Menu tap before hydration must stay open.
	afterNavigate(({ type }) => {
		if (type !== 'enter' && nav?.matches(':popover-open')) nav.hidePopover();
	});

	// A popover opened natively before hydration never fires `toggle` for us.
	onMount(() => {
		if (nav.matches(':popover-open')) {
			expanded = true;
			nav.querySelector<HTMLElement>('a')?.focus();
		}
	});
</script>

<header>
	<button
		bind:this={menuButton}
		class="menu"
		type="button"
		aria-label="Menu"
		popovertarget="sidebar"
		aria-expanded={expanded}
		aria-controls="sidebar"
	>
		<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
			<path d="M4 6h16M4 12h16M4 18h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
		</svg>
	</button>
	<a class="brand" href="/">Reading List</a>
</header>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -- keydown only wraps Tab inside the dialog-like panel -->
<nav id="sidebar" popover bind:this={nav} aria-label="Main" ontoggle={onToggle} onkeydown={trapTab}>
	<button
		class="close"
		type="button"
		aria-label="Close menu"
		popovertarget="sidebar"
		popovertargetaction="hide"
	>
		<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
			<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
		</svg>
	</button>
	<ul>
		{#each links as link (link.href)}
			<li>
				<a href={link.href} aria-current={current(link.href) ? 'page' : undefined}>{link.label}</a>
			</li>
		{/each}
		<li class="separator" role="separator"></li>
		<li>
			<a href="/settings" aria-current={current('/settings') ? 'page' : undefined}>Settings</a>
		</li>
	</ul>
	{#if children}
		<div class="extra">{@render children()}</div>
	{/if}
</nav>

<style>
	header {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		max-width: 64rem;
		margin: 0 auto;
		padding: var(--space-2) var(--space-3);
	}
	.menu,
	.close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: var(--tap);
		height: var(--tap);
		min-height: var(--tap);
		padding: 0;
		background: transparent;
		color: var(--color-ink);
		border: 0;
	}
	.brand {
		font-family: var(--font-serif);
		font-style: italic;
		font-size: 1.15rem;
		color: var(--color-accent);
		text-decoration: none;
	}
	nav {
		inset: 0 auto 0 0;
		width: min(20rem, 85vw);
		height: 100dvh;
		max-height: none;
		margin: 0;
		padding: var(--space-2);
		border: 0;
		border-right: 1px solid var(--color-line);
		background: var(--color-surface);
		color: var(--color-ink);
		overflow-y: auto;
		flex-direction: column;
		transform: translateX(-100%);
		transition:
			transform var(--dur, 180ms) var(--ease, cubic-bezier(0.2, 0, 0, 1)),
			overlay var(--dur, 180ms) allow-discrete,
			display var(--dur, 180ms) allow-discrete;
	}
	nav:popover-open {
		display: flex;
		transform: translateX(0);
	}
	@starting-style {
		nav:popover-open {
			transform: translateX(-100%);
		}
	}
	nav::backdrop {
		background: rgb(0 0 0 / 0.4);
		transition:
			background-color var(--dur, 180ms) var(--ease, cubic-bezier(0.2, 0, 0, 1)),
			overlay var(--dur, 180ms) allow-discrete,
			display var(--dur, 180ms) allow-discrete;
	}
	@starting-style {
		nav:popover-open::backdrop {
			background: transparent;
		}
	}
	.close {
		align-self: flex-end;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li a {
		display: flex;
		align-items: center;
		min-height: var(--tap);
		padding: 0 var(--space-2);
		color: var(--color-ink-soft);
		text-decoration: none;
		font-weight: 500;
		border-left: 3px solid transparent;
	}
	li a:hover {
		color: var(--color-ink);
	}
	li a[aria-current='page'] {
		color: var(--color-ink);
		border-left-color: var(--color-accent);
	}
	.separator {
		height: 1px;
		margin: var(--space-2) 0;
		background: var(--color-line);
	}
	.extra {
		margin-top: auto;
		padding: var(--space-2);
	}
	@media (prefers-reduced-motion: reduce) {
		nav,
		nav::backdrop {
			transition: none;
		}
	}
</style>

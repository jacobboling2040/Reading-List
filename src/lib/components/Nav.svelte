<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';

	let { user }: { user: { displayName: string; isAdmin: boolean } } = $props();

	const links = $derived([
		{ href: '/', label: 'For You' },
		{ href: '/search', label: 'Search' },
		{ href: '/shelves', label: 'Shelves' },
		{ href: '/people', label: 'People' },
		{ href: '/invite', label: 'Invite' },
		{ href: '/settings', label: 'Settings' },
		...(user.isAdmin ? [{ href: '/admin', label: 'Admin' }] : [])
	]);

	const current = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
</script>

<header>
	<nav aria-label="Main">
		<a class="brand" href="/" aria-hidden="true" tabindex="-1">Reading List</a>
		<ul>
			{#each links as link (link.href)}
				<li>
					<a href={link.href} aria-current={current(link.href) ? 'page' : undefined}>{link.label}</a>
				</li>
			{/each}
		</ul>
		<form method="POST" action="/logout" use:enhance>
			<button class="link-button">Log out</button>
		</form>
	</nav>
</header>

<style>
	header {
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-line);
	}
	nav {
		max-width: 64rem;
		margin: 0 auto;
		padding: var(--space-2) var(--space-3);
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0 var(--space-2);
	}
	.brand {
		font-family: var(--font-serif);
		font-style: italic;
		font-size: 1.15rem;
		color: var(--color-accent);
		text-decoration: none;
		margin-right: auto;
		padding: var(--space-2) var(--space-1);
	}
	ul {
		order: 3;
		flex-basis: 100%;
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0 var(--space-1);
	}
	ul a {
		display: inline-flex;
		align-items: center;
		min-height: var(--tap);
		padding: 0 var(--space-2);
		color: var(--color-ink-soft);
		text-decoration: none;
		font-weight: 500;
		border-bottom: 2px solid transparent;
	}
	ul a:hover {
		color: var(--color-ink);
	}
	ul a[aria-current='page'] {
		color: var(--color-ink);
		border-bottom-color: var(--color-accent);
	}
	form {
		margin: 0;
	}
	@media (min-width: 52rem) {
		ul {
			order: 0;
			flex-basis: auto;
		}
		.brand {
			margin-right: var(--space-3);
		}
		form {
			margin-left: auto;
		}
	}
</style>

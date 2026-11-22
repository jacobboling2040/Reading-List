<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import Nav from '../lib/components/Nav.svelte';
	import { onNavigate } from '$app/navigation';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// Progressive enhancement: browsers without view transitions just navigate normally.
	onNavigate((navigation) => {
		if (!document.startViewTransition) return;
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if data.user}
	<Nav user={data.user} />
{:else}
	<p class="brand-solo" aria-hidden="true">Reading List</p>
{/if}
{@render children()}

<style>
	:global(::view-transition-old(root)),
	:global(::view-transition-new(root)) {
		animation-duration: var(--dur, 180ms);
		animation-timing-function: var(--ease, cubic-bezier(0.2, 0, 0, 1));
	}

	.brand-solo {
		margin: var(--space-6) 0 0;
		text-align: center;
		font-family: var(--font-serif);
		font-style: italic;
		font-size: 1.15rem;
		color: var(--color-accent);
	}
</style>

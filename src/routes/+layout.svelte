<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import Nav from '../lib/components/Nav.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
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
	.brand-solo {
		margin: var(--space-6) 0 0;
		text-align: center;
		font-family: var(--font-serif);
		font-style: italic;
		font-size: 1.15rem;
		color: var(--color-accent);
	}
</style>

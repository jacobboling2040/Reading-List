<script lang="ts">
	import favicon from '#lib/assets/favicon.svg';
	import Nav from '../lib/components/Nav.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if data.user}<Nav user={data.user} />{/if}
{@render children()}

<style>
	:global(body) {
		margin: 0;
		font-family: system-ui, sans-serif;
		line-height: 1.5;
	}
	:global(.auth) {
		max-width: 24rem;
		margin: 2rem auto;
		padding: 0 1rem;
	}
	:global(.auth form) {
		display: grid;
		gap: 1rem;
	}
	:global(.auth label) {
		display: grid;
		gap: 0.25rem;
	}
	:global(.auth input) {
		font: inherit;
		padding: 0.5rem;
	}
	:global(button) {
		font: inherit;
		padding: 0.5rem 1rem;
	}
	:global(.error) {
		color: #b00020;
	}
	:global(.notice) {
		color: #146c2e;
	}
	:global(.hint) {
		color: #666;
	}
</style>

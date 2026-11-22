import { enhance, type SubmitFunction } from '$app/forms';
import type { Action } from 'svelte/action';

// Drop-in for `use:enhance`: marks the form and its submit button busy until the result is applied.
export const pending: Action<HTMLFormElement, SubmitFunction | undefined> = (form, submit) => {
	let current = submit;

	const handler: SubmitFunction = async (input) => {
		if (form.hasAttribute('data-pending')) {
			input.cancel();
			return;
		}

		// A custom submit function may cancel; then no result callback runs, so stay idle.
		let cancelled = false;
		const cancel = input.cancel;
		const inner = await current?.({
			...input,
			cancel: () => {
				cancelled = true;
				cancel();
			}
		});
		if (cancelled) return inner;

		const submitter = input.submitter as HTMLButtonElement | null;
		form.setAttribute('data-pending', '');
		submitter?.setAttribute('aria-busy', 'true');
		if (submitter) submitter.disabled = true;

		return async (opts) => {
			try {
				if (inner) await inner(opts);
				else await opts.update();
			} finally {
				form.removeAttribute('data-pending');
				submitter?.removeAttribute('aria-busy');
				if (submitter) submitter.disabled = false;
			}
		};
	};

	const instance = enhance(form, handler);
	return {
		update(next) {
			current = next;
		},
		destroy: instance.destroy
	};
};

export const GET = () =>
	new Response('User-agent: *\nDisallow: /', {
		headers: { 'content-type': 'text/plain' }
	});

import { createServer, type Server } from 'node:http';

const RESULTS = [
	{
		key: '/works/OL1W',
		title: 'The Left Hand of Darkness',
		author_name: ['Ursula K. Le Guin'],
		cover_i: 111,
		first_publish_year: 1969
	},
	{
		key: '/works/OL2W',
		title: 'A Wizard of Earthsea',
		author_name: ['Ursula K. Le Guin'],
		cover_i: 222,
		first_publish_year: 1968
	},
	{
		key: '/works/OL3W',
		title: 'Piranesi',
		author_name: ['Susanna Clarke'],
		first_publish_year: 2020
	}
];

/** Stand-in for openlibrary.org: 500 for queries containing "outage", otherwise a fixed result list. */
export function startOpenLibraryStub(port: number): Promise<Server> {
	const server = createServer((req, res) => {
		const q = new URL(req.url ?? '/', 'http://stub').searchParams.get('q') ?? '';
		if (q.toLowerCase().includes('outage')) {
			res.writeHead(500).end('stub outage');
			return;
		}
		res.writeHead(200, { 'content-type': 'application/json' });
		res.end(JSON.stringify({ docs: RESULTS }));
	});
	return new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(port, () => resolve(server));
	});
}

import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize } from 'node:path';

const TYPES: Record<string, string> = {
  '.css': 'text/css',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

const typeOf = (file: string) =>
  TYPES[extname(file)] ?? 'application/octet-stream';

const read = (root: string, pathname: string) => {
  const file = join(root, normalize(decodeURIComponent(pathname)));
  const fallback = join(root, 'index.html');
  return readFile(file).then(
    (body) => ({ body, type: typeOf(file) }),
    () => readFile(fallback).then((body) => ({ body, type: typeOf(fallback) }))
  );
};

const listen = (
  root: string,
  port: number,
  redirects: Record<string, string>
) =>
  new Promise<Server>((resolve) => {
    const server = createServer((request, response) => {
      const { pathname } = new URL(request.url ?? '/', 'http://site');
      const location = redirects[pathname];
      if (location) {
        response.writeHead(302, { location, 'cache-control': 'no-cache' });
        response.end();
        return;
      }
      void read(root, pathname).then(({ body, type }) => {
        response.writeHead(200, {
          'content-type': type,
          'cache-control': 'no-cache'
        });
        response.end(body);
      });
    });
    server.listen(port, '127.0.0.1', () => {
      resolve(server);
    });
  });

const stop = (server: Server | null) =>
  new Promise<void>((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    server.closeAllConnections();
    server.close(() => {
      resolve();
    });
  });

export type Site = {
  origin: string;
  deploy: (build: string, redirects?: Record<string, string>) => Promise<void>;
  takeDown: () => Promise<void>;
};

export const siteAt = (port: number): Site => {
  let server: Server | null = null;
  const takeDown = async () => {
    await stop(server);
    server = null;
  };
  return {
    origin: `http://127.0.0.1:${String(port)}/`,
    takeDown,
    deploy: async (build, redirects = {}) => {
      await takeDown();
      server = await listen(build, port, redirects);
    }
  };
};

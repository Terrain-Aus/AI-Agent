// Vite plugin that mounts the apprentice proxy in both the dev server and the
// preview server. Keeps the secret API key on the server side (process env /
// .env loaded by Vite) — it is never exposed to the client bundle.

import type { Connect, Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleHealth, handleStream, type ServerEnv } from './handler'

const STREAM_PATH = '/api/apprentice/stream'
const HEALTH_PATH = '/api/apprentice/health'

export function apprenticePlugin(env: Record<string, string>): Plugin {
  // Pull only the server-side (non-VITE_) secrets we need.
  const serverEnv: ServerEnv = {
    OPENAI_API_KEY: env.OPENAI_API_KEY || process.env.OPENAI_API_KEY,
    AI_PROVIDER: env.AI_PROVIDER || process.env.AI_PROVIDER,
    AI_MODEL: env.AI_MODEL || process.env.AI_MODEL,
  }

  const middleware = (req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
    const url = (req.url || '').split('?')[0]
    if (url === HEALTH_PATH && req.method === 'GET') {
      handleHealth(serverEnv, res)
      return
    }
    if (url === STREAM_PATH && req.method === 'POST') {
      void handleStream(serverEnv, req, res)
      return
    }
    next()
  }

  return {
    name: 'terrainpro-apprentice',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

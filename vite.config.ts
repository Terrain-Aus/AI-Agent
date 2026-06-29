import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { apprenticePlugin } from './server/vitePlugin'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load the FULL env (including non-VITE_ secrets like OPENAI_API_KEY) for the
  // server-side proxy. The '' prefix means "don't filter to VITE_". These never
  // reach the client bundle — only the plugin (Node) reads them.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), apprenticePlugin(env)],
    server: {
      host: true,
      port: 5173,
    },
    preview: {
      host: true,
      port: 4173,
    },
  }
})

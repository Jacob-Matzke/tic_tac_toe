import { defineConfig } from 'vite'

// Serve ../data as static assets so graph.json is fetched from the pipeline output
// rather than a duplicated copy.
export default defineConfig({
  publicDir: '../data',
  server: { port: Number(process.env.PORT) || 5173 },
})

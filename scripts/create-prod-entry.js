import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const entry = `// Auto-generated production entry point.
// Loads the ESM server.js from the project root.
import(new URL('../server.js', import.meta.url).href).catch(e => {
  console.error('[FATAL] Failed to start server:', e);
  process.exit(1);
});
`;

writeFileSync(resolve(rootDir, 'dist', 'index.cjs'), entry);
console.log('✓ dist/index.cjs created');

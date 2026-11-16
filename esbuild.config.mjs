import { build } from 'esbuild';

const shared = {
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  sourcemap: false,
  minify: false,
  loader: { '.css': 'text' },
};

const watch = process.argv.includes('--watch');

const jobs = [
  build({ ...shared, entryPoints: ['background.ts'], outfile: 'background.js' }),
  build({ ...shared, entryPoints: ['content.ts'], outfile: 'content.js' }),
  build({ ...shared, entryPoints: ['popup.ts'], outfile: 'popup.js' }),
];

if (watch) {
  for (const ctx of jobs) ctx.then((r) => r.watch());
  console.log('watching...');
} else {
  await Promise.all(jobs);
  console.log('build complete');
}

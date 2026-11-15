import { copyFile, mkdir } from 'node:fs/promises';

const files = [
  'index.html',
  'styles.css',
  'app.mjs',
  'photos.mjs',
  'legislation_data.mjs',
  'sw.js',
  'manifest.webmanifest',
  'icon.svg'
];

for (const file of files) {
  const destination = new URL(`../dist/${file}`, import.meta.url);
  await mkdir(new URL('.', destination), { recursive: true });
  await copyFile(new URL(`../${file}`, import.meta.url), destination);
}
console.log(`Prepared ${files.length} Stick the Ticket mobile app files in dist/.`);

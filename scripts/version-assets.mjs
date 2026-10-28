// Give each release a coherent module graph and stylesheet cache identity.
// Run npm run version:assets after changing frontend code; npm run check enforces it.
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
async function modules(dir) {
  const entries = await readdir(path.join(root, dir), { withFileTypes: true });
  return (await Promise.all(entries.map((e) => e.isDirectory()
    ? modules(`${dir}/${e.name}`)
    : e.name.endsWith('.js') ? [`${dir}/${e.name}`] : []))).flat().sort();
}
const js = await modules('js');
const file = path.join(root, 'index.html');
const original = await readFile(file, 'utf8');
const css = [...original.matchAll(/href="([^"?:]+\.css)(?:\?[^\"]*)?"/g)].map((m) => m[1]);
const hash = createHash('sha256');
for (const name of [...js, ...css].sort()) {
  hash.update(name).update('\0').update(await readFile(path.join(root, name))).update('\0');
}
const version = hash.digest('hex').slice(0, 16);
const imports = Object.fromEntries(js.map((name) => [`./${name}`, `./${name}?v=${version}`]));
const block = `    <!-- release-assets:start -->\n    <script type="importmap">\n${JSON.stringify({ imports }, null, 2).split('\n').map((line) => '    ' + line).join('\n')}\n    </script>\n    <!-- release-assets:end -->`;
let result = original.replace(/    <!-- release-assets:start -->[\s\S]*?    <!-- release-assets:end -->\n?/, '');
result = result.replace('    <title>Food Chain TCG</title>', `    <title>Food Chain TCG</title>\n${block}`);
result = result.replace(/href="([^"?:]+\.css)(?:\?[^\"]*)?"/g, (_, name) => `href="${name}?v=${version}"`);
result = result.replace(/src="js\/main\.js(?:\?[^\"]*)?"/, `src="js/main.js?v=${version}"`);
if (process.argv.includes('--check')) {
  if (result !== original) {
    console.error('Frontend asset versions are stale. Run npm run version:assets and commit index.html.');
    process.exitCode = 1;
  } else console.log(`Release assets coherent: ${version} (${js.length} modules, ${css.length} stylesheets)`);
} else {
  await writeFile(file, result);
  console.log(`Versioned ${js.length} modules and ${css.length} stylesheets: ${version}`);
}

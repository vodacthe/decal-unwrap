// Assemble src/* into one self-contained HTML page.
//   dist/decal-unwrap.html  — open directly in Chrome/Edge (has doctype)
//   dist/artifact.html          — body content for publishing as an Artifact
//   index.html                  — with --site: the published page
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');

const shell = read('src/shell.html');
const css = read('src/styles.css');
// textures shipped inside the page (src/assets), injected where app.js has a placeholder
const dataUrl = (p, type) => `data:${type};base64,${readFileSync(join(root, p)).toString('base64')}`;
const tiles = { carbon: dataUrl('src/assets/carbon-tile.png', 'image/png') };
for (const f of readdirSync(join(root, 'src/assets/textures')).filter((n) => n.endsWith('.jpg')).sort()) {
  tiles[f.replace(/\.jpg$/, '')] = dataUrl(`src/assets/textures/${f}`, 'image/jpeg');
}
const modules = ['src/geometry.js', 'src/flatten.js', 'src/layout.js', 'src/project.js', 'src/scan.js', 'src/app.js']
  .map((p) => `// ===== ${p} =====\n${read(p)}`).join('\n')
  .replace("'%TEXTURES%'", JSON.stringify(tiles));

const importMap = {
  imports: {
    three: 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
    'three/addons/': 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/',
    'three-mesh-bvh': 'https://cdn.jsdelivr.net/npm/three-mesh-bvh@0.7.3/build/index.module.js',
  },
};

const header = `import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
`;

const fontLink = shell.match(/<link rel="stylesheet"[^>]*>/);
if (!fontLink) throw new Error('font link not found in shell.html');
const withStyle = shell.replace(fontLink[0], `${fontLink[0]}\n<style>\n${css}</style>`);

const scripts = `
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/clipper-lib@6.4.2/clipper.js"></script>
<script type="importmap">${JSON.stringify(importMap)}</script>
<script type="module">
${header}
${modules}
</script>
`;

const body = withStyle.trimEnd() + '\n' + scripts;
mkdirSync(join(root, 'dist'), { recursive: true });
mkdirSync(join(root, 'tests/tmp'), { recursive: true });
writeFileSync(join(root, 'dist/artifact.html'), body);
const page = '<!doctype html>\n<html lang="en">\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' + body + '</html>\n';
writeFileSync(join(root, 'dist/decal-unwrap.html'), page);
// `node build.mjs --site` also refreshes index.html, the page GitHub Pages serves (decal.vdthe.com)
if (process.argv.includes('--site')) writeFileSync(join(root, 'index.html'), page);
writeFileSync(join(root, 'tests/tmp/module.mjs'), header + modules);
console.log('built', (body.length / 1024).toFixed(1), 'KB');

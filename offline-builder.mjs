import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// This exporter writes a real standalone document: no adjacent model, module,
// font, texture or stylesheet is needed by the resulting file:// page.
export async function writeOffline(root, destination, options = {}) {
  const require = createRequire(path.join(root, 'package.json'));
  const { build } = require('esbuild');
  const model = options.model || JSON.parse(await readFile(path.join(root, 'assets/model.json'), 'utf8'));
  const payload = await readFile(path.join(root, 'assets', model.fallback));
  const virtualLoader = `
    import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
    import {MeshoptDecoder} from './vendor/meshopt_decoder.mjs';
    export const modelAsset=${JSON.stringify(model)};
    export const loadMetrics={source:'embedded',bytes:0,attempts:0,started:0,decodedAt:0};
    window.__PLC_LOAD__=loadMetrics;
    export async function loadFactoryModel(onProgress){
      loadMetrics.started=performance.now();onProgress('解码内嵌原厂模型…');
      const data=atob(document.getElementById('embedded-model').textContent.trim());
      const bytes=new Uint8Array(data.length);
      for(let i=0;i<data.length;i++)bytes[i]=data.charCodeAt(i);
      if(bytes.length!==modelAsset.decodedBytes)throw new Error('离线模型数据不完整');
      loadMetrics.bytes=bytes.length;await MeshoptDecoder.ready;
      const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer,'');
      loadMetrics.decodedAt=performance.now();return gltf;
    }`;
  const result = await build({
    absWorkingDir: root, entryPoints: ['app.js'], bundle: true, minify: true,
    format: 'iife', target: ['es2020'], write: false, legalComments: 'eof',
    plugins: [{ name: 'standalone', setup(b) {
      b.onResolve({ filter: /model-loader\.js$/ }, () => ({ path: 'embedded-loader', namespace: 'offline' }));
      b.onLoad({ filter: /.*/, namespace: 'offline' }, () => ({ contents: virtualLoader, resolveDir: root, loader: 'js' }));
      b.onResolve({ filter: /^three$/ }, () => ({ path: path.join(root, 'vendor/three.module.js') }));
      b.onResolve({ filter: /^three\/addons\// }, a => ({ path: path.join(root, 'vendor/addons', a.path.slice('three/addons/'.length)) }));
    } }],
  });
  let html = await readFile(path.join(root, 'index.html'), 'utf8');
  // Online preloads and module entries must not survive standalone packaging.
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const styles = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/gi)];
  for (const match of styles) { const css=await readFile(path.resolve(root, match[1]), 'utf8'); html = html.replace(match[0], () => `<style>${css}</style>`); }
  html = html.replace(/<link\b[^>]*rel="icon"[^>]*>/gi, '<link rel="icon" href="data:,">');
  html = html.replaceAll('href="./embed-example.html"', `href="${options.onlineUrl || ''}embed-example.html"`);
  html = html.replace('<title>', '<title>离线 · ');
  const code = result.outputFiles[0].text.replaceAll('</script', '<\\/script').replaceAll('请使用“启动教学网页.cmd”，不要直接双击 HTML 文件。','请确认离线 HTML 文件完整，并使用支持 WebGL 的 Chrome 或 Edge。');
  // A callback is essential: shader/loader code contains literal $&, $' and
  // similar sequences, which a string replacement argument would expand.
  html = html.replace('</body>', () => `<script id="embedded-model" type="application/octet-stream">${payload.toString('base64')}</script><script>${code}</script></body>`);
  if (/<script\b[^>]*\bsrc=|<link\b[^>]*rel="stylesheet"|type="module"|type="importmap"/i.test(html)) throw new Error('Standalone contains an external execution dependency');
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, html, 'utf8');
  const report = { file: path.basename(destination), bytes: Buffer.byteLength(html), sha256: createHash('sha256').update(html).digest('hex'), embeddedModelSha256: createHash('sha256').update(payload).digest('hex'), modelBytes: payload.length, source: 'same source and model as online; classic inline script; embedded ArrayBuffer' };
  await writeFile(destination + '.manifest.json', JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.argv[2]);
  let options={};
  if (path.basename(root)==='plc-github-pages') options={model:{fallback:'plc1215c-7c7321cddc78.glb',decodedBytes:4554808},onlineUrl:'https://titleone01.github.io/plc1215c-classroom/'};
  else if (path.basename(root)==='nxc09-github-pages') options={onlineUrl:'https://titleone01.github.io/nxc09-classroom/'};
  console.log(JSON.stringify(await writeOffline(root,path.resolve(process.argv[3]),options)));
}

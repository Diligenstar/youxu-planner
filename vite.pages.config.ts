import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import {readFile,writeFile} from 'node:fs/promises';
export default defineConfig({
  root:'pages',
  cacheDir:'../work/vite-cache',
  base:'/youxu-planner/',
  publicDir:'../public',
  css:{postcss:{plugins:[tailwindcss()]}},
  plugins:[react(),{
    name:'youxu-offline-shell',
    async writeBundle(_options,bundle){
      const assets=Object.keys(bundle).filter(name=>/\.(js|css)$/.test(name));
      const source=await readFile(new URL('./public/sw.js',import.meta.url),'utf8');
      await writeFile(new URL('./pages-dist/sw.js',import.meta.url),source.replace('const BUILD_ASSETS=[];',`const BUILD_ASSETS=${JSON.stringify(assets)};`));
    }
  }],
  build:{outDir:'../pages-dist',emptyOutDir:true}
});

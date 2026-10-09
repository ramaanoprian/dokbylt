import { createReadStream, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const require = createRequire(import.meta.url);
const version = (pkg: string): string => require(`${pkg}/package.json`).version;

// Folder berversi agar cache browser lama tidak terpakai setelah paket diperbarui.
const OCR_DIR = `vendor/tesseract-${version('tesseract.js')}-${version('tesseract.js-core')}/`;
const PDF_DIR = `vendor/pdfjs-${version('pdfjs-dist')}/`;

/**
 * Mesin OCR (tesseract.js) dan dekoder gambar pdf.js menyusun nama berkasnya sendiri, jadi berkas itu
 * disalin apa adanya dengan nama tetap ke hasil build (dan disajikan langsung saat dev). Semuanya dari
 * situs sendiri, tanpa CDN, dan baru diunduh saat fitur "Isi dari PDF / foto surat" dipakai.
 */
const VENDOR: Record<string, string> = {
  [OCR_DIR + 'worker.min.js']: 'tesseract.js/dist/worker.min.js',
  // Inti OCR dengan berkas .wasm terpisah (lebih kecil dan bisa dikompres server dibanding versi base64).
  [OCR_DIR + 'tesseract-core-simd-lstm.js']: 'tesseract.js-core/tesseract-core-simd-lstm.js',
  [OCR_DIR + 'tesseract-core-simd-lstm.wasm']: 'tesseract.js-core/tesseract-core-simd-lstm.wasm',
  [OCR_DIR + 'tesseract-core-lstm.js']: 'tesseract.js-core/tesseract-core-lstm.js',
  [OCR_DIR + 'tesseract-core-lstm.wasm']: 'tesseract.js-core/tesseract-core-lstm.wasm',
  [OCR_DIR + 'ind.traineddata.gz']: '@tesseract.js-data/ind/4.0.0_best_int/ind.traineddata.gz',
  [OCR_DIR + 'eng.traineddata.gz']: '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
  [PDF_DIR + 'wasm/openjpeg.wasm']: 'pdfjs-dist/wasm/openjpeg.wasm',
  [PDF_DIR + 'wasm/openjpeg_nowasm_fallback.js']: 'pdfjs-dist/wasm/openjpeg_nowasm_fallback.js',
  [PDF_DIR + 'wasm/jbig2.wasm']: 'pdfjs-dist/wasm/jbig2.wasm',
  [PDF_DIR + 'wasm/jbig2_nowasm_fallback.js']: 'pdfjs-dist/wasm/jbig2_nowasm_fallback.js',
  [PDF_DIR + 'wasm/qcms_bg.wasm']: 'pdfjs-dist/wasm/qcms_bg.wasm',
};

const MIME: Record<string, string> = { js: 'text/javascript', wasm: 'application/wasm', gz: 'application/octet-stream' };

function vendorFiles(): Plugin {
  return {
    name: 'vendor-files',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const src = VENDOR[(req.url ?? '').split('?')[0].replace(/^\//, '')];
        if (!src) return next();
        res.setHeader('Content-Type', MIME[src.split('.').pop()!] ?? 'application/octet-stream');
        createReadStream(require.resolve(src)).pipe(res);
      });
    },
    generateBundle() {
      for (const [fileName, src] of Object.entries(VENDOR)) {
        this.emitFile({ type: 'asset', fileName, source: readFileSync(require.resolve(src)) });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), vendorFiles()],
  base: './',
  define: {
    __OCR_DIR__: JSON.stringify(OCR_DIR),
    __PDF_DIR__: JSON.stringify(PDF_DIR),
  },
});

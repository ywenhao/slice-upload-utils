import { defineConfig } from 'tsdown/config'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    react: 'src/react.ts',
    vue: 'src/vue.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  fixedExtension: true,
  platform: 'browser',
  target: 'es2020',
  deps: {
    neverBundle: ['react', 'spark-md5', 'vue'],
  },
})

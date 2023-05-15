import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    'src/index',
    // {
    //   builder: 'mkdist',
    //   input: './src/utils/worker/',
    //   outDir: './dist/worker',
    //   ext: 'ts',
    // },
  ],
  declaration: true,
  clean: true,
  rollup: {
    emitCJS: true,
  },
})

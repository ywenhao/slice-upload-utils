import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    'src/index',
    {
      builder: 'mkdist',
      input: './src/utils/worker/',
      outDir: './dist/worker',
    },
  ],
  declaration: true,
  clean: true,
  rollup: {
    emitCJS: true,
  },
})

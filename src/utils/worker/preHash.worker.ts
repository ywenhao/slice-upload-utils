import SparkMD5 from 'spark-md5'

self.onmessage = (e) => {
  const { file } = e.data as { file: File }

  const spark = new SparkMD5.ArrayBuffer()

  async function getFileChunk() {
    spark.append(await file.arrayBuffer())

    const hash = spark.end()
    self.postMessage({ hash })
    self.close()
  }

  getFileChunk()
}

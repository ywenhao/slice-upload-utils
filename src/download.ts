/**
 * 文件合并
 * @param files 文件列表
 * @param fileName 文件名
 * @param type 文件类型
 */
export function mergeFile(files: (File | Blob)[], fileName: string, type: string) {
  const aLink = document.createElement('a')
  aLink.href = URL.createObjectURL(new File(files, fileName, { type }))
  aLink.download = fileName
  aLink.click()
  URL.revokeObjectURL(aLink.href)
}

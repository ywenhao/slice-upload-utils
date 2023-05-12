# slice-upload-utils

[![NPM version](https://img.shields.io/npm/v/slice-upload-utils?color=a1b858&label=)](https://www.npmjs.com/package/slice-upload-utils)

## 介绍

* 本工具包含上传和下载功能。vite + vue的实现。

  ### 上传

  - 包括切片上传，秒传，断点续传，暂停、取消。

  ### 下载

  - 切片下载，合并，暂停、取消。

  ### 上传hash计算

  - 为了优化计算hash时间，hash值计算分两种，一直是计算文件的真实MD5，一种是计算自定义hash值。

    ##### 自定义hash值：

     :: **preHash**，采用截取file前段和末段合成一个新的文件，同时结合文件的最后修改时间，和file.size一起计算的一个新的hash值。

    :: **chunkHash**，采用preHash结合chunkSize和该切片的index计算hash值。

    ##### 真实hash值：

    :: **preHash**, file文件的hash值，file的**真实**MD5值计算，在**file.size**大于**chunkSize**时，通过计算**chunk**的**web worker**线程里面同时计算。

    :: **chunkHash**, **file.size** 小于**chunkSize**时，**file**等于**chunk**，**chunkHash**等于**preHash**；**file.size**大于**chunkSize**时在**web worker**里面计算。

  - 可以根据实例中的**isPreHash**和**isChunkHash**的值来判断当前是否计算的真实hash。


## 快速开始
 * 使用 pnpm 安装
  ```shell
  pnpm add file-slice-upload
  ```

 ## 示例代码

[/playground/vue/src/App.vue](./playground/vue/src/App.vue)

## 调用说明

```ts
export interface UseSliceUploadOptions extends Omit<SliceUploadOptions, 'file'> {
  /**
   * 上传文件
   */
  file: Ref<File | null | undefined>
  /**
   * 上传函数
   */
  request: UploadRequest
  /**
   * 报错处理函数
   */
  onError?: UploadEventType['error']
  /**
   * 上传完成函数
   */
  onFinish?: UploadEventType['finish']
  /**
   * 预检函数
   */
  preVerifyRequest?: PreVerifyUploadRequest
  /**
   * 分片大小
   * @default 1024 * 1024 * 2
   */
  chunkSize?: number
  /**
   * 并发上传数
   * @default 3
   */
  poolCount?: number
  /**
   * 请求失败后，重试次数
   *
   * @default 3
   */
  retryCount?: number
  /**
   * 请求失败后，重试间隔时间
   * @default 300
   */
  retryDelay?: number
  /**
   * 请求超时时间(15s)
   * @default 15000
   */
  timeout?: number
  /**
   * 计算整个文件的hash，开启后比较耗时间
   *
   * @default false
   */
  realPreHash?: boolean
  /**
   * 计算分片文件的hash，开启后比较耗时间
   *
   * @default false
   */
  realChunkHash?: boolean
}
```

## TODO: 下载， 文档

## License

[MIT](./LICENSE) License © 2023 [Ywenhao](https://github.com/ywenhao)
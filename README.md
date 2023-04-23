# slice-upload-utils

[![NPM version](https://img.shields.io/npm/v/slice-upload-utils?color=a1b858&label=)](https://www.npmjs.com/package/slice-upload-utils)

## 介绍

* 本工具包含上传和下载功能。

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

    :: **chunkHash**, f**ile.size** 小于**chunkSize**时，**file**等于**chunk**，**chunkHash**等于**preHash**；**file.size**大于**chunkSize**时在**web worker**里面计算。

  


## 快速开始

 * 使用 pnpm 安装

  ```shell
pnpm add file-slice-upload
  ```



## License

[MIT](./LICENSE) License © 2023 [Ywenhao](https://github.com/ywenhao)
# GeoGuess

**GeoGuess** 是一个面向 OSINT / 图片地理定位验证场景的本地 Web 工作台。它可以接收图片或视频素材，结合 EXIF 元数据、视觉模型识别、搜索查询规划、地图候选点和报告导出能力，帮助使用者更系统地推测并核验画面拍摄地点。

> 重要提示：GeoGuess 的目标是辅助调查和复核，不应把 AI 输出直接当作最终坐标结论。所有候选位置都需要结合地图、卫星图、历史影像和公开来源进行人工验证。

## 功能特性

- **图片 / 视频素材分析**
  - 支持上传图片和视频素材。
  - 视频会抽取关键帧作为识别证据。
  - 支持原图 EXIF GPS / 拍摄时间 / 相机信息提取。

- **视觉模型线索提取**
  - 支持 OpenAI 兼容接口。
  - 自动提取 OCR、可见标签、语言、地物特征、空间关系和搜索词。
  - 强调可地图核验的物理证据，例如建筑、屋顶、围墙、道路、轨道、站台、山体、水体、阴影和相机视角。

- **定位候选与地图核验**
  - 生成候选经纬度、置信度、匹配分数和待核验点。
  - 提供 Google Maps / Google Earth 入口。
  - 区分媒体水印、来源文字和真正的位置证据，避免仅凭台标或新闻来源下结论。

- **专业深色界面**
  - OSINT 风格深色主题。
  - 状态栏展示素材、模型状态、分析进度、候选数量、开始时间和耗时。

- **报告导出与分享**
  - 打印 / 导出 PDF。
  - 下载 Markdown 报告。
  - 下载 HTML 报告。
  - 一键复制报告内容。

- **历史记录管理**
  - 本地保存最近调查快照。
  - 支持重新打开、对比当前调查、删除单条记录和清空历史。
  - 历史数据保存在浏览器 localStorage 中，不会上传到远端。

## 技术栈

- 前端：React 19、Vite、TypeScript
- 后端：Express、Multer、tsx
- 图像处理：Sharp、exifr
- AI 接口：OpenAI SDK / OpenAI 兼容 API
- 测试：Vitest、Testing Library

## 环境要求

请使用符合项目要求的 Node.js 版本：

```bash
Node.js ^20.19.0 或 >=22.12.0
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发环境

```bash
npm run dev
```

该命令会同时启动：

- 前端 Vite 服务
- 后端 Express API 服务

默认后端监听：

```text
127.0.0.1:8787
```

### 3. 打开页面

启动后，在浏览器打开 Vite 输出的本地地址即可使用。

## 使用流程

1. 上传图片或视频素材。
2. 在「模型配置」中填写 API Key、Base URL 和模型名。
3. 选择输出语言、定位范围和其他调查约束。
4. 点击「开始分析」。
5. 查看候选位置、匹配证据、地图入口和核验清单。
6. 根据地图 / 卫星图 / Google Earth / 公开来源进行人工验证。
7. 导出 PDF、Markdown 或 HTML 报告。

## 可用脚本

```bash
npm run dev        # 同时启动前端和后端开发服务
npm run dev:web    # 仅启动 Vite 前端
npm run dev:server # 仅启动后端 API
npm run build      # TypeScript 检查并构建前端
npm run test       # 运行测试
npm run test:run   # CI 方式运行测试
npm run preview    # 预览构建产物
```

## API Key 与隐私说明

- API Key 仅在当前浏览器会话中使用。
- 保存配置时不会持久保存 API Key。
- 上传素材会发送到本地后端进行处理。
- 历史记录保存在本地浏览器 localStorage 中。
- 如果你接入第三方 OpenAI 兼容服务，图片和提示词会发送给对应服务提供商，请自行确认其隐私政策和数据处理方式。

## 项目结构

```text
GeoGuess/
├── server/                 # Express 后端、上传处理、视频帧提取、调查流程
│   ├── providers/          # 视觉模型、联网候选搜索、元数据提供器
│   ├── imageAnalysis.ts
│   ├── investigationService.ts
│   └── index.ts
├── src/                    # React 前端与共享逻辑
│   ├── components/         # UI 组件
│   ├── shared/             # 类型、报告、地图链接、查询规划等共享模块
│   ├── App.tsx
│   ├── main.tsx
│   ├── styles.css
│   └── theme-dark.css
├── package.json
└── README.md
```

## 安全与合规

GeoGuess 适合用于学习、研究和合法授权的 OSINT 调查工作。请勿用于侵犯隐私、跟踪、骚扰、非法监控或其他违法用途。对于军事、政府、企业或个人相关素材，请遵守适用法律、平台规则和伦理规范。

## English README

English documentation is available in [README.en.md](README.en.md).

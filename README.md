# 不背单词 Lite

> 开源英语单词学习工具 · 浏览器 / 手机 / 电脑都能用

一个参考「不背单词」产品思路实现的背单词应用：**纯前端、无需注册、数据只存在你自己设备上**。
内置小学到 GRE 共 **26,400+ 词** 精选词库，四种练习模式，基于 **SM-2 记忆算法** 安排复习。

---

## ✨ 功能

### 四种练习模式

| 模式 | 说明 |
| --- | --- |
| **英译汉** | 看英文单词，选出正确的中文意思（干扰项优先取同词性，训练辨析能力） |
| **汉译英** | 看中文释义，拼写出对应的英文单词 |
| **默写** | 看释义 + 首字母和长度提示，完整拼写单词 |
| **听写** | 只听发音（不显示单词），拼写听到的内容 |

### 内置词书（26,418 词）

| 词书 | 词量 | 用途 |
| --- | --- | --- |
| 小学英语 | 441 | 入门起点 |
| 中考英语 | 1,751 | 打基础首选 |
| 高考英语 | 5,302 | 覆盖高中全部核心词 |
| 大学英语四级 CET-4 | 4,529 | 四级大纲词汇 |
| 大学英语六级 CET-6 | 2,164 | 六级进阶 |
| TOEFL | 4,510 | 北美学术场景 |
| GRE | 7,721 | 欧美名校申请 |

每个词条都带**音标、词性、中文释义**，词书按需懒加载，首屏只加载当前词书。

### 记忆引擎

采用 **SM-2（SuperMemo 2）** 算法而非固定的艾宾浩斯间隔表：

- 每个单词独立维护 **ease（难度系数）** 与 **interval（复习间隔）**
- 答对 → 按 `interval × ease` 拉长下次复习时间
- 答错 → 重置间隔、降低 ease，5 分钟后重新出现
- 间隔超过 21 天自动判定为「已掌握」
- 对总是记不住的词，算法会安排**更密集**的复习

### 学习统计

连续打卡天数、掌握度环形图、近 14 天学习趋势、记忆状态分布（未学 / 学习中 / 复习中 / 已掌握）、累计正确率。

### 自定义词库

支持粘贴文本或导入 `.txt` / `.csv` / `.json` 文件，兼容这些格式：

```
apple n. 苹果
banana [bəˈnɑːnə] n. 香蕉
hello,你好
world 世界
read | 阅读 | riːd
ice cream n. 冰淇淋
[{"word":"apple","mean":"苹果"}]
```

也可以直接从 Excel 复制两列（制表符分隔）粘贴进来。

### 其他

- 发音基于浏览器 Web Speech API，可选音色与语速，**无需联网**
- 深色模式
- 学习进度可导出为 JSON 备份 / 恢复
- PWA：可「添加到主屏幕」当作独立应用使用

---

## 🚀 快速开始

```bash
git clone <your-repo-url>
cd bbdict
npm install
npm run dev
```

浏览器打开 `http://localhost:5173`。

其它命令：

```bash
npm run build       # 生产构建到 dist/
npm run preview     # 本地预览构建产物
npm test            # 跑单元测试（47 个）
npm run typecheck   # TypeScript 类型检查
npm run lint        # lint
```

---

## 📱 多端使用

本项目是纯前端应用，**一套代码覆盖四个平台**。

### 网页版

```bash
npm run build
```

把 `dist/` 目录部署到任意静态托管即可：GitHub Pages、Vercel、Netlify、Cloudflare Pages、Nginx 均可。

### 手机 / 平板（iOS + Android）

两种方式：

**方式一：PWA（最简单，无需打包）**

用手机浏览器打开网页版 → Safari 点「分享 → 添加到主屏幕」/ Chrome 点「⋮ → 添加到主屏幕」。
之后就像原生 App 一样全屏运行，数据保存在本地。

**方式二：Capacitor 打包成原生 App**

```bash
npm install -D @capacitor/cli @capacitor/core @capacitor/android @capacitor/ios
npm run cap:add:android     # 生成 Android 工程
npm run cap:add:ios         # 生成 iOS 工程（需 macOS）

# 之后用 Android Studio 打开 android/ 目录构建 APK
# 用 Xcode 打开 ios/ 目录构建 IPA
```

Android 构建 APK：Android Studio → `Build → Build Bundle(s)/APK(s) → Build APK(s)`。
iOS 构建 IPA 需要 macOS + Xcode + 苹果开发者账号。

### Windows / macOS / Linux 桌面版

用 Electron + electron-builder：

```bash
npm install -D electron electron-builder
npm run dist:win     # 产出 NSIS 安装包 + 免安装 portable 版
npm run dist:mac     # 产出 dmg / zip
npm run dist:linux   # 产出 AppImage / deb
```

产物在 `release/` 目录。

---

## 🏗️ 项目结构

```
src/
├── core/
│   ├── srs.ts           # SM-2 记忆调度算法
│   ├── srs.test.ts      # 算法单元测试
│   ├── storage.ts       # localStorage 进度 + IndexedDB 自定义词库
│   ├── speech.ts        # 发音（TTS）与判分逻辑
│   ├── import.ts        # 自定义词库解析（支持 7 种格式）
│   ├── import.test.ts   # 解析器单元测试
│   └── modes.ts         # 四种练习模式的定义与选项生成
├── data/
│   ├── books.ts         # 词书懒加载
│   ├── books/*.json     # 词书分片（构建产物）
│   └── types.ts
├── components/
│   ├── Home.tsx         # 首页：今日任务 + 词书进度
│   ├── Practice.tsx     # 练习会话（核心组件）
│   ├── Stats.tsx        # 学习统计
│   ├── MyWords.tsx      # 收藏夹 + 自定义词库
│   ├── SettingsPage.tsx # 设置
│   └── ui.tsx           # 通用 UI 组件
├── store.ts             # 全局状态（轻量自研 store）
└── App.tsx

scripts/
├── parse_wordlists.py   # 源词表 -> 结构化 JSON
├── build_books.py       # 生成词书分片
└── make_icons.py        # 生成 PWA 图标

electron/main.js         # 桌面版主进程
capacitor.config.ts      # 手机 App 打包配置
```

---

## 🧠 记忆算法说明

SM-2 核心规则（实现在 `src/core/srs.ts`）：

| 答题结果 | 行为 |
| --- | --- |
| `again` | 重置 interval 为 0，ease − 0.25，5 分钟后重来 |
| `hard` | interval × 1.2，ease − 0.05 |
| `good` | 首次 1 天 → 第二次 6 天 → 之后 interval × ease |
| `easy` | ease + 0.1，interval × ease × 1.15 |

ease 范围限制在 `1.3 ~ 3.0`。

---

## 📚 词库数据来源

词库基于公开考试大纲词表整理，主要来自开源项目
[`mahavivo/english-wordlists`](https://github.com/mahavivo/english-wordlists)（MIT License），
覆盖中考词表、CET4/6、TOEFL、GRE、NPEE（高考）、小学大纲等原始文本。

`scripts/parse_wordlists.py` 负责把各种格式不统一的原始词表解析成统一结构，
包含词性识别、多义项拆分、跨书音标补全等处理。

重新生成词库：

```bash
git clone https://github.com/mahavivo/english-wordlists.git /tmp/english-wordlists
python scripts/parse_wordlists.py /tmp/english-wordlists ./src/data/_raw
python scripts/build_books.py ./src/data/_raw/books.json ./src/data/books
```

---

## 📄 License

MIT
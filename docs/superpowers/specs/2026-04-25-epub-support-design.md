# EPUB 支持设计文档

**日期：** 2026-04-25  
**范围：** EPUB 格式导入、富文本渲染、TTS 朗读高亮  
**不在范围：** PDF 支持（暂缓）、EPUB 图片渲染、行内粗体/斜体样式

---

## 背景

当前 app 仅支持 `.txt` 格式，所有内容基于字符偏移进行章节划分、进度存储和 TTS 高亮。本次新增 EPUB 格式支持，要求：
1. 保留 EPUB 原有章节结构和标题层级
2. 支持 TTS 朗读，含逐句高亮
3. 最大程度复用现有 TTS/分页/进度逻辑

---

## 核心设计：平铺文本 + 块结构双层模型

每个 EPUB 章节同时维护两种表示：

- **RichTextBlock[]**：带类型的段落列表，用于渲染（标题用大字号，正文用正常样式）
- **flat text**：所有块文字的拼接字符串，用于 TTS、分页、进度存储

每个块记录自身在 flat text 中的字符偏移（`flatStart`/`flatEnd`），TTS 高亮只需判断句子范围与块范围的重叠，无需改动现有句子解析逻辑。

---

## 数据模型变更

### `src/types.ts`

```ts
// Book 新增字段
fileType: 'txt' | 'epub'        // 默认 'txt'，向后兼容

// Chapter 新增字段（仅 EPUB 使用）
htmlFilePath?: string            // 相对于 documentDirectory 的路径

// 新增类型
interface RichTextBlock {
  type: 'h1' | 'h2' | 'h3' | 'p' | 'blockquote'
  text: string
  flatStart: number              // 在章节 flat text 中的起始字符偏移
  flatEnd: number
}
```

### 向后兼容

`fileType` 缺失时默认视为 `'txt'`，存量书籍不受影响。

---

## 新增依赖

| 库 | 用途 | 类型 |
|---|---|---|
| `jszip` | 解压 EPUB（zip）包 | 纯 JS |
| `fast-xml-parser` | 解析 OPF / NCX XML | 纯 JS |

不引入 `epubjs`（其渲染层依赖 DOM API，在 React Native 中不可用）。

---

## 文件结构

### 新增文件
- `src/services/EpubService.ts` — EPUB 解压与结构解析
- `src/components/EpubBlock.tsx` — 单个富文本块渲染组件

### 修改文件
- `src/types.ts` — 数据模型扩展
- `src/services/BookService.ts` — 导入时处理 EPUB，删书时清理解压目录
- `src/services/ChapterService.ts` — 新增 `getChapterBlocks`，EPUB 版 `getChapterContent`
- `src/screens/UploadScreen.tsx` — 接受 `application/epub+zip` MIME 类型
- `src/screens/ReaderScreen.tsx` — EPUB 渲染分支

---

## 导入流程

```
用户选择 EPUB 文件
  └→ UploadScreen.handleLocalPick
       └→ DocumentPicker 接受 application/epub+zip
       └→ BookService.addBook(fileUri, fileName)
            ├─ 复制 .epub 到 documentDirectory/{bookId}.epub
            └─ EpubService.extract(bookId, epubPath)
                 ① jszip 解压到 documentDirectory/epub_{bookId}/
                 ② 读 META-INF/container.xml → 定位 OPF 文件路径
                 ③ 解析 OPF → title、author、spine、manifest
                 ④ 解析 NCX（EPUB2）或 nav.xhtml（EPUB3）→ 章节标题
                 ⑤ 返回 { metadata, spineItems[] }
       └→ 创建 Book 记录（fileType: 'epub'，title/author 来自 OPF）
       └→ ChapterService.parseChapters（EPUB 分支）
            → 遍历 spineItems，每项生成一个 Chapter
            → chapter.htmlFilePath = 'epub_{bookId}/OEBPS/chapter001.html'
            → startPosition / endPosition 置 0（EPUB 不使用字符偏移定位章节）
       └→ 存入 AsyncStorage
```

**解压目录：**
```
documentDirectory/
  {bookId}.epub
  epub_{bookId}/
    META-INF/container.xml
    OEBPS/
      content.opf
      toc.ncx / nav.xhtml
      chapter001.html
      chapter002.html
      ...
```

**删书时：** `BookService.removeBook` 同时删除 `epub_{bookId}/` 目录。

---

## 章节内容解析（EpubService / ChapterService）

### `ChapterService.getChapterBlocks(htmlFilePath): Promise<RichTextBlock[]>`

1. 读取 `{documentDirectory}/{htmlFilePath}` 的 HTML 内容
2. 用正则提取 `<h1>/<h2>/<h3>/<p>/<blockquote>` 标签内容
3. 去除行内标签（`<em>`、`<strong>` 等），保留纯文字
4. 累计计算每块的 `flatStart`/`flatEnd`
5. 返回 `RichTextBlock[]`

### `ChapterService.getChapterContent`（EPUB 分支）

调用 `getChapterBlocks` → 拼接所有 `block.text` → 返回 flat text。

TTS、分页、`ReadingProgress.currentPosition` 全部基于此 flat text，现有逻辑不变。

---

## 渲染层（ReaderScreen）

### 条件分支

| | TXT | EPUB |
|---|---|---|
| 内容获取 | `getChapterContent` → string | `getChapterBlocks` → RichTextBlock[] |
| 渲染单元 | `<Text>` 段落 | `<EpubBlock type={block.type}>` |
| flat text | 即内容本身 | 由块拼接，存于组件 state |
| TTS 输入 | flat text | flat text（相同） |
| 分页 | 字符数估算 | flat text 字符数估算（相同） |
| 进度 `currentPosition` | flat text 偏移 | flat text 偏移（相同） |

### `EpubBlock` 组件

- 接受 `type`、`text`、`highlightRange?: {start, end}` 三个 props
- `h1/h2/h3`：加大字号、加粗，对应现有 `settings.fontSize` 的倍率
- `p/blockquote`：使用现有字号和行距
- 内部高亮逻辑复用现有字符级 span 拆分方式

### TTS 高亮映射

```
当前句子范围 [sentStart, sentEnd]（flat text 偏移）
  → 遍历当前页的块列表
  → 找 block.flatStart <= sentEnd && block.flatEnd >= sentStart 的块
  → 块内局部高亮范围：
      localStart = max(0, sentStart - block.flatStart)
      localEnd   = min(block.text.length, sentEnd - block.flatStart)
  → 传入 EpubBlock 的 highlightRange
```

---

## 边界情况

| 情况 | 处理方式 |
|---|---|
| EPUB 无 NCX/nav（极少数） | 用 spine 顺序生成 "Chapter 1/2/3" 标题 |
| 章节 HTML 含图片标签 | 忽略 `<img>` 标签，仅保留文字 |
| OPF 无 title/author 元数据 | 回退到文件名（去掉 .epub 后缀） |
| 解压失败 | Alert 提示，不创建书籍记录 |
| 存量 TXT 书籍 | `fileType` 缺失默认 `'txt'`，读取路径不变 |

---

## 不在本次范围

- PDF 支持
- EPUB 内嵌图片展示
- 行内粗体/斜体/超链接样式（仅保留文字）
- EPUB DRM 解密
- Wi-Fi 传书支持 EPUB（可在 `WifiServerService` 中补充 MIME 类型后自然支持）

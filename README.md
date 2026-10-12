# YBLX-19/001 三维互动教材

在线页面：https://titleone01.github.io/yblx19-001-classroom/

## 构建与离线文件

使用 Node.js，运行 `npm ci`、`npm run build`。构建会更新内容哈希脚本和 HTML，并生成 `offline/yblx19-001_离线.html`。该文件包含完整模型、脚本、解码器、样式和讲解，单独拷走后可在 Chrome / Edge 双击断网运行。

## 模型和讲解

`lesson.json` 保存每个部件的原厂 / 教学来源、部位说明、装配分组及动作定义；`app.js` 根据保存的初始姿态计算分解和动作，避免累计偏移。`assets/model.json` 记录模型文件、长度与 SHA-256。原厂几何未减面，三维教学机构明确标注。

原始模型：YBLX-19_001行程开关三维模型202502.stp
官方资料：https://www.chint.net/products/491.html

工作动作属于功能教学示意；参数、端子配置和选型以对应实物及官方说明书为准。原始 STEP、Blender 工程和制作验证随本地项目完整保存。

## 发布

GitHub Pages 使用 main 根目录，保留 `.nojekyll`；发布后核对线上资源并实际操作。本站不依赖外部 CDN。iframe 示例见 `embed-example.html`。

## 来源和版权

CHINT、正泰与原厂 CAD 权利归各自权利人。Three.js、Meshopt、esbuild 等依赖许可证保留，详见 THIRD_PARTY_NOTICES.md 与 vendor。

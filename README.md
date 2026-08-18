# 产品成本管理系统 💰

产品信息管理与成本核算工具，纯前端应用，数据存储在浏览器本地 (localStorage)。

## 部署到 GitHub Pages

### 方式一：直接用这个仓库

如果你想直接用我的仓库，只需：
1. Fork 这个仓库
2. 在仓库 Settings → Pages → 选择 `GitHub Actions` 作为部署源
3. 推送到 `main` 分支，自动部署

### 方式二：新建仓库

```bash
# 1. 在 GitHub 上新建一个仓库 (如 cost-app)
# 2. 在本地执行：
cd C:\Users\宋云杰\Documents\my-project\cost-app
git init
git add .
git commit -m "初始化"
git remote add origin https://github.com/你的用户名/cost-app.git
git branch -M main
git push -u origin main
# 3. 推送后自动部署，地址为：https://你的用户名.github.io/cost-app/
```

## 本地运行（带 Node 后端）

```bash
npm install
node server.js
# 访问 http://localhost:3001
```

## 功能

- 产品信息录入（名称、规格、成本价、售价、供应商、分类）
- BOM 物料清单管理
- 自动成本核算（生产成本、利润、利润率）
- 搜索与分类筛选
- 数据导入/导出（JSON）

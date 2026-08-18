const express = require('express');
const path = require('path');
const fs = require('fs');

// ===== JSON 文件数据库 =====
const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('读取数据文件失败:', e.message);
  }
  return { products: [], materials: [], nextId: 1 };
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function now() {
  const d = new Date();
  d.setHours(d.getHours() + 8);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

// ===== 初始化数据 =====
let data = loadData();

// ===== Express 应用 =====
const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ========== 产品管理 API ==========

// 添加产品
app.post('/api/products', (req, res) => {
  try {
    const { name, spec, costPrice, sellPrice, supplier, category, moq, unit, notes } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ ok: false, msg: '请填写产品名称' });
    }
    if (!costPrice && costPrice !== 0) {
      return res.status(400).json({ ok: false, msg: '请填写成本价' });
    }

    const product = {
      id: data.nextId++,
      name: name.trim(),
      spec: (spec || '').trim(),
      costPrice: parseFloat(costPrice) || 0,
      sellPrice: parseFloat(sellPrice) || 0,
      supplier: (supplier || '').trim(),
      category: (category || '').trim(),
      moq: parseInt(moq) || 0,
      unit: (unit || '').trim(),
      notes: (notes || '').trim(),
      created_at: now(),
      updated_at: now(),
    };

    data.products.unshift(product);
    saveData(data);
    res.json({ ok: true, msg: '添加成功！', data: product });
  } catch (e) {
    console.error('添加产品错误:', e);
    res.status(500).json({ ok: false, msg: '服务器错误' });
  }
});

// 获取产品列表
app.get('/api/products', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const keyword = (req.query.keyword || '').trim().toLowerCase();
  const category = (req.query.category || '').trim();

  let filtered = data.products;
  if (keyword) {
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(keyword) ||
      p.spec.toLowerCase().includes(keyword) ||
      p.supplier.toLowerCase().includes(keyword)
    );
  }
  if (category) {
    filtered = filtered.filter(p => p.category === category);
  }

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const offset = (page - 1) * limit;
  const rows = filtered.slice(offset, offset + limit);

  res.json({ ok: true, data: rows, total, page, totalPages });
});

// 获取单个产品
app.get('/api/products/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const product = data.products.find(p => p.id === id);
  if (!product) return res.status(404).json({ ok: false, msg: '产品不存在' });
  res.json({ ok: true, data: product });
});

// 删除产品
app.delete('/api/products/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const idx = data.products.findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).json({ ok: false, msg: '产品不存在' });
  data.products.splice(idx, 1);
  saveData(data);
  res.json({ ok: true, msg: '已删除' });
});

// ========== BOM 物料管理 ==========

// 获取产品的物料清单
app.get('/api/products/:id/materials', (req, res) => {
  const productId = parseInt(req.params.id);
  const materials = data.materials.filter(m => m.productId === productId);
  res.json({ ok: true, data: materials });
});

// 添加物料
app.post('/api/products/:id/materials', (req, res) => {
  const productId = parseInt(req.params.id);
  const { materialName, quantity, unit, costPrice } = req.body;

  if (!materialName || !materialName.trim()) {
    return res.status(400).json({ ok: false, msg: '请填写物料名称' });
  }

  const material = {
    id: data.nextId++,
    productId,
    materialName: materialName.trim(),
    quantity: parseFloat(quantity) || 0,
    unit: (unit || '').trim(),
    costPrice: parseFloat(costPrice) || 0,
    created_at: now(),
    updated_at: now(),
  };

  data.materials.push(material);
  saveData(data);
  res.json({ ok: true, msg: '添加成功', data: material });
});

// 删除物料
app.delete('/api/materials/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const idx = data.materials.findIndex(m => m.id === id);
  if (idx === -1) return res.status(404).json({ ok: false, msg: '物料不存在' });
  data.materials.splice(idx, 1);
  saveData(data);
  res.json({ ok: true, msg: '已删除' });
});

// ========== 成本核算 ==========

app.get('/api/products/:id/cost-analysis', (req, res) => {
  const productId = parseInt(req.params.id);
  const product = data.products.find(p => p.id === productId);
  if (!product) return res.status(404).json({ ok: false, msg: '产品不存在' });

  const materials = data.materials.filter(m => m.productId === productId);
  const materialCost = materials.reduce((sum, m) => sum + (m.quantity * m.costPrice), 0);
  const totalCost = product.costPrice + materialCost;
  const profit = product.sellPrice - totalCost;
  const profitRate = product.sellPrice > 0 ? (profit / product.sellPrice * 100) : 0;

  res.json({
    ok: true,
    data: {
      product,
      materials,
      materialCost: Math.round(materialCost * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      profitRate: Math.round(profitRate * 100) / 100,
    }
  });
});

// ========== 统计（公开） ==========

app.get('/api/stats', (req, res) => {
  const total = data.products.length;
  const totalMaterials = data.materials.length;
  const totalCost = data.products.reduce((s, p) => s + p.costPrice, 0);
  const avgCost = total > 0 ? totalCost / total : 0;
  const categories = [...new Set(data.products.map(p => p.category).filter(Boolean))];

  res.json({
    ok: true,
    data: { total, totalMaterials, totalCost, avgCost: Math.round(avgCost * 100) / 100, categories }
  });
});

// ========== 启动 ==========

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║    产品成本管理系统已启动 🚀            ║
  ║                                          ║
  ║  访问地址: http://localhost:${PORT}       ║
  ║                                          ║
  ║  数据文件: data.json                     ║
  ╚══════════════════════════════════════════╝
  `);
});

// ===== 数据层 =====
let data = { batches: [], nextId: 1 };
let procData = { records: [], nextId: 1 };
let currentTab = 'procurement';

function loadData() {
  try { const r = localStorage.getItem('cost_batch_data'); if (r) data = JSON.parse(r); } catch(e) {}
  if (!data.batches) data.batches = [];
  if (!data.nextId) data.nextId = 1;
}
function saveData() { localStorage.setItem('cost_batch_data', JSON.stringify(data)); }

function loadProcData() {
  try { const r = localStorage.getItem('cost_proc_data'); if (r) procData = JSON.parse(r); } catch(e) {}
  if (!procData.records) procData.records = [];
  if (!procData.nextId) procData.nextId = 1;
}
function saveProcData() { localStorage.setItem('cost_proc_data', JSON.stringify(procData)); }
function nowStr() { var d = new Date(); function p(n) { return n < 10 ? '0' + n : '' + n; } return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()); }
function toast(m, t) { var e = document.getElementById('toast'); e.textContent = m; e.className = 'toast toast-' + t + ' show'; clearTimeout(e._timer); e._timer = setTimeout(function() { e.classList.remove('show'); }, 2500); }

// ===== 成本计算 =====
function calcProd(b) { return (Number(b.materialCost)||0)+(Number(b.packagingCost)||0)+(Number(b.laborCost)||0)+(Number(b.wastage)||0)+(Number(b.moldCost)||0); }
function calcShip(b) { return Number(b.shippingCost)||0; }
function calcTotal(b) { return calcProd(b) + calcShip(b); }
function num(v) { return (Number(v)||0).toFixed(2); }
function esc(s) { return String(s==null?'':s).replace(/[&<>]/g, function(m) { return {'&':'&amp;','<':'&lt;','>':'&gt;'}[m]; }); }

// ===== 标签切换 =====
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(function(t) { t.classList.toggle('active', t.getAttribute('data-tab') === tab); });
  document.querySelectorAll('.tab-content').forEach(function(c) { c.classList.toggle('active', c.id === 'tab' + tab.charAt(0).toUpperCase() + tab.slice(1)); });
  render();
}

// ===== 渲染入口 =====
function render() {
  renderProcurement(procData.records);
  renderShipping();
  renderManagement();
  updatePagination(procData.records.length);
}

function updatePagination(total) {
  var pages = Math.max(1, Math.ceil(total / 50));
  document.getElementById('pageInfo').textContent = '共 ' + total + ' 条';
}

// ===== 运输端 =====
function renderShipping() {
  var extras = (data.shipExpenses || []).reduce(function(s, x) { return s + Number(x.amount); }, 0);

  document.getElementById('shipStats').innerHTML =
    '<div class="stat-card"><div class="num" style="color:#f59e0b">¥' + extras.toFixed(2) + '</div><div class="label">额外费用</div></div>' +
    '<div class="stat-card"><div class="num" style="color:#f59e0b;font-weight:700">¥' + extras.toFixed(2) + '</div><div class="label">运输端合计</div></div>';

  var shipItems = (data.shipExpenses || []).slice().reverse();
  var html = '';

  // 额外费用列表
  if (shipItems.length > 0) {
    html += shipItems.map(function(x) {
      return '<div class="batch-card" style="cursor:default;padding:12px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<div><div style="font-weight:600;font-size:14px">' + esc(x.desc) + '</div>' +
          '<div style="font-size:12px;color:var(--text-secondary)">' + (x.date||'') + '</div></div>' +
          '<div style="text-align:right"><div style="font-size:16px;font-weight:700;color:#f59e0b">¥' + Number(x.amount).toFixed(2) + '</div>' +
          '<button class="btn btn-xs btn-danger" onclick="deleteShipExpense(' + x.id + ')" style="font-size:10px;padding:2px 8px;margin-top:4px">删除</button></div>' +
        '</div></div>';
    }).join('');
  }

  if (!shipItems.length) {
    html = '<div class="empty-state"><div class="icon">🚚</div><p>暂无运输费用</p></div>';
  }

  document.getElementById('shipList').innerHTML = html;
}

// ===== 运输端费用管理 =====
function openShipModal() {
  document.getElementById('shipEditId').value = '';
  document.getElementById('shipDesc').value = '';
  document.getElementById('shipAmount').value = '';
  document.getElementById('shipDate').value = new Date().toISOString().slice(0, 10);
  document.getElementById('shipModal').style.display = '';
}
function closeShipModal() { document.getElementById('shipModal').style.display = 'none'; }
function saveShipExpense(e) {
  e.preventDefault();
  var editId = document.getElementById('shipEditId').value;
  var desc = document.getElementById('shipDesc').value.trim();
  var amount = document.getElementById('shipAmount').value.trim();
  var date = document.getElementById('shipDate').value;
  if (!desc || !amount) { toast('请填写完整信息', 'error'); return; }
  if (!data.shipExpenses) data.shipExpenses = [];
  if (editId) {
    var idx = data.shipExpenses.findIndex(function(x) { return x.id === parseInt(editId); });
    if (idx === -1) return;
    data.shipExpenses[idx].desc = desc;
    data.shipExpenses[idx].amount = amount;
    data.shipExpenses[idx].date = date;
    data.shipExpenses[idx].updated_at = nowStr();
    toast('已更新', 'success');
  } else {
    data.shipExpenses.push({ id: data.nextId++, desc: desc, amount: amount, date: date, created_at: nowStr(), updated_at: nowStr() });
    toast('添加成功', 'success');
  }
  saveData(); closeShipModal(); render();
}
function deleteShipExpense(id) {
  if (!confirm('确定删除？')) return;
  if (!data.shipExpenses) data.shipExpenses = [];
  data.shipExpenses = data.shipExpenses.filter(function(x) { return x.id !== id; });
  saveData(); toast('已删除', 'info'); render();
}

// ===== 批次号生成 =====
function genBatchNo(date, brand, productName) {
  var d = (date || '').replace(/-/g, '');
  var b = (brand || '').replace(/[^a-zA-Z0-9一-龥]/g, '');
  var p = (productName || '').replace(/[^a-zA-Z0-9一-龥]/g, '');
  return d + '-' + b + '-' + p;
}

// ===== 采购端 =====
function renderProcurement(list) {
  var totalOrderQty = list.reduce(function(s, p) { return s + (Number(p.orderQty)||0); }, 0);
  var totalOutputQty = list.reduce(function(s, p) { return s + (Number(p.outputQty)||0); }, 0);

  document.getElementById('procStats').innerHTML =
    '<div class="stat-card"><div class="num" style="color:#8b5cf6">' + list.length + '</div><div class="label">采购记录</div></div>' +
    '<div class="stat-card"><div class="num" style="color:#8b5cf6">' + totalOrderQty + '</div><div class="label">下单总量</div></div>' +
    '<div class="stat-card"><div class="num" style="color:#8b5cf6">' + totalOutputQty + '</div><div class="label">产出总量</div></div>';

  if (list.length === 0) {
    document.getElementById('procList').innerHTML = '<div class="empty-state"><div class="icon">🛒</div><p>暂无采购记录</p></div>';
    return;
  }

  var h = '<div style="overflow-x:auto"><table class="proc-table"><thead><tr>' +
    '<th>批次号</th><th>下单日期</th><th>品牌</th><th>品名</th>' +
    '<th class="num-col">下单数量</th><th class="num-col">产出数量</th>' +
    '<th class="num-col">原料价格</th><th class="num-col">包材价格</th><th class="num-col">工费</th>' +
    '<th style="width:90px">操作</th></tr></thead><tbody>';

  list.forEach(function(p) {
    h += '<tr>' +
      '<td><span style="font-size:11px;color:#6b7280;font-family:monospace">' + esc(p.batchNo||'') + '</span></td>' +
      '<td>' + esc(p.date||'') + '</td>' +
      '<td><strong>' + esc(p.brand||'') + '</strong></td>' +
      '<td>' + esc(p.productName||'') + '</td>' +
      '<td class="num-col">' + (Number(p.orderQty)||0) + '</td>' +
      '<td class="num-col">' + (Number(p.outputQty)||0) + '</td>' +
      '<td class="num-col">' + num(p.materialPrice) + '</td>' +
      '<td class="num-col">' + num(p.packagingPrice) + '</td>' +
      '<td class="num-col">' + num(p.laborCost) + '</td>' +
      '<td><button class="btn btn-xs btn-outline" onclick="event.stopPropagation();openProcEdit(' + p.id + ')" style="font-size:11px;padding:2px 8px">✏️</button> <button class="btn btn-xs btn-danger" onclick="event.stopPropagation();deleteProcurement(' + p.id + ')" style="font-size:11px;padding:2px 8px">🗑️</button></td></tr>';
  });

  h += '</tbody></table></div>';
  document.getElementById('procList').innerHTML = h;
}

function openProcAdd() {
  document.getElementById('procEditId').value = '';
  document.getElementById('procDate').value = new Date().toISOString().slice(0, 10);
  document.getElementById('procBrand').value = '';
  document.getElementById('procProductName').value = '';
  document.getElementById('procOrderQty').value = '';
  document.getElementById('procOutputQty').value = '';
  document.getElementById('procMaterialPrice').value = '';
  document.getElementById('procPackagingPrice').value = '';
  document.getElementById('procLaborCost').value = '';
  document.getElementById('procModal').style.display = '';
}

function openProcEdit(id) {
  var p = procData.records.find(function(x) { return x.id === id; });
  if (!p) return;
  document.getElementById('procEditId').value = p.id;
  document.getElementById('procDate').value = p.date || '';
  document.getElementById('procBrand').value = p.brand || '';
  document.getElementById('procProductName').value = p.productName || '';
  document.getElementById('procOrderQty').value = p.orderQty || '';
  document.getElementById('procOutputQty').value = p.outputQty || '';
  document.getElementById('procMaterialPrice').value = p.materialPrice || '';
  document.getElementById('procPackagingPrice').value = p.packagingPrice || '';
  document.getElementById('procLaborCost').value = p.laborCost || '';
  document.getElementById('procModal').style.display = '';
}

function closeProcModal() { document.getElementById('procModal').style.display = 'none'; }

function saveProcurement(e) {
  e.preventDefault();
  var editId = document.getElementById('procEditId').value;
  var brand = document.getElementById('procBrand').value.trim();
  var productName = document.getElementById('procProductName').value.trim();
  if (!brand || !productName) { toast('请填写品牌和品名', 'error'); return; }
  var date = document.getElementById('procDate').value;
  var obj = {
    batchNo: genBatchNo(date, brand, productName),
    date: date,
    brand: brand,
    productName: productName,
    orderQty: document.getElementById('procOrderQty').value.trim() || '0',
    outputQty: document.getElementById('procOutputQty').value.trim() || '0',
    materialPrice: document.getElementById('procMaterialPrice').value.trim() || '0',
    packagingPrice: document.getElementById('procPackagingPrice').value.trim() || '0',
    laborCost: document.getElementById('procLaborCost').value.trim() || '0',
    updated_at: nowStr()
  };
  if (editId) {
    var idx = procData.records.findIndex(function(p) { return p.id === parseInt(editId); });
    if (idx === -1) return;
    procData.records[idx] = Object.assign({}, procData.records[idx], obj);
    toast('已更新', 'success');
  } else {
    obj.id = procData.nextId++; obj.created_at = nowStr(); procData.records.unshift(obj);
    toast('添加成功', 'success');
  }
  saveProcData(); closeProcModal(); render();
}

function deleteProcurement(id) {
  if (!confirm('确定删除？')) return;
  procData.records = procData.records.filter(function(p) { return p.id !== id; });
  saveProcData(); toast('已删除', 'info'); render();
}

function exportProcCSV() {
  if (procData.records.length === 0) { toast('没有数据可导出', 'error'); return; }
  var data = procData.records.map(function(p) {
    return {
      '批次号': p.batchNo || '',
      '下单日期': p.date || '',
      '品牌': p.brand || '',
      '品名': p.productName || '',
      '下单数量': Number(p.orderQty) || 0,
      '产出数量': Number(p.outputQty) || 0,
      '原料价格': Number(p.materialPrice) || 0,
      '包材价格': Number(p.packagingPrice) || 0,
      '工费': Number(p.laborCost) || 0,
      '录入时间': p.created_at || ''
    };
  });
  var ws = XLSX.utils.json_to_sheet(data);
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '采购记录');
  XLSX.writeFile(wb, '采购记录_' + new Date().toISOString().slice(0,10) + '.xlsx');
  toast('导出成功 ' + procData.records.length + ' 条', 'success');
}

// ===== 管理端 =====
function renderManagement() {
  // 统计数据
  var totalProcRecords = procData.records.length;
  var totalShipExpenses = (data.shipExpenses || []).length;
  var totalShipCost = (data.shipExpenses || []).reduce(function(s, x) { return s + Number(x.amount); }, 0);

  document.getElementById('mgmtStats').innerHTML =
    '<div class="stat-card"><div class="num" style="color:#8b5cf6">' + totalProcRecords + '</div><div class="label">采购记录</div></div>' +
    '<div class="stat-card"><div class="num" style="color:#f59e0b">' + totalShipExpenses + '</div><div class="label">运输费用</div></div>';

  // 数据统计
  document.getElementById('dataStats').innerHTML =
    '<div style="display:grid;gap:12px">' +
      '<div style="display:flex;justify-content:space-between;padding:8px;background:var(--bg);border-radius:8px"><span>运输总成本</span><strong style="color:#f59e0b">¥' + totalShipCost.toFixed(2) + '</strong></div>' +
    '</div>';

  // 系统设置
  document.getElementById('sysSettings').innerHTML =
    '<div style="display:grid;gap:8px">' +
      '<button class="btn btn-sm btn-outline" onclick="exportAllData()" style="width:100%">📤 导出所有数据</button>' +
      '<button class="btn btn-sm btn-outline" onclick="importData()" style="width:100%">📥 导入数据</button>' +
      '<button class="btn btn-sm btn-danger" onclick="clearAllData()" style="width:100%">🗑️ 清空所有数据</button>' +
      '<div style="font-size:11px;color:var(--text-secondary);text-align:center;margin-top:8px">批次成本管理 v1.0</div>' +
    '</div>';
}

function exportAllData() {
  var allData = { procurement: procData, shipping: { shipExpenses: data.shipExpenses || [] }, exportTime: nowStr() };
  var blob = new Blob([JSON.stringify(allData, null, 2)], {type:'application/json'});
  var url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = '成本管理备份_' + new Date().toISOString().slice(0,10) + '.json'; a.click(); URL.revokeObjectURL(url);
  toast('导出成功', 'success');
}

function importData() {
  var input = document.createElement('input');
  input.type = 'file'; input.accept = '.json';
  input.onchange = function(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      try {
        var imported = JSON.parse(ev.target.result);
        if (imported.shipping && imported.shipping.shipExpenses) { data.shipExpenses = imported.shipping.shipExpenses; saveData(); }
        if (imported.procurement) { procData = imported.procurement; saveProcData(); }
        toast('导入成功', 'success'); render();
      } catch(err) { toast('导入失败：文件格式错误', 'error'); }
    };
    reader.readAsText(file);
  };
  input.click();
}

function clearAllData() {
  if (!confirm('确定清空所有数据？此操作不可恢复！')) return;
  if (!confirm('再次确认：真的要清空所有数据吗？')) return;
  data = { batches: [], nextId: 1, shipExpenses: [] };
  procData = { records: [], nextId: 1 };
  saveData(); saveProcData();
  toast('已清空所有数据', 'info'); render();
}

// ===== 初始化 =====
loadData();
loadProcData();
render();

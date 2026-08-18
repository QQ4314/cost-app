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

// ===== 搜索 =====
var _st;
function onSearch() { clearTimeout(_st); _st = setTimeout(function() { render(); }, 300); }

// ===== 渲染入口 =====
function render() {
  var kw = document.getElementById('searchInput').value.trim().toLowerCase();
  var filteredProc = procData.records;
  if (kw) filteredProc = filteredProc.filter(function(p) { return (p.supplier||'').toLowerCase().includes(kw) || (p.material||'').toLowerCase().includes(kw) || (p.batchCode||'').toLowerCase().includes(kw); });

  renderProcurement(filteredProc);
  renderShipping();
  renderManagement();
  updatePagination(filteredProc.length);
}

function updatePagination(total) {
  var pages = Math.max(1, Math.ceil(total / 50));
  document.getElementById('pageInfo').textContent = '共 ' + total + ' 条';
}

function kw() { return document.getElementById('searchInput').value.trim(); }

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
    html = '<div class="empty-state"><div class="icon">🚚</div><p>' + (kw() ? '没有匹配的记录' : '暂无运输费用') + '</p></div>';
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

// ===== 采购端 =====
function renderProcurement(list) {
  var totalAmount = list.reduce(function(s, p) { return s + (Number(p.quantity)||0) * (Number(p.unitPrice)||0); }, 0);
  var totalQty = list.reduce(function(s, p) { return s + (Number(p.quantity)||0); }, 0);
  var pendingCount = list.filter(function(p) { return p.status === 'pending'; }).length;

  document.getElementById('procStats').innerHTML =
    '<div class="stat-card"><div class="num" style="color:#8b5cf6">' + list.length + '</div><div class="label">采购记录</div></div>' +
    '<div class="stat-card"><div class="num" style="color:#8b5cf6">' + totalQty + '</div><div class="label">总数量</div></div>' +
    '<div class="stat-card"><div class="num" style="color:#8b5cf6">¥' + totalAmount.toFixed(2) + '</div><div class="label">采购总额</div></div>' +
    '<div class="stat-card"><div class="num" style="color:#f59e0b">' + pendingCount + '</div><div class="label">待审批</div></div>';

  if (list.length === 0) {
    document.getElementById('procList').innerHTML = '<div class="empty-state"><div class="icon">🛒</div><p>' + (kw() ? '没有匹配的记录' : '暂无采购记录') + '</p></div>';
    return;
  }

  var h = '<div style="overflow-x:auto"><table class="proc-table"><thead><tr>' +
    '<th>采购日期</th><th>供应商</th><th>原材料</th><th>规格</th>' +
    '<th class="num-col">数量</th><th>单位</th><th class="num-col">单价</th>' +
    '<th class="num-col">总金额</th><th>批次号</th><th>状态</th><th style="width:90px">操作</th></tr></thead><tbody>';

  list.forEach(function(p) {
    var total = (Number(p.quantity)||0) * (Number(p.unitPrice)||0);
    var statusText = {'pending':'待审批','approved':'已审批','received':'已入库'}[p.status] || p.status;
    var statusColor = {'pending':'#f59e0b','approved':'#10b981','received':'#06b6d4'}[p.status] || '#94a3b8';
    h += '<tr>' +
      '<td>' + esc(p.date||'') + '</td>' +
      '<td><strong>' + esc(p.supplier||'') + '</strong></td>' +
      '<td>' + esc(p.material||'') + '</td>' +
      '<td>' + esc(p.specification||'') + '</td>' +
      '<td class="num-col">' + (Number(p.quantity)||0) + '</td>' +
      '<td>' + esc(p.unit||'') + '</td>' +
      '<td class="num-col">' + num(p.unitPrice) + '</td>' +
      '<td class="num-col" style="font-weight:700;color:#8b5cf6">¥' + total.toFixed(2) + '</td>' +
      '<td>' + esc(p.batchCode||'') + '</td>' +
      '<td><span style="color:' + statusColor + ';font-weight:600">' + statusText + '</span></td>' +
      '<td><button class="btn btn-xs btn-outline" onclick="event.stopPropagation();openProcEdit(' + p.id + ')" style="font-size:11px;padding:2px 8px">✏️</button> <button class="btn btn-xs btn-danger" onclick="event.stopPropagation();deleteProcurement(' + p.id + ')" style="font-size:11px;padding:2px 8px">🗑️</button></td></tr>';
  });

  h += '</tbody></table></div>';
  document.getElementById('procList').innerHTML = h;
}

function openProcAdd() {
  document.getElementById('procEditId').value = '';
  document.getElementById('procDate').value = new Date().toISOString().slice(0, 10);
  document.getElementById('procSupplier').value = '';
  document.getElementById('procMaterial').value = '';
  document.getElementById('procSpec').value = '';
  document.getElementById('procQty').value = '';
  document.getElementById('procUnit').value = '';
  document.getElementById('procPrice').value = '';
  document.getElementById('procBatchCode').value = '';
  document.getElementById('procStatus').value = 'pending';
  document.getElementById('procNotes').value = '';
  document.getElementById('procTotalDisplay').textContent = '¥0.00';
  document.getElementById('procModal').style.display = '';
}

function openProcEdit(id) {
  var p = procData.records.find(function(x) { return x.id === id; });
  if (!p) return;
  document.getElementById('procEditId').value = p.id;
  document.getElementById('procDate').value = p.date || '';
  document.getElementById('procSupplier').value = p.supplier || '';
  document.getElementById('procMaterial').value = p.material || '';
  document.getElementById('procSpec').value = p.specification || '';
  document.getElementById('procQty').value = p.quantity || '';
  document.getElementById('procUnit').value = p.unit || '';
  document.getElementById('procPrice').value = p.unitPrice || '';
  document.getElementById('procBatchCode').value = p.batchCode || '';
  document.getElementById('procStatus').value = p.status || 'pending';
  document.getElementById('procNotes').value = p.notes || '';
  calcProcPreview();
  document.getElementById('procModal').style.display = '';
}

function closeProcModal() { document.getElementById('procModal').style.display = 'none'; }

function calcProcPreview() {
  var qty = Number(document.getElementById('procQty').value) || 0;
  var price = Number(document.getElementById('procPrice').value) || 0;
  document.getElementById('procTotalDisplay').textContent = '¥' + (qty * price).toFixed(2);
}

function saveProcurement(e) {
  e.preventDefault();
  var editId = document.getElementById('procEditId').value;
  var supplier = document.getElementById('procSupplier').value.trim();
  var material = document.getElementById('procMaterial').value.trim();
  if (!supplier || !material) { toast('请填写供应商和原材料', 'error'); return; }
  var obj = {
    date: document.getElementById('procDate').value,
    supplier: supplier,
    material: material,
    specification: document.getElementById('procSpec').value.trim(),
    quantity: document.getElementById('procQty').value.trim() || '0',
    unit: document.getElementById('procUnit').value.trim(),
    unitPrice: document.getElementById('procPrice').value.trim() || '0',
    batchCode: document.getElementById('procBatchCode').value.trim(),
    status: document.getElementById('procStatus').value,
    notes: document.getElementById('procNotes').value.trim(),
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
  var h = ['采购日期','供应商','原材料','规格','数量','单位','单价','总金额','批次号','状态','备注','录入时间'];
  var rows = [h.map(function(c) { return '"' + c + '"'; }).join(',')];
  procData.records.forEach(function(p) {
    var total = (Number(p.quantity)||0) * (Number(p.unitPrice)||0);
    var statusText = {'pending':'待审批','approved':'已审批','received':'已入库'}[p.status] || p.status;
    rows.push([p.date||'',p.supplier||'',p.material||'',p.specification||'',p.quantity||'0',p.unit||'',p.unitPrice||'0',total.toFixed(2),p.batchCode||'',statusText,p.notes||'',p.created_at||''].map(function(v){return '"'+String(v).replace(/"/g,'""')+'"'}).join(','));
  });
  var csv = '﻿' + rows.join('\n');
  var blob = new Blob([csv], {type:'text/csv;charset=utf-8;'}), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = '采购记录_' + new Date().toISOString().slice(0,10) + '.csv'; a.click(); URL.revokeObjectURL(url);
  toast('导出成功 ' + procData.records.length + ' 条', 'success');
}

// ===== 管理端 =====
function renderManagement() {
  // 统计数据
  var totalProcRecords = procData.records.length;
  var totalShipExpenses = (data.shipExpenses || []).length;
  var totalShipCost = (data.shipExpenses || []).reduce(function(s, x) { return s + Number(x.amount); }, 0);
  var totalProcAmount = procData.records.reduce(function(s, p) { return s + (Number(p.quantity)||0) * (Number(p.unitPrice)||0); }, 0);
  var pendingApprovals = procData.records.filter(function(p) { return p.status === 'pending'; }).length;

  document.getElementById('mgmtStats').innerHTML =
    '<div class="stat-card"><div class="num" style="color:#8b5cf6">' + totalProcRecords + '</div><div class="label">采购记录</div></div>' +
    '<div class="stat-card"><div class="num" style="color:#f59e0b">' + totalShipExpenses + '</div><div class="label">运输费用</div></div>' +
    '<div class="stat-card"><div class="num" style="color:#f59e0b">' + pendingApprovals + '</div><div class="label">待审批</div></div>';

  // 费用审批列表
  var approvalHtml = '';
  var pendingProc = procData.records.filter(function(p) { return p.status === 'pending'; });
  if (pendingProc.length > 0) {
    approvalHtml += '<div style="margin-bottom:12px"><h4 style="font-size:13px;color:var(--text-secondary);margin-bottom:8px">🛒 采购审批</h4>';
    pendingProc.forEach(function(p) {
      var total = (Number(p.quantity)||0) * (Number(p.unitPrice)||0);
      approvalHtml += '<div class="approval-item">' +
        '<div><div style="font-weight:600">' + esc(p.supplier) + ' - ' + esc(p.material) + '</div>' +
        '<div style="font-size:12px;color:var(--text-secondary)">¥' + total.toFixed(2) + ' | ' + (p.date||'') + '</div></div>' +
        '<div class="approval-actions">' +
          '<button class="btn-approve" onclick="approveProcurement(' + p.id + ')">✓ 通过</button>' +
          '<button class="btn-reject" onclick="rejectProcurement(' + p.id + ')">✕ 拒绝</button>' +
        '</div></div>';
    });
    approvalHtml += '</div>';
  }

  if (!approvalHtml) {
    approvalHtml = '<div style="text-align:center;color:var(--text-secondary);padding:20px">暂无待审批事项</div>';
  }
  document.getElementById('approvalList').innerHTML = approvalHtml;

  // 数据统计
  document.getElementById('dataStats').innerHTML =
    '<div style="display:grid;gap:12px">' +
      '<div style="display:flex;justify-content:space-between;padding:8px;background:var(--bg);border-radius:8px"><span>运输总成本</span><strong style="color:#f59e0b">¥' + totalShipCost.toFixed(2) + '</strong></div>' +
      '<div style="display:flex;justify-content:space-between;padding:8px;background:var(--bg);border-radius:8px"><span>采购总额</span><strong style="color:#8b5cf6">¥' + totalProcAmount.toFixed(2) + '</strong></div>' +
      '<div style="display:flex;justify-content:space-between;padding:8px;background:var(--bg);border-radius:8px"><span>总成本</span><strong style="color:var(--success)">¥' + totalShipCost.toFixed(2) + '</strong></div>' +
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

function approveProcurement(id) {
  var idx = procData.records.findIndex(function(p) { return p.id === id; });
  if (idx === -1) return;
  procData.records[idx].status = 'approved';
  procData.records[idx].updated_at = nowStr();
  saveProcData(); toast('已审批通过', 'success'); render();
}

function rejectProcurement(id) {
  if (!confirm('确定拒绝？')) return;
  var idx = procData.records.findIndex(function(p) { return p.id === id; });
  if (idx === -1) return;
  procData.records[idx].status = 'rejected';
  procData.records[idx].updated_at = nowStr();
  saveProcData(); toast('已拒绝', 'info'); render();
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

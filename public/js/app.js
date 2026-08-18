// ===== 数据层 =====
let data = { batches: [], nextId: 1 };
let procData = { records: [], nextId: 1 };
let currentTab = 'summary';

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
  var filtered = data.batches;
  if (kw) filtered = filtered.filter(function(b) { return (b.batchCode||'').toLowerCase().includes(kw) || (b.productName||'').toLowerCase().includes(kw) || (b.batch||'').toLowerCase().includes(kw); });

  var filteredProc = procData.records;
  if (kw) filteredProc = filteredProc.filter(function(p) { return (p.supplier||'').toLowerCase().includes(kw) || (p.material||'').toLowerCase().includes(kw) || (p.batchCode||'').toLowerCase().includes(kw); });

  renderSummary(filtered);
  renderProcurement(filteredProc);
  renderProduction(filtered);
  renderShipping(filtered);
  renderManagement();
  updatePagination(filtered.length);
}

function updatePagination(total) {
  var pages = Math.max(1, Math.ceil(total / 50));
  document.getElementById('pageInfo').textContent = '共 ' + total + ' 条';
}

// ===== 汇总 =====
function renderSummary(list) {
  var totalCost = list.reduce(function(s, b) { return s + calcTotal(b); }, 0);
  var totalProd = list.reduce(function(s, b) { return s + calcProd(b); }, 0);
  var totalShip = list.reduce(function(s, b) { return s + calcShip(b); }, 0);
  var totalQty = list.reduce(function(s, b) { return s + (Number(b.quantity)||0); }, 0);
  var avgCost = totalQty > 0 ? totalCost / totalQty : 0;

  document.getElementById('summaryStats').innerHTML =
    '<div class="stat-card"><div class="num" style="color:var(--primary)">' + list.length + '</div><div class="label">批次总数</div></div>' +
    '<div class="stat-card"><div class="num" style="color:#06b6d4">' + totalQty + '</div><div class="label">总数量</div></div>' +
    '<div class="stat-card"><div class="num" style="color:#0891b2">¥' + totalProd.toFixed(2) + '</div><div class="label">生产端总成本</div></div>' +
    '<div class="stat-card"><div class="num" style="color:#f59e0b">¥' + totalShip.toFixed(2) + '</div><div class="label">运输端总成本</div></div>' +
    '<div class="stat-card"><div class="num" style="color:var(--success)">¥' + totalCost.toFixed(2) + '</div><div class="label">总成本</div></div>' +
    '<div class="stat-card"><div class="num" style="color:var(--warning)">¥' + avgCost.toFixed(2) + '</div><div class="label">平均单位成本</div></div>';

  document.getElementById('summaryList').innerHTML = '';
}

function kw() { return document.getElementById('searchInput').value.trim(); }

// ===== 生产端（表格视图） =====
function renderProduction(list) {
  var totalMat = list.reduce(function(s, b) { return s + (Number(b.materialCost)||0); }, 0);
  var totalPkg = list.reduce(function(s, b) { return s + (Number(b.packagingCost)||0); }, 0);
  var totalLab = list.reduce(function(s, b) { return s + (Number(b.laborCost)||0); }, 0);
  var totalWas = list.reduce(function(s, b) { return s + (Number(b.wastage)||0); }, 0);
  var totalMld = list.reduce(function(s, b) { return s + (Number(b.moldCost)||0); }, 0);
  var totalShip = list.reduce(function(s, b) { return s + (Number(b.shippingCost)||0); }, 0);
  var totalProd = list.reduce(function(s, b) { return s + calcProd(b); }, 0);

  document.getElementById('prodStats').innerHTML =
    '<div class="stat-card"><div class="num" style="color:#0891b2">¥' + totalMat.toFixed(2) + '</div><div class="label">原料费</div></div>' +
    '<div class="stat-card"><div class="num" style="color:#0891b2">¥' + totalPkg.toFixed(2) + '</div><div class="label">包材费</div></div>' +
    '<div class="stat-card"><div class="num" style="color:#0891b2">¥' + totalLab.toFixed(2) + '</div><div class="label">工费</div></div>' +
    '<div class="stat-card"><div class="num" style="color:#0891b2">¥' + totalWas.toFixed(2) + '</div><div class="label">损耗</div></div>' +
    '<div class="stat-card"><div class="num" style="color:#0891b2">¥' + totalMld.toFixed(2) + '</div><div class="label">开模费</div></div>' +
    '<div class="stat-card"><div class="num" style="color:#0891b2;font-weight:700">¥' + totalProd.toFixed(2) + '</div><div class="label">生产端合计</div></div>';

  if (list.length === 0) {
    document.getElementById('prodList').innerHTML = '<div class="empty-state"><div class="icon">🏭</div><p>' + (kw() ? '没有匹配的批次' : '暂无数据') + '</p></div>';
    return;
  }

  var h = '<div style="overflow-x:auto"><table class="prod-table"><thead><tr>' +
    '<th>批次编码</th><th>品名</th><th>批次</th><th class="num-col">数量</th>' +
    '<th class="num-col">原料费</th><th class="num-col">包材费</th><th class="num-col">工费</th>' +
    '<th class="num-col">损耗</th><th class="num-col">开模费</th><th class="num-col">运费</th>' +
    '<th class="num-col">小计</th><th style="width:90px">操作</th><th style="width:80px">附件</th></tr></thead><tbody>';

  list.forEach(function(b) {
    var prod = calcProd(b);
    h += '<tr>' +
      '<td>' + esc(b.batchCode||'') + '</td>' +
      '<td><strong>' + esc(b.productName||'') + '</strong></td>' +
      '<td>' + esc(b.batch||'') + '</td>' +
      '<td class="num-col">' + (Number(b.quantity)||0) + '</td>' +
      '<td class="num-col">' + num(b.materialCost) + '</td>' +
      '<td class="num-col">' + num(b.packagingCost) + '</td>' +
      '<td class="num-col">' + num(b.laborCost) + '</td>' +
      '<td class="num-col">' + num(b.wastage) + '</td>' +
      '<td class="num-col">' + num(b.moldCost) + '</td>' +
      '<td class="num-col">' + num(b.shippingCost) + '</td>' +
      '<td class="num-col" style="font-weight:700;color:#0891b2">' + prod.toFixed(2) + '</td>' +
      '<td><button class="btn btn-xs btn-outline" onclick="event.stopPropagation();openEdit(' + b.id + ')" style="font-size:11px;padding:2px 8px">✏️</button> <button class="btn btn-xs btn-danger" onclick="event.stopPropagation();deleteBatch(' + b.id + ')" style="font-size:11px;padding:2px 8px">🗑️</button></td>' +
      '<td style="text-align:center">' +
        (b.attachmentName
          ? '<span style="color:var(--primary);cursor:pointer;font-size:12px" onclick="event.stopPropagation();viewFile(\'' + b.attachmentData + '\',\'' + esc(b.attachmentName) + '\')">📎</span>'
          : '<span style="color:#94a3b8;font-size:11px">—</span>') +
      '</td></tr>';
  });

  // 合计行
  h += '<tr style="font-weight:700;background:#f0f9ff">' +
    '<td colspan="4" style="text-align:right">合计</td>' +
    '<td class="num-col">' + totalMat.toFixed(2) + '</td>' +
    '<td class="num-col">' + totalPkg.toFixed(2) + '</td>' +
    '<td class="num-col">' + totalLab.toFixed(2) + '</td>' +
    '<td class="num-col">' + totalWas.toFixed(2) + '</td>' +
    '<td class="num-col">' + totalMld.toFixed(2) + '</td>' +
    '<td class="num-col">' + totalShip.toFixed(2) + '</td>' +
    '<td class="num-col" style="color:#0891b2">' + totalProd.toFixed(2) + '</td>' +
    '<td colspan="2"></td></tr>';

  h += '</tbody></table></div>';
  document.getElementById('prodList').innerHTML = h;
}

// ===== 运输端 =====
function renderShipping(list) {
  var batchShip = list.reduce(function(s, b) { return s + calcShip(b); }, 0);
  var extras = (data.shipExpenses || []).reduce(function(s, x) { return s + Number(x.amount); }, 0);
  var totalShip = batchShip + extras;

  document.getElementById('shipStats').innerHTML =
    '<div class="stat-card"><div class="num" style="color:#f59e0b">¥' + batchShip.toFixed(2) + '</div><div class="label">批次运费</div></div>' +
    '<div class="stat-card"><div class="num" style="color:#f59e0b">¥' + extras.toFixed(2) + '</div><div class="label">额外费用</div></div>' +
    '<div class="stat-card"><div class="num" style="color:#f59e0b;font-weight:700">¥' + totalShip.toFixed(2) + '</div><div class="label">运输端合计</div></div>';

  var shipItems = (data.shipExpenses || []).slice().reverse();
  var withShip = list.filter(function(b) { return calcShip(b) > 0; });

  var html = '';

  // 批次运费列表
  if (withShip.length > 0) {
    html += '<h4 style="font-size:13px;color:var(--text-secondary);margin:12px 0 6px">📦 批次运费</h4>';
    html += withShip.map(function(b) {
      var ship = calcShip(b);
      return '<div class="batch-card" style="cursor:default;padding:12px" onclick="openEdit(' + b.id + ')">' +
        '<div class="top-row"><span class="name" style="font-size:14px">' + esc(b.productName||'') + '</span><span style="font-size:12px;color:var(--text-secondary)">' + esc(b.batch||'') + '</span></div>' +
        '<div style="border-left:3px solid #f59e0b;padding-left:10px;font-size:14px;color:#f59e0b;font-weight:600">🚚 ¥' + ship.toFixed(2) + '</div></div>';
    }).join('');
  }

  // 额外费用列表
  if (shipItems.length > 0) {
    html += '<h4 style="font-size:13px;color:var(--text-secondary);margin:12px 0 6px">📋 额外费用</h4>';
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

  if (!withShip.length && !shipItems.length) {
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

// ===== 新增/编辑 =====
function openAdd() {
  document.getElementById('editId').value = '';
  document.getElementById('modalTitle').textContent = '➕ 新增批次';
  document.getElementById('batchForm').reset();
  document.getElementById('totalDisplay').textContent = '¥0.00';
  document.getElementById('unitDisplay').textContent = '¥0.00';
  clearFile();
  document.getElementById('batchModal').style.display = '';
}

function openEdit(id) {
  var b = data.batches.find(function(x) { return x.id === id; });
  if (!b) return;
  document.getElementById('editId').value = b.id;
  document.getElementById('modalTitle').textContent = '✏️ 编辑批次';
  document.getElementById('f_batchCode').value = b.batchCode || '';
  document.getElementById('f_productName').value = b.productName || '';
  document.getElementById('f_batch').value = b.batch || '';
  document.getElementById('f_quantity').value = b.quantity || '';
  document.getElementById('f_materialCost').value = b.materialCost || '';
  document.getElementById('f_packagingCost').value = b.packagingCost || '';
  document.getElementById('f_laborCost').value = b.laborCost || '';
  document.getElementById('f_wastage').value = b.wastage || '';
  document.getElementById('f_moldCost').value = b.moldCost || '';
  document.getElementById('f_shippingCost').value = b.shippingCost || '';
  if (b.attachmentData && b.attachmentName) {
    document.getElementById('f_attachmentData').value = b.attachmentData;
    document.getElementById('f_attachmentName').value = b.attachmentName;
    document.getElementById('fileInfo').style.display = '';
    document.getElementById('fileInfo').innerHTML = '📎 ' + b.attachmentName;
  } else { clearFile(); }
  calcPreview();
  document.getElementById('batchModal').style.display = '';
}

function closeModal() { document.getElementById('batchModal').style.display = 'none'; }

function calcPreview() {
  var mat=Number(document.getElementById('f_materialCost').value)||0, pkg=Number(document.getElementById('f_packagingCost').value)||0, lab=Number(document.getElementById('f_laborCost').value)||0, was=Number(document.getElementById('f_wastage').value)||0, mld=Number(document.getElementById('f_moldCost').value)||0, shp=Number(document.getElementById('f_shippingCost').value)||0, qty=Number(document.getElementById('f_quantity').value)||0, prod=mat+pkg+lab+was+mld, total=prod+shp;
  document.getElementById('totalDisplay').textContent = '¥' + total.toFixed(2);
  document.getElementById('unitDisplay').textContent = qty > 0 ? '¥' + (total / qty).toFixed(2) : '¥0.00';
}

function saveBatch(e) {
  e.preventDefault();
  var editId=document.getElementById('editId').value, pn=document.getElementById('f_productName').value.trim(), bt=document.getElementById('f_batch').value.trim();
  if (!pn) { toast('请填写品名', 'error'); return; }
  if (!bt) { toast('请填写批次', 'error'); return; }
  var obj = {
    batchCode: document.getElementById('f_batchCode').value.trim(),
    productName: pn, batch: bt,
    quantity: document.getElementById('f_quantity').value.trim() || '0',
    materialCost: document.getElementById('f_materialCost').value.trim() || '0',
    packagingCost: document.getElementById('f_packagingCost').value.trim() || '0',
    laborCost: document.getElementById('f_laborCost').value.trim() || '0',
    wastage: document.getElementById('f_wastage').value.trim() || '0',
    moldCost: document.getElementById('f_moldCost').value.trim() || '0',
    shippingCost: document.getElementById('f_shippingCost').value.trim() || '0',
    attachmentData: document.getElementById('f_attachmentData').value || '',
    attachmentName: document.getElementById('f_attachmentName').value || '',
    updated_at: nowStr()
  };
  if (editId) {
    var idx = data.batches.findIndex(function(b) { return b.id === parseInt(editId); });
    if (idx === -1) return;
    data.batches[idx] = Object.assign({}, data.batches[idx], obj);
    toast('已更新', 'success');
  } else {
    obj.id = data.nextId++; obj.created_at = nowStr(); data.batches.unshift(obj);
    toast('添加成功', 'success');
  }
  saveData(); closeModal(); render();
}

function deleteBatch(id) {
  if (!confirm('确定删除？')) return;
  data.batches = data.batches.filter(function(b) { return b.id !== id; });
  saveData(); toast('已删除', 'info'); render();
}

// ===== 附件 =====
function onFileSelect() {
  var input = document.getElementById('f_attachment'), file = input.files[0], info = document.getElementById('fileInfo');
  if (!file) { info.style.display = 'none'; return; }
  if (file.size > 2*1024*1024) { info.style.display=''; info.innerHTML='⚠️ 文件超过2MB限制'; input.value=''; return; }
  var reader = new FileReader();
  reader.onload = function(e) {
    document.getElementById('f_attachmentData').value = e.target.result;
    document.getElementById('f_attachmentName').value = file.name;
    info.style.display = ''; info.innerHTML = '📎 ' + file.name + ' (' + (file.size/1024).toFixed(1) + 'KB)';
  };
  reader.readAsDataURL(file);
}
function clearFile() { document.getElementById('f_attachment').value=''; document.getElementById('f_attachmentData').value=''; document.getElementById('f_attachmentName').value=''; document.getElementById('fileInfo').style.display='none'; }
function viewFile(data, name) { if (!data) return; var w=window.open(); if(data.startsWith('data:image')){w.document.write('<img src="'+data+'" style="max-width:100%"><p style="font-size:13px;color:#888;text-align:center;margin-top:8px">'+esc(name)+'</p>')}else if(data.startsWith('data:application/pdf')){w.document.write('<iframe src="'+data+'" style="width:100%;height:100vh;border:none"></iframe>')}else{var a=w.document.createElement('a');a.href=data;a.download=name;a.click();w.close()} }

// ===== 导出 =====
function exportCSV() {
  if (data.batches.length === 0) { toast('没有数据可导出', 'error'); return; }
  var h = ['批次编码','品名','批次','数量','原料费','包材费','工费','损耗','开模费','运费','总成本','单位成本','录入时间'];
  var rows = [h.map(function(c) { return '"' + c + '"'; }).join(',')];
  data.batches.forEach(function(b) {
    var total = calcTotal(b), unit = (Number(b.quantity)||0) > 0 ? total / (Number(b.quantity)||1) : 0;
    rows.push([b.batchCode||'',b.productName||'',b.batch||'',b.quantity||'0',b.materialCost||'0',b.packagingCost||'0',b.laborCost||'0',b.wastage||'0',b.moldCost||'0',b.shippingCost||'0',total.toFixed(2),unit.toFixed(2),b.created_at||''].map(function(v){return '"'+String(v).replace(/"/g,'""')+'"'}).join(','));
  });
  var csv = '﻿' + rows.join('\n');
  var blob = new Blob([csv], {type:'text/csv;charset=utf-8;'}), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = '批次成本_' + new Date().toISOString().slice(0,10) + '.csv'; a.click(); URL.revokeObjectURL(url);
  toast('导出成功 ' + data.batches.length + ' 条', 'success');
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
  var totalBatches = data.batches.length;
  var totalProcRecords = procData.records.length;
  var totalShipExpenses = (data.shipExpenses || []).length;
  var totalProdCost = data.batches.reduce(function(s, b) { return s + calcProd(b); }, 0);
  var totalShipCost = data.batches.reduce(function(s, b) { return s + calcShip(b); }, 0) + (data.shipExpenses || []).reduce(function(s, x) { return s + Number(x.amount); }, 0);
  var totalProcAmount = procData.records.reduce(function(s, p) { return s + (Number(p.quantity)||0) * (Number(p.unitPrice)||0); }, 0);
  var pendingApprovals = procData.records.filter(function(p) { return p.status === 'pending'; }).length;

  document.getElementById('mgmtStats').innerHTML =
    '<div class="stat-card"><div class="num" style="color:var(--primary)">' + totalBatches + '</div><div class="label">生产批次</div></div>' +
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
      '<div style="display:flex;justify-content:space-between;padding:8px;background:var(--bg);border-radius:8px"><span>生产总成本</span><strong style="color:#0891b2">¥' + totalProdCost.toFixed(2) + '</strong></div>' +
      '<div style="display:flex;justify-content:space-between;padding:8px;background:var(--bg);border-radius:8px"><span>运输总成本</span><strong style="color:#f59e0b">¥' + totalShipCost.toFixed(2) + '</strong></div>' +
      '<div style="display:flex;justify-content:space-between;padding:8px;background:var(--bg);border-radius:8px"><span>采购总额</span><strong style="color:#8b5cf6">¥' + totalProcAmount.toFixed(2) + '</strong></div>' +
      '<div style="display:flex;justify-content:space-between;padding:8px;background:var(--bg);border-radius:8px"><span>总成本</span><strong style="color:var(--success)">¥' + (totalProdCost + totalShipCost).toFixed(2) + '</strong></div>' +
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
  var allData = { batches: data, procurement: procData, exportTime: nowStr() };
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
        if (imported.batches) { data = imported.batches; saveData(); }
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
  data = { batches: [], nextId: 1 };
  procData = { records: [], nextId: 1 };
  saveData(); saveProcData();
  toast('已清空所有数据', 'info'); render();
}

// ===== 初始化 =====
loadData();
loadProcData();
render();

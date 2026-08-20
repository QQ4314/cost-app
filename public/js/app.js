// ===== 数据层 =====
let data = { batches: [], nextId: 1, pickups: [], pickupBatches: [], shipExpenses: [] };
let procData = { records: [], nextId: 1 };
let currentTab = 'procurement';
let selectedPickupNos = []; // 当前选中的提货号列表

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
function nowStr() {
  var d = new Date(); function p(n) { return n < 10 ? '0' + n : '' + n; }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}
function toast(m, t) {
  var e = document.getElementById('toast'); e.textContent = m; e.className = 'toast toast-' + t + ' show';
  clearTimeout(e._timer); e._timer = setTimeout(function() { e.classList.remove('show'); }, 2500);
}

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
  var pickups = data.pickups || [];
  var batches = data.pickupBatches || [];
  var expenses = data.shipExpenses || [];
  var totalExpense = expenses.reduce(function(s, x) { return s + (Number(x.truckFee)||0) + (Number(x.miscFee)||0) + (Number(x.oceanFee)||0) + (Number(x.storageFee)||0); }, 0);
  document.getElementById('shipStats').innerHTML = '<div class="stat-card"><div class="num" style="color:#f59e0b">' + pickups.length + '</div><div class="label">提货记录</div></div>' + '<div class="stat-card"><div class="num" style="color:#10b981">' + batches.length + '</div><div class="label">提货批次</div></div>' + '<div class="stat-card"><div class="num" style="color:#6366f1">¥' + totalExpense.toFixed(2) + '</div><div class="label">总费用</div></div>';
  var html = '';
  if (batches.length > 0) {
    html += '<h4 style="margin:16px 0 8px;color:var(--text)">📦 提货批次</h4>';
    html += batches.slice().reverse().map(function(b) {
      var batchPickups = pickups.filter(function(p) { return b.pickupNos && b.pickupNos.indexOf(p.pickupNo) >= 0; });
      var expense = expenses.find(function(e) { return e.batchNo === b.batchNo; });
      var total = expense ? (Number(expense.truckFee)||0)+(Number(expense.miscFee)||0)+(Number(expense.oceanFee)||0)+(Number(expense.storageFee)||0) : 0;
      return '<div class="batch-card" style="cursor:default;padding:12px">' + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' + '<div><div style="font-weight:700;font-size:15px;font-family:monospace">' + esc(b.batchNo) + '</div>' + '<div style="font-size:12px;color:var(--text-secondary)">提货日期: ' + esc(b.date||'') + ' | 提货数: ' + batchPickups.length + '</div></div>' + '<div style="text-align:right">' + (expense ? '<div style="font-size:14px;font-weight:700;color:#6366f1">¥' + total.toFixed(2) + '</div>' : '<div style="font-size:12px;color:var(--text-secondary)">未录入费用</div>') + '<button class="btn btn-xs btn-danger" onclick="deletePickupBatch(\'' + esc(b.batchNo) + '\')" style="font-size:10px;padding:2px 8px;margin-top:4px">删除</button></div>' + '</div>' + '<div style="font-size:12px;color:var(--text-secondary)">提货号: ' + (b.pickupNos||[]).join(', ') + '</div>' + '</div>';
    }).join('');
  }
  if (pickups.length > 0) {
    html += '<h4 style="margin:16px 0 8px;color:var(--text)">🚚 提货记录</h4>';
    html += pickups.slice().reverse().map(function(p) {
      return '<div class="batch-card" style="cursor:default;padding:10px">' + '<div style="display:flex;justify-content:space-between;align-items:center">' + '<div><div style="font-weight:600;font-size:13px;font-family:monospace">' + esc(p.pickupNo) + '</div>' + '<div style="font-size:12px;color:var(--text-secondary)">' + esc(p.batchNo) + ' | ' + esc(p.brand||'') + ' ' + esc(p.productName||'') + '</div></div>' + '<div style="text-align:right"><div style="font-size:14px;font-weight:600">' + p.qty + '件</div>' + '<button class="btn btn-xs btn-danger" onclick="deletePickup(\'' + esc(p.pickupNo) + '\')" style="font-size:10px;padding:2px 8px;margin-top:4px">删除</button></div>' + '</div></div>';
    }).join('');
  }
  if (!pickups.length && !batches.length) { html = '<div class="empty-state"><div class="icon">🚚</div><p>暂无提货记录</p></div>'; }
  document.getElementById('shipList').innerHTML = html;
}

// ===== 新增提货 =====
function openPickupModal() {
  document.getElementById('pickupBatchSearch').value = ''; document.getElementById('pickupBatchNo').value = '';
  document.getElementById('pickupQty').value = ''; document.getElementById('pickupNo').value = '';
  document.getElementById('selectedBatchInfo').style.display = 'none';
  document.getElementById('batchSearchResults').style.display = 'none';
  document.getElementById('pickupModal').style.display = '';
}
function closePickupModal() { document.getElementById('pickupModal').style.display = 'none'; }
function searchBatch(keyword) {
  var results = document.getElementById('batchSearchResults');
  if (!keyword.trim()) { results.style.display = 'none'; return; }
  var kw = keyword.toLowerCase();
  var matched = procData.records.filter(function(p) { return (p.batchNo||'').toLowerCase().indexOf(kw) >= 0 || (p.brand||'').toLowerCase().indexOf(kw) >= 0 || (p.productName||'').toLowerCase().indexOf(kw) >= 0; });
  if (matched.length === 0) { results.style.display = 'none'; return; }
  results.style.display = 'block';
  results.innerHTML = matched.map(function(p) { return '<div style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border)" onclick="selectBatch(\'' + esc(p.batchNo) + '\')">' + '<div style="font-weight:600;font-size:13px">' + esc(p.batchNo) + '</div>' + '<div style="font-size:12px;color:var(--text-secondary)">' + esc(p.brand||'') + ' | ' + esc(p.productName||'') + '</div></div>'; }).join('');
}
function selectBatch(batchNo) {
  var p = procData.records.find(function(x) { return x.batchNo === batchNo; });
  if (!p) return;
  document.getElementById('pickupBatchNo').value = batchNo;
  document.getElementById('pickupBatchSearch').value = batchNo;
  document.getElementById('batchSearchResults').style.display = 'none';
  document.getElementById('selectedBatchInfo').style.display = 'block';
  document.getElementById('selectedBatchInfo').innerHTML = '<strong>批次号:</strong> ' + esc(p.batchNo) + '<br>' + '<strong>品牌:</strong> ' + esc(p.brand||'') + ' | <strong>品名:</strong> ' + esc(p.productName||'');
  updatePickupNo();
}
function updatePickupNo() {
  var batchNo = document.getElementById('pickupBatchNo').value;
  var qty = document.getElementById('pickupQty').value;
  if (batchNo && qty) { document.getElementById('pickupNo').value = batchNo + '-' + qty; }
  else { document.getElementById('pickupNo').value = ''; }
}
function savePickup(e) {
  e.preventDefault();
  var batchNo = document.getElementById('pickupBatchNo').value;
  var qty = parseInt(document.getElementById('pickupQty').value);
  if (!batchNo) { toast('请选择批次号', 'error'); return; }
  if (!qty || qty <= 0) { toast('请填写提货数量', 'error'); return; }
  var pickupNo = batchNo + '-' + qty;
  if (!data.pickups) data.pickups = [];
  if (data.pickups.find(function(p) { return p.pickupNo === pickupNo; })) { toast('该提货号已存在', 'error'); return; }
  var proc = procData.records.find(function(p) { return p.batchNo === batchNo; });
  data.pickups.push({ pickupNo: pickupNo, batchNo: batchNo, brand: proc ? proc.brand : '', productName: proc ? proc.productName : '', qty: qty, created_at: nowStr() });
  saveData(); closePickupModal(); render(); toast('提货记录已添加', 'success');
}
function deletePickup(pickupNo) {
  if (!confirm('确定删除该提货记录？')) return;
  data.pickups = data.pickups.filter(function(p) { return p.pickupNo !== pickupNo; });
  saveData(); toast('已删除', 'info'); render();
}

// ===== 新增提货批次 =====
function openPickupBatchModal() {
  document.getElementById('pickupBatchDate').value = new Date().toISOString().slice(0, 10);
  document.getElementById('pickupNoSearch').value = ''; document.getElementById('pickupBatchNo').value = '';
  document.getElementById('pickupNoSearchResults').style.display = 'none';
  selectedPickupNos = []; renderSelectedPickups();
  document.getElementById('pickupBatchModal').style.display = '';
}
function closePickupBatchModal() { document.getElementById('pickupBatchModal').style.display = 'none'; }
function searchPickupNo(keyword) {
  var results = document.getElementById('pickupNoSearchResults');
  if (!keyword.trim()) { results.style.display = 'none'; return; }
  var kw = keyword.toLowerCase();
  var matched = (data.pickups || []).filter(function(p) { return selectedPickupNos.indexOf(p.pickupNo) < 0 && (p.pickupNo||'').toLowerCase().indexOf(kw) >= 0; });
  if (matched.length === 0) { results.style.display = 'none'; return; }
  results.style.display = 'block';
  results.innerHTML = matched.map(function(p) { return '<div style="padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border)" onclick="addPickupToBatch(\'' + esc(p.pickupNo) + '\')">' + '<div style="font-weight:600;font-size:13px">' + esc(p.pickupNo) + '</div>' + '<div style="font-size:12px;color:var(--text-secondary)">' + esc(p.batchNo) + ' | ' + esc(p.brand||'') + ' ' + esc(p.productName||'') + ' | ' + p.qty + '件</div></div>'; }).join('');
}
function addPickupToBatch(pickupNo) {
  if (selectedPickupNos.indexOf(pickupNo) >= 0) return;
  selectedPickupNos.push(pickupNo);
  document.getElementById('pickupNoSearch').value = '';
  document.getElementById('pickupNoSearchResults').style.display = 'none';
  renderSelectedPickups();
}
function removePickupFromBatch(pickupNo) {
  selectedPickupNos = selectedPickupNos.filter(function(n) { return n !== pickupNo; });
  renderSelectedPickups();
}
function renderSelectedPickups() {
  var container = document.getElementById('selectedPickups');
  if (selectedPickupNos.length === 0) { container.innerHTML = '<div style="font-size:13px;color:var(--text-secondary);padding:8px">请搜索并添加提货号</div>'; return; }
  container.innerHTML = selectedPickupNos.map(function(pn) {
    var p = (data.pickups||[]).find(function(x) { return x.pickupNo === pn; });
    if (!p) return '';
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:var(--bg);border-radius:8px;margin-bottom:4px">' + '<div><div style="font-weight:600;font-size:13px;font-family:monospace">' + esc(p.pickupNo) + '</div>' + '<div style="font-size:12px;color:var(--text-secondary)">' + esc(p.batchNo) + ' | ' + esc(p.brand||'') + ' ' + esc(p.productName||'') + ' | ' + p.qty + '件</div></div>' + '<button class="btn btn-xs btn-danger" onclick="removePickupFromBatch(\'' + esc(p.pickupNo) + '\')" style="font-size:10px;padding:2px 8px">移除</button></div>';
  }).join('');
}
function generatePickupBatchNo() {
  var date = document.getElementById('pickupBatchDate').value;
  if (!date) { toast('请先选择提货日期', 'error'); return; }
  var d = date.replace(/-/g, '');
  var existing = (data.pickupBatches||[]).filter(function(b) { return b.batchNo && b.batchNo.indexOf(d) === 0; });
  var seq = String(existing.length + 1).padStart(2, '0');
  document.getElementById('pickupBatchNo').value = d + seq;
}
function savePickupBatch(e) {
  e.preventDefault();
  var date = document.getElementById('pickupBatchDate').value;
  var batchNo = document.getElementById('pickupBatchNo').value;
  if (!date) { toast('请选择提货日期', 'error'); return; }
  if (!batchNo) { toast('请点击生成批次号', 'error'); return; }
  if (selectedPickupNos.length === 0) { toast('请添加至少一个提货号', 'error'); return; }
  if (!data.pickupBatches) data.pickupBatches = [];
  if (data.pickupBatches.find(function(b) { return b.batchNo === batchNo; })) { toast('该批次号已存在', 'error'); return; }
  data.pickupBatches.push({ batchNo: batchNo, date: date, pickupNos: selectedPickupNos.slice(), created_at: nowStr() });
  saveData(); closePickupBatchModal(); render(); toast('提货批次已添加', 'success');
}
function deletePickupBatch(batchNo) {
  if (!confirm('确定删除该提货批次？')) return;
  data.pickupBatches = data.pickupBatches.filter(function(b) { return b.batchNo !== batchNo; });
  data.shipExpenses = (data.shipExpenses||[]).filter(function(e) { return e.batchNo !== batchNo; });
  saveData(); toast('已删除', 'info'); render();
}

// ===== 新增费用 =====
function openShipExpenseModal() {
  var select = document.getElementById('expenseBatchNo');
  select.innerHTML = '<option value="">请选择提货批次号</option>';
  (data.pickupBatches||[]).forEach(function(b) { select.innerHTML += '<option value="' + esc(b.batchNo) + '">' + esc(b.batchNo) + ' (' + esc(b.date) + ')</option>'; });
  document.getElementById('truckFee').value = ''; document.getElementById('miscFee').value = '';
  document.getElementById('oceanFee').value = ''; document.getElementById('storageFee').value = '';
  document.getElementById('shipExpenseModal').style.display = '';
}
function closeShipExpenseModal() { document.getElementById('shipExpenseModal').style.display = 'none'; }
function saveShipExpense(e) {
  e.preventDefault();
  var batchNo = document.getElementById('expenseBatchNo').value;
  if (!batchNo) { toast('请选择提货批次号', 'error'); return; }
  var truckFee = Number(document.getElementById('truckFee').value) || 0;
  var miscFee = Number(document.getElementById('miscFee').value) || 0;
  var oceanFee = Number(document.getElementById('oceanFee').value) || 0;
  var storageFee = Number(document.getElementById('storageFee').value) || 0;
  if (!data.shipExpenses) data.shipExpenses = [];
  var existing = data.shipExpenses.findIndex(function(e) { return e.batchNo === batchNo; });
  var obj = { batchNo: batchNo, truckFee: truckFee, miscFee: miscFee, oceanFee: oceanFee, storageFee: storageFee, updated_at: nowStr() };
  if (existing >= 0) { data.shipExpenses[existing] = Object.assign({}, data.shipExpenses[existing], obj); toast('费用已更新', 'success'); }
  else { obj.id = data.nextId++; obj.created_at = nowStr(); data.shipExpenses.push(obj); toast('费用已添加', 'success'); }
  saveData(); closeShipExpenseModal(); render();
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
  document.getElementById('procStats').innerHTML = '<div class="stat-card"><div class="num" style="color:#8b5cf6">' + list.length + '</div><div class="label">采购记录</div></div>' + '<div class="stat-card"><div class="num" style="color:#8b5cf6">' + totalOrderQty + '</div><div class="label">下单总量</div></div>' + '<div class="stat-card"><div class="num" style="color:#8b5cf6">' + totalOutputQty + '</div><div class="label">产出总量</div></div>';
  if (list.length === 0) { document.getElementById('procList').innerHTML = '<div class="empty-state"><div class="icon">🛒</div><p>暂无采购记录</p></div>'; return; }
  var h = '<div style="overflow-x:auto"><table class="proc-table"><thead><tr>' + '<th>批次号</th><th>下单日期</th><th>品牌</th><th>品名</th>' + '<th class="num-col">下单数量</th><th class="num-col">产出数量</th>' + '<th class="num-col">原料价格</th><th class="num-col">包材价格</th><th class="num-col">工费</th>' + '<th style="width:90px">操作</th></tr></thead><tbody>';
  list.forEach(function(p) {
    h += '<tr>' + '<td><span style="font-size:11px;color:#6b7280;font-family:monospace">' + esc(p.batchNo||'') + '</span></td>' + '<td>' + esc(p.date||'') + '</td>' + '<td><strong>' + esc(p.brand||'') + '</strong></td>' + '<td>' + esc(p.productName||'') + '</td>' + '<td class="num-col">' + (Number(p.orderQty)||0) + '</td>' + '<td class="num-col">' + (Number(p.outputQty)||0) + '</td>' + '<td class="num-col">' + num(p.materialPrice) + '</td>' + '<td class="num-col">' + num(p.packagingPrice) + '</td>' + '<td class="num-col">' + num(p.laborCost) + '</td>' + '<td><button class="btn btn-xs btn-outline" onclick="event.stopPropagation();openProcEdit(' + p.id + ')" style="font-size:11px;padding:2px 8px">✏️</button> <button class="btn btn-xs btn-danger" onclick="event.stopPropagation();deleteProcurement(' + p.id + ')" style="font-size:11px;padding:2px 8px">🗑️</button></td></tr>';
  });
  h += '</tbody></table></div>';
  document.getElementById('procList').innerHTML = h;
}

function openProcAdd() {
  document.getElementById('procEditId').value = ''; document.getElementById('procDate').value = new Date().toISOString().slice(0, 10);
  document.getElementById('procBrand').value = ''; document.getElementById('procProductName').value = '';
  document.getElementById('procOrderQty').value = ''; document.getElementById('procOutputQty').value = '';
  document.getElementById('procMaterialPrice').value = ''; document.getElementById('procPackagingPrice').value = '';
  document.getElementById('procLaborCost').value = '';
  document.getElementById('procModal').style.display = '';
}
function openProcEdit(id) {
  var p = procData.records.find(function(x) { return x.id === id; });
  if (!p) return;
  document.getElementById('procEditId').value = p.id; document.getElementById('procDate').value = p.date || '';
  document.getElementById('procBrand').value = p.brand || ''; document.getElementById('procProductName').value = p.productName || '';
  document.getElementById('procOrderQty').value = p.orderQty || ''; document.getElementById('procOutputQty').value = p.outputQty || '';
  document.getElementById('procMaterialPrice').value = p.materialPrice || ''; document.getElementById('procPackagingPrice').value = p.packagingPrice || '';
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
  var obj = { batchNo: genBatchNo(date, brand, productName), date: date, brand: brand, productName: productName, orderQty: document.getElementById('procOrderQty').value.trim() || '0', outputQty: document.getElementById('procOutputQty').value.trim() || '0', materialPrice: document.getElementById('procMaterialPrice').value.trim() || '0', packagingPrice: document.getElementById('procPackagingPrice').value.trim() || '0', laborCost: document.getElementById('procLaborCost').value.trim() || '0', updated_at: nowStr() };
  if (editId) { var idx = procData.records.findIndex(function(p) { return p.id === parseInt(editId); }); if (idx === -1) return; procData.records[idx] = Object.assign({}, procData.records[idx], obj); toast('已更新', 'success'); }
  else { obj.id = procData.nextId++; obj.created_at = nowStr(); procData.records.unshift(obj); toast('添加成功', 'success'); }
  saveProcData(); closeProcModal(); render();
}
function deleteProcurement(id) {
  if (!confirm('确定删除？')) return;
  procData.records = procData.records.filter(function(p) { return p.id !== id; });
  saveProcData(); toast('已删除', 'info'); render();
}

function exportProcCSV() {
  if (procData.records.length === 0) { toast('没有数据可导出', 'error'); return; }
  var data = procData.records.map(function(p) { return { '批次号': p.batchNo || '', '下单日期': p.date || '', '品牌': p.brand || '', '品名': p.productName || '', '下单数量': Number(p.orderQty) || 0, '产出数量': Number(p.outputQty) || 0, '原料价格': Number(p.materialPrice) || 0, '包材价格': Number(p.packagingPrice) || 0, '工费': Number(p.laborCost) || 0, '录入时间': p.created_at || '' }; });
  var ws = XLSX.utils.json_to_sheet(data); var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '采购记录');
  XLSX.writeFile(wb, '采购记录_' + new Date().toISOString().slice(0,10) + '.xlsx');
  toast('导出成功 ' + procData.records.length + ' 条', 'success');
}

// ===== 云端同步 =====
var GIST_ID = 'cost-app-data-sync';
var gistToken = localStorage.getItem('cost_gist_token') || '';
var gistId = localStorage.getItem('cost_gist_id') || '';

function renderCloudSync() {
  var html = '<div style="display:grid;gap:12px">';
  if (gistToken) {
    html += '<div style="padding:8px;background:#d1fae5;border-radius:8px;font-size:13px;color:#065f46">✅ 已配置 Token</div>';
    html += '<button class="btn btn-sm btn-primary" onclick="syncToCloud()" style="width:100%;background:#10b981">⬆️ 上传到云端</button>';
    html += '<button class="btn btn-sm btn-primary" onclick="syncFromCloud()" style="width:100%;background:#6366f1">⬇️ 从云端下载</button>';
    html += '<button class="btn btn-sm btn-outline" onclick="clearToken()" style="width:100%">🔓 清除 Token</button>';
  } else {
    html += '<div style="font-size:13px;color:var(--text-secondary)">配置 GitHub Token 后可多浏览器同步数据</div>';
    html += '<div class="form-group"><label>GitHub Personal Access Token</label><input type="password" class="form-control" id="gistTokenInput" placeholder="ghp_xxxx..."></div>';
    html += '<button class="btn btn-sm btn-primary" onclick="saveToken()" style="width:100%;background:#10b981">💾 保存 Token</button>';
    html += '<div style="font-size:11px;color:var(--text-secondary)">Token 需要 gist 权限，<a href="https://github.com/settings/tokens/new?scopes=gist&description=cost-app-sync" target="_blank" style="color:#6366f1">点击创建</a></div>';
  }
  html += '</div>';
  document.getElementById('cloudSync').innerHTML = html;
}

function saveToken() {
  var token = document.getElementById('gistTokenInput').value.trim();
  if (!token) { toast('请输入 Token', 'error'); return; }
  gistToken = token; localStorage.setItem('cost_gist_token', token);
  toast('Token 已保存', 'success'); renderCloudSync();
}
function clearToken() {
  if (!confirm('确定清除 Token？')) return;
  gistToken = ''; gistId = '';
  localStorage.removeItem('cost_gist_token'); localStorage.removeItem('cost_gist_id');
  toast('Token 已清除', 'info'); renderCloudSync();
}

function getAllData() {
  return { procurement: procData, shipping: { pickups: data.pickups || [], pickupBatches: data.pickupBatches || [], shipExpenses: data.shipExpenses || [] }, syncTime: nowStr() };
}

function syncToCloud() {
  if (!gistToken) { toast('请先配置 Token', 'error'); return; }
  var allData = getAllData();
  var body = { description: 'Cost App Data Sync', files: { 'cost-app-data.json': { content: JSON.stringify(allData, null, 2) } } };
  if (gistId) { body.gist_id = gistId; }
  var url = gistId ? 'https://api.github.com/gists/' + gistId : 'https://api.github.com/gists';
  var method = gistId ? 'PATCH' : 'POST';
  toast('正在上传...', 'info');
  fetch(url, { method: method, headers: { 'Authorization': 'token ' + gistToken, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  .then(function(res) { if (!res.ok) throw new Error('Upload failed'); return res.json(); })
  .then(function(result) { if (!gistId) { gistId = result.id; localStorage.setItem('cost_gist_id', gistId); } toast('上传成功！', 'success'); })
  .catch(function(err) { toast('上传失败：' + err.message, 'error'); });
}

function syncFromCloud() {
  if (!gistToken) { toast('请先配置 Token', 'error'); return; }
  if (!gistId) { toast('请先上传数据到云端', 'error'); return; }
  toast('正在下载...', 'info');
  fetch('https://api.github.com/gists/' + gistId, { headers: { 'Authorization': 'token ' + gistToken } })
  .then(function(res) { if (!res.ok) throw new Error('Download failed'); return res.json(); })
  .then(function(result) {
    var content = result.files['cost-app-data.json'].content;
    var imported = JSON.parse(content);
    if (imported.shipping) {
      if (imported.shipping.pickups) data.pickups = imported.shipping.pickups;
      if (imported.shipping.pickupBatches) data.pickupBatches = imported.shipping.pickupBatches;
      if (imported.shipping.shipExpenses) data.shipExpenses = imported.shipping.shipExpenses;
      saveData();
    }
    if (imported.procurement) { procData = imported.procurement; saveProcData(); }
    toast('下载成功！', 'success'); render();
  })
  .catch(function(err) { toast('下载失败：' + err.message, 'error'); });
}

// ===== 管理端 =====
function renderManagement() {
  var totalProcRecords = procData.records.length;
  var totalPickups = (data.pickups || []).length;
  var totalPickupBatches = (data.pickupBatches || []).length;
  var totalShipCost = (data.shipExpenses || []).reduce(function(s, x) { return s + (Number(x.truckFee)||0) + (Number(x.miscFee)||0) + (Number(x.oceanFee)||0) + (Number(x.storageFee)||0); }, 0);
  document.getElementById('mgmtStats').innerHTML = '<div class="stat-card"><div class="num" style="color:#8b5cf6">' + totalProcRecords + '</div><div class="label">采购记录</div></div>' + '<div class="stat-card"><div class="num" style="color:#f59e0b">' + totalPickups + '</div><div class="label">提货记录</div></div>' + '<div class="stat-card"><div class="num" style="color:#10b981">' + totalPickupBatches + '</div><div class="label">提货批次</div></div>';
  renderCloudSync();
  document.getElementById('dataStats').innerHTML = '<div style="display:grid;gap:12px">' + '<div style="display:flex;justify-content:space-between;padding:8px;background:var(--bg);border-radius:8px"><span>运输总成本</span><strong style="color:#6366f1">¥' + totalShipCost.toFixed(2) + '</strong></div>' + '</div>';
  document.getElementById('sysSettings').innerHTML = '<div style="display:grid;gap:8px">' + '<button class="btn btn-sm btn-outline" onclick="exportAllData()" style="width:100%">📤 导出所有数据</button>' + '<button class="btn btn-sm btn-outline" onclick="importData()" style="width:100%">📥 导入数据</button>' + '<button class="btn btn-sm btn-danger" onclick="clearAllData()" style="width:100%">🗑️ 清空所有数据</button>' + '<div style="font-size:11px;color:var(--text-secondary);text-align:center;margin-top:8px">批次成本管理 v2.2</div>' + '</div>';
}

function exportAllData() {
  var allData = { procurement: procData, shipping: { pickups: data.pickups || [], pickupBatches: data.pickupBatches || [], shipExpenses: data.shipExpenses || [] }, exportTime: nowStr() };
  var blob = new Blob([JSON.stringify(allData, null, 2)], {type:'application/json'});
  var url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = '成本管理备份_' + new Date().toISOString().slice(0,10) + '.json'; a.click(); URL.revokeObjectURL(url);
  toast('导出成功', 'success');
}

function importData() {
  var input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
  input.onchange = function(e) {
    var file = e.target.files[0]; if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      try {
        var imported = JSON.parse(ev.target.result);
        if (imported.shipping) {
          if (imported.shipping.pickups) data.pickups = imported.shipping.pickups;
          if (imported.shipping.pickupBatches) data.pickupBatches = imported.shipping.pickupBatches;
          if (imported.shipping.shipExpenses) data.shipExpenses = imported.shipping.shipExpenses;
          saveData();
        }
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
  data = { batches: [], nextId: 1, pickups: [], pickupBatches: [], shipExpenses: [] };
  procData = { records: [], nextId: 1 };
  saveData(); saveProcData();
  toast('已清空所有数据', 'info'); render();
}

// ===== 初始化 =====
loadData();
loadProcData();
render();

// 云端同步配置（公开 Gist，所有人可读取）
var CLOUD_GIST_ID = 'bd97d0d8d75b9ab77ccd7f1e6262c699';

// 页面加载后自动从云端同步（以云端为准）
fetch('https://api.github.com/gists/' + CLOUD_GIST_ID).then(function(res) {
  if (!res.ok) throw new Error('sync failed');
  return res.json();
}).then(function(result) {
  var content = result.files['cost-app-data.json'].content;
  var imported = JSON.parse(content);
  if (imported.shipping) {
    if (imported.shipping.pickups) data.pickups = imported.shipping.pickups;
    if (imported.shipping.pickupBatches) data.pickupBatches = imported.shipping.pickupBatches;
    if (imported.shipping.shipExpenses) data.shipExpenses = imported.shipping.shipExpenses;
    saveData();
  }
  if (imported.procurement) { procData = imported.procurement; saveProcData(); }
  render();
}).catch(function() {
  // sync failed silently, use local data
});


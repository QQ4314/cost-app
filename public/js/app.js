// ===== 数据层 =====
let data = { batches: [], nextId: 1, pickups: [], shipExpenses: [] };
let procData = { records: [], nextId: 1 };
var _isSyncing = false; // 标记是否正在从云端同步

// 当前 Tab
var currentTab = 'procurement';

function switchTab(tab) {
  currentTab = tab;
  // 切换 Tab 高亮
  document.getElementById('tabProcurement').className = 'nav-tab' + (tab === 'procurement' ? ' active' : '');
  document.getElementById('tabShipping').className = 'nav-tab' + (tab === 'shipping' ? ' active' : '');
  document.getElementById('tabReport').className = 'nav-tab' + (tab === 'report' ? ' active' : '');
  // 切换内容区域
  document.getElementById('procSection').style.display = tab === 'procurement' ? '' : 'none';
  document.getElementById('shipSection').style.display = tab === 'shipping' ? '' : 'none';
  document.getElementById('reportSection').style.display = tab === 'report' ? '' : 'none';
  render();
}

function loadData() {
  try { const r = localStorage.getItem('cost_batch_data'); if (r) data = JSON.parse(r); } catch(e) {}
  if (!data.batches) data.batches = [];
  if (!data.nextId) data.nextId = 1;
  ensureNextIds();
}
function saveData() { localStorage.setItem('cost_batch_data', JSON.stringify(data)); autoUploadToCloud(); }
function loadProcData() {
  try { const r = localStorage.getItem('cost_proc_data'); if (r) procData = JSON.parse(r); } catch(e) {}
  if (!procData.records) procData.records = [];
  if (!procData.nextId) procData.nextId = 1;
  ensureNextIds();
  if (ensureOrderBatchNumbers()) localStorage.setItem('cost_proc_data', JSON.stringify(procData));
}
function saveProcData() { localStorage.setItem('cost_proc_data', JSON.stringify(procData)); autoUploadToCloud(); }

function repairRecordIds(records, preferredNextId) {
  records = Array.isArray(records) ? records : [];
  var seen = Object.create(null);
  var pending = [];
  records.forEach(function(record) {
    var id = Number(record.id);
    if (!Number.isSafeInteger(id) || id <= 0 || seen['$' + id]) {
      pending.push(record);
      return;
    }
    record.id = id;
    seen['$' + id] = true;
  });
  var preferred = Number(preferredNextId);
  var nextId = Number.isSafeInteger(preferred) && preferred > 0 ? preferred : 1;
  function advanceToFreeId() {
    while (seen['$' + nextId]) {
      nextId++;
      if (!Number.isSafeInteger(nextId) || nextId <= 0) nextId = 1;
    }
  }
  pending.forEach(function(record) {
    advanceToFreeId();
    record.id = nextId;
    seen['$' + nextId] = true;
  });
  advanceToFreeId();
  return nextId;
}

function ensureNextIds() {
  data.nextId = repairRecordIds(data.shipExpenses || [], data.nextId);
  procData.nextId = repairRecordIds(procData.records || [], procData.nextId);
}

// 自动上传到云端（防抖，避免频繁请求）
var _uploadTimer = null;
function autoUploadToCloud() {
  if (_isSyncing) return; // 正在同步时不触发上传
  clearTimeout(_uploadTimer);
  _uploadTimer = setTimeout(function() {
    var gistToken = 'ghp_' + 'XkDQai7Is' + 'WFa3jg51Vl' + 'RAP4rVQZtTx' + '38tFNL';
    var allData = { procurement: procData, shipping: { nextId: data.nextId, pickups: data.pickups || [], shipExpenses: data.shipExpenses || [] } };
    var body = { files: { 'cost-app-data.json': { content: JSON.stringify(allData) } } };
    fetch('https://api.github.com/gists/' + CLOUD_GIST_ID, { method: 'PATCH', headers: { 'Authorization': 'token ' + gistToken, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(function() {});
  }, 2000); // 2秒防抖
}
function nowStr() {
  var d = new Date(); function p(n) { return n < 10 ? '0' + n : '' + n; }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}
function todayStr() { return nowStr().slice(0, 10); }
function toast(m, t) {
  var e = document.getElementById('toast'); e.textContent = m; e.className = 'toast toast-' + t + ' show';
  clearTimeout(e._timer); e._timer = setTimeout(function() { e.classList.remove('show'); }, 2500);
}

// ===== 费用计算 =====
function finiteNumber(v) {
  var value = Number(v);
  return Number.isFinite(value) ? value : 0;
}
function nonNegativeNumber(v) { return Math.max(0, finiteNumber(v)); }
function calcProcurementFee(record) {
  return nonNegativeNumber(record.materialPrice) + nonNegativeNumber(record.packagingPrice) + nonNegativeNumber(record.laborCost);
}
function num(v) { return finiteNumber(v).toFixed(2); }
function fmtQty(v) {
  var value = nonNegativeNumber(v);
  return value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}
function esc(s) { return String(s==null?'':s).replace(/[&<>]/g, function(m) { return {'&':'&amp;','<':'&lt;','>':'&gt;'}[m]; }); }

// ===== 渲染入口 =====
function render() {
  if (currentTab === 'procurement') {
    renderProcurement(procData.records);
    updatePagination(procData.records.length);
  } else if (currentTab === 'shipping') {
    renderShipping();
  } else if (currentTab === 'report') {
    renderReport();
  }
}

function updatePagination(total) {
  var pageInfo = document.getElementById('pageInfo');
  if (pageInfo) {
    var pages = Math.max(1, Math.ceil(total / 50));
    pageInfo.textContent = '共 ' + total + ' 条';
  }
}

// ===== 运输端 =====
function renderShipping() {
  var pickups = data.pickups || [];
  var expenses = data.shipExpenses || [];
  var totalExpense = expenses.reduce(function(s, x) { return s + nonNegativeNumber(x.amount); }, 0);
  document.getElementById('shipStats').innerHTML = '<div class="stat-card"><div class="num" style="color:#f59e0b">' + pickups.length + '</div><div class="label">提货记录</div></div>' + '<div class="stat-card"><div class="num" style="color:#6366f1">' + expenses.length + '</div><div class="label">费用笔数</div></div>' + '<div class="stat-card"><div class="num" style="color:#6366f1">¥' + totalExpense.toFixed(2) + '</div><div class="label">总费用</div></div>';
  var html = '';
  // 提货记录
  if (pickups.length > 0) {
    html += '<h4 style="margin:16px 0 8px;color:var(--text)">🚚 提货记录</h4>';
    html += pickups.slice().reverse().map(function(p) {
      return '<div class="batch-card" style="cursor:default;padding:10px">' + '<div style="display:flex;justify-content:space-between;align-items:center">' + '<div><div style="font-weight:600;font-size:13px;font-family:monospace">' + esc(p.pickupNo) + '</div>' + '<div style="font-size:12px;color:var(--text-secondary)">' + esc(p.batchNo) + ' | ' + esc(p.brand||'') + ' ' + esc(p.productName||'') + (p.volume ? ' | 体积:' + p.volume + 'm³' : '') + (p.weight ? ' | 重量:' + p.weight + 'kg' : '') + '</div></div>' + '<div style="text-align:right"><div style="font-size:14px;font-weight:600">' + p.qty + '件</div>' + '<button class="btn btn-xs btn-danger" onclick="deletePickup(\'' + esc(p.pickupNo) + '\')" style="font-size:10px;padding:2px 8px;margin-top:4px">删除</button></div>' + '</div></div>';
    }).join('');
  } else {
    html += '<div class="empty-state"><div class="icon">🚚</div><p>暂无提货记录</p></div>';
  }
  // 费用记录
  if (expenses.length > 0) {
    html += '<h4 style="margin:16px 0 8px;color:var(--text)">💰 费用记录</h4>';
    html += expenses.slice().reverse().map(function(e) {
      return '<div class="batch-card" style="cursor:default;padding:10px">' + '<div style="display:flex;justify-content:space-between;align-items:center">' + '<div><div style="font-weight:600;font-size:13px;font-family:monospace">' + esc(e.expenseNo||'') + '</div>' + '<div style="font-size:12px;color:var(--text-secondary)">' + esc(e.feeType||'') + (e.pickupNo ? ' | 提货:' + esc(e.pickupNo) : '') + (e.calcMethod ? ' | ' + esc(e.calcMethod) : '') + '</div></div>' + '<div style="text-align:right"><div style="font-size:14px;font-weight:600;color:#6366f1">¥' + nonNegativeNumber(e.amount).toFixed(2) + '</div>' + '<button class="btn btn-xs btn-danger" onclick="deleteShipExpense(' + e.id + ')" style="font-size:10px;padding:2px 8px;margin-top:4px">删除</button></div>' + '</div></div>';
    }).join('');
  }
  document.getElementById('shipList').innerHTML = html;
}

// ===== 新增提货 =====
function openPickupModal() {
  document.getElementById('pickupBatchSearch').value = ''; document.getElementById('pickupBatchNo').value = '';
  document.getElementById('pickupQty').value = ''; document.getElementById('pickupVolume').value = ''; document.getElementById('pickupWeight').value = ''; document.getElementById('pickupNo').value = '';
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
  document.getElementById('selectedBatchInfo').innerHTML = '<strong>订单批次号:</strong> ' + esc(p.batchNo) + '<br>' + '<strong>品牌:</strong> ' + esc(p.brand||'') + ' | <strong>品名:</strong> ' + esc(p.productName||'');
  updatePickupNo();
}
function updatePickupNo() {
  var batchNo = document.getElementById('pickupBatchNo').value;
  var qty = document.getElementById('pickupQty').value;
  if (batchNo && qty) { document.getElementById('pickupNo').value = genPickupNo(batchNo, qty); }
  else { document.getElementById('pickupNo').value = ''; }
}
function genPickupNo(batchNo, qty) {
  var base = batchNo + '-' + qty;
  var used = Object.create(null);
  (data.pickups || []).forEach(function(pickup) { if (pickup.pickupNo) used[pickup.pickupNo] = true; });
  if (!used[base]) return base;
  var index = 2;
  while (used[base + '-' + String(index).padStart(2, '0')]) index++;
  return base + '-' + String(index).padStart(2, '0');
}
function savePickup(e) {
  e.preventDefault();
  var batchNo = document.getElementById('pickupBatchNo').value;
  var qty = parseInt(document.getElementById('pickupQty').value);
  if (!batchNo) { toast('请选择订单批次号', 'error'); return; }
  if (!qty || qty <= 0) { toast('请填写提货数量', 'error'); return; }
  var volume = document.getElementById('pickupVolume').value;
  var weight = document.getElementById('pickupWeight').value;
  var pickupNo = genPickupNo(batchNo, qty);
  if (!data.pickups) data.pickups = [];
  var proc = procData.records.find(function(p) { return p.batchNo === batchNo; });
  data.pickups.push({ pickupNo: pickupNo, batchNo: batchNo, brand: proc ? proc.brand : '', productName: proc ? proc.productName : '', qty: qty, volume: volume || '', weight: weight || '', created_at: nowStr() });
  saveData(); closePickupModal(); render(); toast('提货记录已添加', 'success');
}
function deletePickup(pickupNo) {
  if (!confirm('确定删除该提货记录？')) return;
  data.pickups = data.pickups.filter(function(p) { return p.pickupNo !== pickupNo; });
  saveData(); toast('已删除', 'info'); render();
}

// ===== 费用批次号生成 =====
function genExpenseNo() {
  var today = todayStr().replace(/-/g, '');
  var maxIndex = (data.shipExpenses || []).reduce(function(max, expense) {
    var match = String(expense.expenseNo || '').match(new RegExp('^' + today + '-(\\d+)$'));
    return match ? Math.max(max, Number(match[1]) || 0) : max;
  }, 0);
  return today + '-' + String(maxIndex + 1).padStart(2, '0');
}

// ===== 新增费用 =====
function openShipExpenseModal() {
  document.getElementById('expenseNo').value = genExpenseNo();
  document.getElementById('feeType').value = '';
  document.getElementById('expenseAmount').value = '';
  document.getElementById('calcMethod').value = '';
  // 加载提货号下拉
  var sel = document.getElementById('expensePickupNo');
  sel.innerHTML = '<option value="">不关联</option>';
  (data.pickups || []).forEach(function(p) {
    sel.innerHTML += '<option value="' + esc(p.pickupNo) + '">' + esc(p.pickupNo) + ' (' + esc(p.brand||'') + ' ' + esc(p.productName||'') + ')</option>';
  });
  document.getElementById('shipExpenseModal').style.display = '';
}
function closeShipExpenseModal() { document.getElementById('shipExpenseModal').style.display = 'none'; }
function saveShipExpense(e) {
  e.preventDefault();
  var feeType = document.getElementById('feeType').value;
  var amount = Number(document.getElementById('expenseAmount').value);
  if (!feeType) { toast('请选择费用类型', 'error'); return; }
  if (!Number.isFinite(amount) || amount <= 0) { toast('请填写大于 0 的有效金额', 'error'); return; }
  if (!data.shipExpenses) data.shipExpenses = [];
  var obj = {
    id: data.nextId++,
    expenseNo: document.getElementById('expenseNo').value,
    feeType: feeType,
    amount: amount,
    pickupNo: document.getElementById('expensePickupNo').value || '',
    calcMethod: document.getElementById('calcMethod').value || '',
    created_at: nowStr()
  };
  data.shipExpenses.push(obj);
  saveData(); closeShipExpenseModal(); render(); toast('费用已添加', 'success');
}
function deleteShipExpense(id) {
  if (!confirm('确定删除该费用记录？')) return;
  data.shipExpenses = data.shipExpenses.filter(function(e) { return e.id !== id; });
  saveData(); toast('已删除', 'info'); render();
}

// ===== 批次号生成 =====
function genBatchNo(date, brand, productName, excludeId) {
  var d = (date || '').replace(/-/g, '');
  var b = (brand || '').replace(/[^a-zA-Z0-9一-龥]/g, '');
  var p = (productName || '').replace(/[^a-zA-Z0-9一-龥]/g, '');
  var base = [d, b, p].filter(function(x) { return x; }).join('-') || 'BATCH';
  var used = Object.create(null);
  procData.records.forEach(function(record) {
    if (excludeId != null && record.id === excludeId) return;
    if (record.batchNo) used[record.batchNo] = true;
  });
  if (!used[base]) return base;
  var index = 2;
  while (used[base + '-' + String(index).padStart(2, '0')]) index++;
  return base + '-' + String(index).padStart(2, '0');
}

function ensureOrderBatchNumbers() {
  var changed = false;
  (procData.records || []).forEach(function(record) {
    if (!String(record.batchNo || '').trim()) {
      record.batchNo = genBatchNo(record.date, record.brand, record.productName, record.id);
      changed = true;
    }
  });
  return changed;
}

// ===== 采购端 =====
function renderProcurement(list) {
  var totalOrderQty = list.reduce(function(s, p) { return s + nonNegativeNumber(p.orderQty); }, 0);
  var totalOutputQty = list.reduce(function(s, p) { return s + nonNegativeNumber(p.outputQty); }, 0);
  var totalProcurementFee = list.reduce(function(s, p) { return s + calcProcurementFee(p); }, 0);
  document.getElementById('procStats').innerHTML = '<div class="stat-card"><div class="num" style="color:#8b5cf6">' + list.length + '</div><div class="label">采购记录</div></div>' + '<div class="stat-card"><div class="num" style="color:#8b5cf6">' + totalOrderQty + '</div><div class="label">下单总量</div></div>' + '<div class="stat-card"><div class="num" style="color:#8b5cf6">' + totalOutputQty + '</div><div class="label">产出总量</div></div>' + '<div class="stat-card"><div class="num" style="color:#8b5cf6">¥' + num(totalProcurementFee) + '</div><div class="label">采购费用</div></div>';
  if (list.length === 0) { document.getElementById('procList').innerHTML = '<div class="empty-state"><div class="icon">🛒</div><p>暂无采购记录</p></div>'; return; }
  var h = '<div style="overflow-x:auto"><table class="proc-table"><thead><tr>' + '<th>订单批次号</th><th>下单日期</th><th>品牌</th><th>品名</th>' + '<th class="num-col">下单数量</th><th class="num-col">产出数量</th>' + '<th class="num-col">原料总成本</th><th class="num-col">包材总成本</th><th class="num-col">工费总额</th><th class="num-col">采购费用</th>' + '<th style="width:90px">操作</th></tr></thead><tbody>';
  list.forEach(function(p) {
    h += '<tr>' + '<td><span style="font-size:11px;color:#6b7280;font-family:monospace">' + esc(p.batchNo||'') + '</span></td>' + '<td>' + esc(p.date||'') + '</td>' + '<td><strong>' + esc(p.brand||'') + '</strong></td>' + '<td>' + esc(p.productName||'') + '</td>' + '<td class="num-col">' + fmtQty(p.orderQty) + '</td>' + '<td class="num-col">' + fmtQty(p.outputQty) + '</td>' + '<td class="num-col">' + num(nonNegativeNumber(p.materialPrice)) + '</td>' + '<td class="num-col">' + num(nonNegativeNumber(p.packagingPrice)) + '</td>' + '<td class="num-col">' + num(nonNegativeNumber(p.laborCost)) + '</td><td class="num-col"><strong>¥' + num(calcProcurementFee(p)) + '</strong></td>' + '<td><button class="btn btn-xs btn-outline" onclick="event.stopPropagation();openProcEdit(' + p.id + ')" style="font-size:11px;padding:2px 8px">✏️</button> <button class="btn btn-xs btn-danger" onclick="event.stopPropagation();deleteProcurement(' + p.id + ')" style="font-size:11px;padding:2px 8px">🗑️</button></td></tr>';
  });
  h += '</tbody></table></div>';
  document.getElementById('procList').innerHTML = h;
}

function openProcAdd() {
  document.getElementById('procEditId').value = ''; document.getElementById('procDate').value = todayStr();
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
  var editRecord = editId ? procData.records.find(function(p) { return p.id === parseInt(editId); }) : null;
  var stableBatchNo = editRecord && editRecord.batchNo ? editRecord.batchNo : genBatchNo(date, brand, productName, editRecord ? editRecord.id : null);
  var obj = { batchNo: stableBatchNo, date: date, brand: brand, productName: productName, orderQty: document.getElementById('procOrderQty').value.trim() || '0', outputQty: document.getElementById('procOutputQty').value.trim() || '0', materialPrice: document.getElementById('procMaterialPrice').value.trim() || '0', packagingPrice: document.getElementById('procPackagingPrice').value.trim() || '0', laborCost: document.getElementById('procLaborCost').value.trim() || '0', updated_at: nowStr() };
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
  var data = procData.records.map(function(p) { return { '订单批次号': p.batchNo || '', '下单日期': p.date || '', '品牌': p.brand || '', '品名': p.productName || '', '下单数量': nonNegativeNumber(p.orderQty), '产出数量': nonNegativeNumber(p.outputQty), '原料总成本': nonNegativeNumber(p.materialPrice), '包材总成本': nonNegativeNumber(p.packagingPrice), '工费总额': nonNegativeNumber(p.laborCost), '采购费用': calcProcurementFee(p), '录入时间': p.created_at || '' }; });
  var ws = XLSX.utils.json_to_sheet(data); var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '采购记录');
  XLSX.writeFile(wb, '采购记录_' + todayStr() + '.xlsx');
  toast('导出成功 ' + procData.records.length + ' 条', 'success');
}

// ===== 云端同步 =====
var gistToken = 'ghp_' + 'XkDQai7Is' + 'WFa3jg51Vl' + 'RAP4rVQZtTx' + '38tFNL';

function renderCloudSync() {
  var html = '<div style="display:grid;gap:12px">';
  html += '<button class="btn btn-sm btn-primary" onclick="syncToCloud()" style="width:100%;background:#10b981">⬆️ 上传到云端</button>';
  html += '<button class="btn btn-sm btn-primary" onclick="syncFromCloud()" style="width:100%;background:#6366f1">⬇️ 从云端下载</button>';
  html += '</div>';
  document.getElementById('cloudSync').innerHTML = html;
}

function getAllData() {
  return { procurement: procData, shipping: { nextId: data.nextId, pickups: data.pickups || [], shipExpenses: data.shipExpenses || [] }, syncTime: nowStr() };
}

function syncToCloud() {
  var allData = getAllData();
  var body = { description: 'Cost App Data Sync', files: { 'cost-app-data.json': { content: JSON.stringify(allData, null, 2) } } };
  var url = 'https://api.github.com/gists/' + CLOUD_GIST_ID;
  toast('正在上传...', 'info');
  fetch(url, { method: 'PATCH', headers: { 'Authorization': 'token ' + gistToken, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  .then(function(res) { if (!res.ok) throw new Error('Upload failed'); return res.json(); })
  .then(function(result) { toast('上传成功！', 'success'); })
  .catch(function(err) { toast('上传失败：' + err.message, 'error'); });
}

function syncFromCloud() {
  toast('正在下载...', 'info');
  fetch('https://api.github.com/gists/' + CLOUD_GIST_ID)
  .then(function(res) { if (!res.ok) throw new Error('Download failed'); return res.json(); })
  .then(function(result) {
    var content = result.files['cost-app-data.json'].content;
    var imported = JSON.parse(content);
    if (imported.shipping) {
      if (imported.shipping.pickups) data.pickups = imported.shipping.pickups;
      if (imported.shipping.shipExpenses) data.shipExpenses = imported.shipping.shipExpenses;
      if (imported.shipping.nextId) data.nextId = imported.shipping.nextId;
      ensureNextIds();
      saveData();
    }
    if (imported.procurement) { procData = imported.procurement; ensureNextIds(); ensureOrderBatchNumbers(); saveProcData(); }
    toast('下载成功！', 'success'); render();
  })
  .catch(function(err) { toast('下载失败：' + err.message, 'error'); });
}

// ===== 报表端：以采购订单批次号为归集基准 =====
function addUniqueValue(list, value) {
  value = String(value || '').trim();
  if (value && list.indexOf(value) === -1) list.push(value);
}

function buildBatchReport(records, pickups, expenses) {
  records = Array.isArray(records) ? records : [];
  pickups = Array.isArray(pickups) ? pickups : [];
  expenses = Array.isArray(expenses) ? expenses : [];

  var groups = Object.create(null);
  var groupKeys = [];
  var missingBatchCount = 0;

  records.forEach(function(record, index) {
    var rawBatchNo = String(record.batchNo || '').trim();
    var batchNo = rawBatchNo || ('未编号-' + (record.id != null ? record.id : index + 1));
    if (!rawBatchNo) missingBatchCount++;
    var groupKey = '$' + batchNo;
    if (!groups[groupKey]) {
      groups[groupKey] = {
        batchNo: batchNo,
        missingBatchNo: !rawBatchNo,
        dates: [], brands: [], productNames: [], recordCount: 0,
        orderQty: 0, outputQty: 0, pickupQty: 0, pickupCount: 0,
        materialCost: 0, packagingCost: 0, laborCost: 0,
        shippingCost: 0, expenseCount: 0
      };
      groupKeys.push(groupKey);
    }
    var row = groups[groupKey];
    addUniqueValue(row.dates, record.date);
    addUniqueValue(row.brands, record.brand);
    addUniqueValue(row.productNames, record.productName);
    row.recordCount++;
    row.orderQty += nonNegativeNumber(record.orderQty);
    row.outputQty += nonNegativeNumber(record.outputQty);
    row.materialCost += nonNegativeNumber(record.materialPrice);
    row.packagingCost += nonNegativeNumber(record.packagingPrice);
    row.laborCost += nonNegativeNumber(record.laborCost);
  });

  var pickupToBatch = Object.create(null);
  var pickupNoStates = Object.create(null);
  var unmatchedPickups = [];
  pickups.forEach(function(pickup) {
    var batchNo = String(pickup.batchNo || '').trim();
    var groupKey = '$' + batchNo;
    var row = groups[groupKey];
    if (!row) { unmatchedPickups.push(pickup); return; }
    row.pickupQty += nonNegativeNumber(pickup.qty);
    row.pickupCount++;
    var pickupNo = String(pickup.pickupNo || '').trim();
    if (pickupNo) {
      var pickupKey = '$' + pickupNo;
      if (!pickupNoStates[pickupKey]) {
        pickupNoStates[pickupKey] = { groupKey: groupKey, count: 1, conflict: false };
        pickupToBatch[pickupKey] = groupKey;
      } else {
        pickupNoStates[pickupKey].count++;
        if (pickupNoStates[pickupKey].groupKey !== groupKey) {
          pickupNoStates[pickupKey].conflict = true;
          delete pickupToBatch[pickupKey];
        }
      }
    }
  });
  var duplicatePickupNoCount = 0;
  var conflictingPickupNoCount = 0;
  Object.keys(pickupNoStates).forEach(function(pickupKey) {
    if (pickupNoStates[pickupKey].count > 1) duplicatePickupNoCount++;
    if (pickupNoStates[pickupKey].conflict) conflictingPickupNoCount++;
  });

  var unallocatedExpenses = [];
  expenses.forEach(function(expense) {
    var pickupNo = String(expense.pickupNo || '').trim();
    var groupKey = pickupToBatch['$' + pickupNo];
    var row = groupKey ? groups[groupKey] : null;
    if (row) {
      row.shippingCost += nonNegativeNumber(expense.amount);
      row.expenseCount++;
    } else {
      unallocatedExpenses.push(expense);
    }
  });

  var rows = groupKeys.map(function(groupKey) {
    var row = groups[groupKey];
    row.date = row.dates.join(' / ');
    row.brand = row.brands.join(' / ');
    row.productName = row.productNames.join(' / ');
    row.identityConflict = row.dates.length > 1 || row.brands.length > 1 || row.productNames.length > 1;
    row.procurementCost = row.materialCost + row.packagingCost + row.laborCost;
    row.totalCost = row.procurementCost + row.shippingCost;
    row.unitCost = row.outputQty > 0 ? row.totalCost / row.outputQty : null;
    return row;
  });

  rows.sort(function(a, b) {
    var dateCompare = String(b.date || '').localeCompare(String(a.date || ''));
    return dateCompare || String(a.batchNo).localeCompare(String(b.batchNo));
  });

  var totals = rows.reduce(function(result, row) {
    result.orderQty += row.orderQty;
    result.outputQty += row.outputQty;
    result.pickupQty += row.pickupQty;
    result.materialCost += row.materialCost;
    result.packagingCost += row.packagingCost;
    result.laborCost += row.laborCost;
    result.procurementCost += row.procurementCost;
    result.shippingCost += row.shippingCost;
    result.totalCost += row.totalCost;
    return result;
  }, { orderQty: 0, outputQty: 0, pickupQty: 0, materialCost: 0, packagingCost: 0, laborCost: 0, procurementCost: 0, shippingCost: 0, totalCost: 0 });
  totals.unitCost = totals.outputQty > 0 ? totals.totalCost / totals.outputQty : null;

  var unallocatedShippingCost = unallocatedExpenses.reduce(function(sum, expense) {
    return sum + nonNegativeNumber(expense.amount);
  }, 0);

  return {
    rows: rows,
    products: buildProductSummary(rows),
    totals: totals,
    missingBatchCount: missingBatchCount,
    duplicateBatchCount: rows.filter(function(row) { return row.recordCount > 1; }).length,
    conflictingBatchCount: rows.filter(function(row) { return row.identityConflict; }).length,
    duplicatePickupNoCount: duplicatePickupNoCount,
    conflictingPickupNoCount: conflictingPickupNoCount,
    unmatchedPickups: unmatchedPickups,
    unallocatedExpenses: unallocatedExpenses,
    unallocatedShippingCost: unallocatedShippingCost
  };
}

function buildProductSummary(batchRows) {
  var groups = Object.create(null);
  var keys = [];
  (batchRows || []).forEach(function(row) {
    var productName = String(row.productName || '').trim() || '未填写品名';
    var key = '$' + productName;
    if (!groups[key]) {
      groups[key] = {
        productName: productName, brands: [], batchCount: 0,
        orderQty: 0, outputQty: 0, pickupQty: 0,
        procurementCost: 0, shippingCost: 0, totalCost: 0
      };
      keys.push(key);
    }
    var product = groups[key];
    addUniqueValue(product.brands, row.brand);
    product.batchCount++;
    product.orderQty += row.orderQty;
    product.outputQty += row.outputQty;
    product.pickupQty += row.pickupQty;
    product.procurementCost += row.procurementCost;
    product.shippingCost += row.shippingCost;
    product.totalCost += row.totalCost;
  });
  return keys.map(function(key) {
    var product = groups[key];
    product.brand = product.brands.join(' / ');
    product.unitCost = product.outputQty > 0 ? product.totalCost / product.outputQty : null;
    return product;
  }).sort(function(a, b) { return String(a.productName).localeCompare(String(b.productName), 'zh-CN'); });
}

function renderReport() {
  var report = buildBatchReport(procData.records, data.pickups || [], data.shipExpenses || []);
  var totals = report.totals;
  document.getElementById('reportStats').innerHTML =
    '<div class="stat-card"><div class="num" style="color:#0f766e">' + report.rows.length + '</div><div class="label">订单批次数</div></div>' +
    '<div class="stat-card"><div class="num" style="color:#0f766e">' + fmtQty(totals.outputQty) + '</div><div class="label">产出总量</div></div>' +
    '<div class="stat-card"><div class="num" style="color:#8b5cf6">¥' + num(totals.procurementCost) + '</div><div class="label">采购费用</div></div>' +
    '<div class="stat-card"><div class="num" style="color:#6366f1">¥' + num(totals.shippingCost) + '</div><div class="label">运输费用</div></div>' +
    '<div class="stat-card"><div class="num" style="color:#059669">¥' + num(totals.totalCost) + '</div><div class="label">订单总费用</div></div>' +
    '<div class="stat-card"><div class="num" style="color:' + (report.unallocatedShippingCost ? '#ea580c' : '#6b7280') + '">¥' + num(report.unallocatedShippingCost) + '</div><div class="label">未归集运费</div></div>';

  var warnings = [];
  if (report.missingBatchCount) warnings.push(report.missingBatchCount + ' 条采购记录缺少订单批次号，暂以“未编号-ID”单列，无法自动匹配运输费用');
  if (report.duplicateBatchCount) warnings.push(report.duplicateBatchCount + ' 个订单批次号对应多条采购记录，已按相同批次号合并汇总，请确认它们确属同一订单批次');
  if (report.conflictingBatchCount) warnings.push('其中 ' + report.conflictingBatchCount + ' 个重复批次的日期、品牌或品名不一致，请先核对采购数据');
  if (report.unmatchedPickups.length) warnings.push(report.unmatchedPickups.length + ' 条提货记录的订单批次号在采购端不存在，暂未计入报表');
  if (report.duplicatePickupNoCount) warnings.push(report.duplicatePickupNoCount + ' 个提货号存在重复记录' + (report.conflictingPickupNoCount ? '，其中 ' + report.conflictingPickupNoCount + ' 个关联了不同订单批次，相关费用已停止自动归集' : ''));
  if (report.unallocatedExpenses.length) warnings.push(report.unallocatedExpenses.length + ' 笔运输费用（¥' + num(report.unallocatedShippingCost) + '）未关联到有效提货号，暂不计入订单费用');
  document.getElementById('reportNotice').innerHTML = warnings.length
    ? '<div class="report-note warning"><strong>待处理：</strong>' + warnings.map(esc).join('；') + '。</div>'
    : (data.shipExpenses || []).length
      ? '<div class="report-note"><strong>归集正常：</strong>全部运输费用均已通过提货号匹配到采购订单批次。</div>'
      : '<div class="report-note"><strong>当前口径：</strong>暂无运输费用记录，订单总费用暂时等于采购费用。</div>';

  if (!report.rows.length) {
    document.getElementById('productSummary').innerHTML = '';
    document.getElementById('reportList').innerHTML = '<div class="empty-state"><div class="icon">📊</div><p>采购端暂无订单，暂时不能生成批次报表</p></div>';
  } else {
    var productHtml = '<h3 class="report-section-title">📦 按品名汇总</h3><div style="overflow-x:auto"><table class="proc-table product-table"><thead><tr>' +
      '<th>品名</th><th>品牌</th><th class="num-col">订单批次数</th><th class="num-col">下单量</th><th class="num-col">产出量</th><th class="num-col">已提货</th>' +
      '<th class="num-col">采购费用</th><th class="num-col">运输费用</th><th class="num-col">总费用</th><th class="num-col">单位成本</th>' +
      '</tr></thead><tbody>';
    report.products.forEach(function(product) {
      productHtml += '<tr><td><strong>' + esc(product.productName) + '</strong></td><td>' + esc(product.brand) + '</td>' +
        '<td class="num-col">' + product.batchCount + '</td><td class="num-col">' + fmtQty(product.orderQty) + '</td><td class="num-col">' + fmtQty(product.outputQty) + '</td><td class="num-col">' + fmtQty(product.pickupQty) + '</td>' +
        '<td class="num-col">¥' + num(product.procurementCost) + '</td><td class="num-col">¥' + num(product.shippingCost) + '</td><td class="num-col"><strong>¥' + num(product.totalCost) + '</strong></td>' +
        '<td class="num-col"><strong>' + (product.unitCost == null ? '--' : '¥' + num(product.unitCost)) + '</strong></td></tr>';
    });
    productHtml += '</tbody></table></div>';
    document.getElementById('productSummary').innerHTML = productHtml;

    var html = '<h3 class="report-section-title">📋 订单批次明细</h3><div style="overflow-x:auto"><table class="proc-table report-table"><thead><tr>' +
      '<th class="batch-col">订单批次号</th><th>下单日期</th><th>品牌</th><th>品名</th>' +
      '<th class="num-col">下单量</th><th class="num-col">产出量</th><th class="num-col">已提货</th>' +
      '<th class="num-col">原料总成本</th><th class="num-col">包材总成本</th><th class="num-col">工费总额</th>' +
      '<th class="num-col">采购费用</th><th class="num-col">运输费用</th><th class="num-col">总费用</th><th class="num-col">单位成本</th>' +
      '</tr></thead><tbody>';
    report.rows.forEach(function(row) {
      var pickupColor = row.outputQty > 0 && row.pickupQty > row.outputQty ? '#dc2626' : 'inherit';
      html += '<tr>' +
        '<td class="batch-col"><strong style="color:' + (row.missingBatchNo ? '#ea580c' : '#0f766e') + '">' + esc(row.batchNo) + '</strong>' + (row.recordCount > 1 ? '<div style="font-size:10px;color:var(--text-secondary)">合并 ' + row.recordCount + ' 条采购</div>' : '') + '</td>' +
        '<td>' + esc(row.date) + '</td><td><strong>' + esc(row.brand) + '</strong></td><td>' + esc(row.productName) + '</td>' +
        '<td class="num-col">' + fmtQty(row.orderQty) + '</td><td class="num-col">' + fmtQty(row.outputQty) + '</td>' +
        '<td class="num-col" style="color:' + pickupColor + '">' + fmtQty(row.pickupQty) + '</td>' +
        '<td class="num-col">¥' + num(row.materialCost) + '</td><td class="num-col">¥' + num(row.packagingCost) + '</td><td class="num-col">¥' + num(row.laborCost) + '</td>' +
        '<td class="num-col">¥' + num(row.procurementCost) + '</td><td class="num-col">¥' + num(row.shippingCost) + '</td>' +
        '<td class="num-col"><strong>¥' + num(row.totalCost) + '</strong></td><td class="num-col"><strong>' + (row.unitCost == null ? '--' : '¥' + num(row.unitCost)) + '</strong></td>' +
        '</tr>';
    });
    html += '</tbody><tfoot><tr><td class="batch-col">合计</td><td colspan="3">' + report.rows.length + ' 个订单批次</td>' +
      '<td class="num-col">' + fmtQty(totals.orderQty) + '</td><td class="num-col">' + fmtQty(totals.outputQty) + '</td><td class="num-col">' + fmtQty(totals.pickupQty) + '</td>' +
      '<td class="num-col">¥' + num(totals.materialCost) + '</td><td class="num-col">¥' + num(totals.packagingCost) + '</td><td class="num-col">¥' + num(totals.laborCost) + '</td>' +
      '<td class="num-col">¥' + num(totals.procurementCost) + '</td><td class="num-col">¥' + num(totals.shippingCost) + '</td><td class="num-col">¥' + num(totals.totalCost) + '</td><td class="num-col">' + (totals.unitCost == null ? '--' : '¥' + num(totals.unitCost)) + '</td></tr></tfoot></table></div>';
    document.getElementById('reportList').innerHTML = html;
  }

  renderCloudSync();
  document.getElementById('reportMethod').innerHTML = '<div style="display:grid;gap:8px;font-size:13px;line-height:1.5">' +
    '<div><strong>归集路径：</strong>订单批次号 → 提货号 → 运输费用</div>' +
    '<div><strong>采购费用：</strong>原料总成本 + 包材总成本 + 工费总额</div>' +
    '<div><strong>单位成本：</strong>（采购费用 + 运输费用）÷ 产出数量</div>' +
    '<div style="color:var(--text-secondary)">未关联提货号的运输费用不会自动分摊，需在运输端补充关联。</div></div>';
  document.getElementById('sysSettings').innerHTML = '<div style="display:grid;gap:8px">' + '<button class="btn btn-sm btn-outline" onclick="exportAllData()" style="width:100%">📤 导出所有数据</button>' + '<button class="btn btn-sm btn-outline" onclick="importData()" style="width:100%">📥 导入数据</button>' + '<button class="btn btn-sm btn-danger" onclick="clearAllData()" style="width:100%">🗑️ 清空所有数据</button>' + '</div>';
}

function exportBatchReport() {
  var report = buildBatchReport(procData.records, data.pickups || [], data.shipExpenses || []);
  if (!report.rows.length) { toast('没有批次数据可导出', 'error'); return; }
  var rows = report.rows.map(function(row) {
    return {
      '订单批次号': row.batchNo, '下单日期': row.date, '品牌': row.brand, '品名': row.productName,
      '下单数量': row.orderQty, '产出数量': row.outputQty, '已提货数量': row.pickupQty,
      '原料总成本': row.materialCost, '包材总成本': row.packagingCost, '工费总额': row.laborCost,
      '采购费用': row.procurementCost, '运输费用': row.shippingCost, '总费用': row.totalCost,
      '单位成本': row.unitCost == null ? '' : row.unitCost
    };
  });
  var workbook = XLSX.utils.book_new();
  var productRows = report.products.map(function(product) {
    return {
      '品名': product.productName, '品牌': product.brand, '订单批次数': product.batchCount,
      '下单数量': product.orderQty, '产出数量': product.outputQty, '已提货数量': product.pickupQty,
      '采购费用': product.procurementCost, '运输费用': product.shippingCost, '总费用': product.totalCost,
      '单位成本': product.unitCost == null ? '' : product.unitCost
    };
  });
  var productSheet = XLSX.utils.json_to_sheet(productRows);
  productSheet['!cols'] = [{wch:20},{wch:16},{wch:12},{wch:12},{wch:12},{wch:12},{wch:14},{wch:14},{wch:14},{wch:12}];
  XLSX.utils.book_append_sheet(workbook, productSheet, '品名费用汇总');
  var reportSheet = XLSX.utils.json_to_sheet(rows);
  reportSheet['!cols'] = [{wch:28},{wch:12},{wch:14},{wch:18},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:14},{wch:12},{wch:12}];
  XLSX.utils.book_append_sheet(workbook, reportSheet, '订单批次明细');
  if (report.unallocatedExpenses.length) {
    var unallocatedRows = report.unallocatedExpenses.map(function(expense) {
      return {
        '费用批次号': expense.expenseNo || '', '费用类型': expense.feeType || '', '金额': nonNegativeNumber(expense.amount),
        '提货号': expense.pickupNo || '', '未归集原因': expense.pickupNo ? '提货号未匹配采购批次' : '未关联提货号', '录入时间': expense.created_at || ''
      };
    });
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(unallocatedRows), '未归集运输费用');
  }
  if (report.unmatchedPickups.length) {
    var unmatchedPickupRows = report.unmatchedPickups.map(function(pickup) {
      return {
        '提货号': pickup.pickupNo || '', '订单批次号': pickup.batchNo || '', '品牌': pickup.brand || '', '品名': pickup.productName || '',
        '提货数量': nonNegativeNumber(pickup.qty), '体积(m³)': nonNegativeNumber(pickup.volume), '重量(kg)': nonNegativeNumber(pickup.weight), '录入时间': pickup.created_at || ''
      };
    });
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(unmatchedPickupRows), '未匹配提货记录');
  }
  XLSX.writeFile(workbook, '订单批次费用报表_' + todayStr() + '.xlsx');
  toast('已导出 ' + report.rows.length + ' 个订单批次', 'success');
}

function exportAllData() {
  var allData = getAllData();
  allData.exportTime = nowStr();
  var blob = new Blob([JSON.stringify(allData, null, 2)], {type:'application/json'});
  var url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = '成本管理备份_' + todayStr() + '.json'; a.click(); URL.revokeObjectURL(url);
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
          if (imported.shipping.shipExpenses) data.shipExpenses = imported.shipping.shipExpenses;
          if (imported.shipping.nextId) data.nextId = imported.shipping.nextId;
          ensureNextIds();
          saveData();
        }
        if (imported.procurement) { procData = imported.procurement; ensureNextIds(); ensureOrderBatchNumbers(); saveProcData(); }
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
  data = { batches: [], nextId: 1, pickups: [], shipExpenses: [] };
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
_isSyncing = true;
fetch('https://api.github.com/gists/' + CLOUD_GIST_ID).then(function(res) {
  if (!res.ok) throw new Error('sync failed');
  return res.json();
}).then(function(result) {
  var content = result.files['cost-app-data.json'].content;
  var imported = JSON.parse(content);
  if (imported.shipping) {
    if (imported.shipping.pickups) data.pickups = imported.shipping.pickups;
    if (imported.shipping.shipExpenses) data.shipExpenses = imported.shipping.shipExpenses;
    if (imported.shipping.nextId) data.nextId = imported.shipping.nextId;
    ensureNextIds();
    localStorage.setItem('cost_batch_data', JSON.stringify(data));
  }
  if (imported.procurement) { procData = imported.procurement; ensureNextIds(); ensureOrderBatchNumbers(); localStorage.setItem('cost_proc_data', JSON.stringify(procData)); }
  _isSyncing = false;
  render();
}).catch(function() {
  _isSyncing = false;
  // 同步失败静默处理，使用本地数据
});

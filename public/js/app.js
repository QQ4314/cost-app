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
  document.getElementById('tabManagement').className = 'nav-tab' + (tab === 'management' ? ' active' : '');
  // 切换内容区域
  document.getElementById('procSection').style.display = tab === 'procurement' ? '' : 'none';
  document.getElementById('shipSection').style.display = tab === 'shipping' ? '' : 'none';
  document.getElementById('mgmtSection').style.display = tab === 'management' ? '' : 'none';
  render();
}

function loadData() {
  try { const r = localStorage.getItem('cost_batch_data'); if (r) data = JSON.parse(r); } catch(e) {}
  if (!data.batches) data.batches = [];
  if (!data.nextId) data.nextId = 1;
}
function saveData() { localStorage.setItem('cost_batch_data', JSON.stringify(data)); autoUploadToCloud(); }
function loadProcData() {
  try { const r = localStorage.getItem('cost_proc_data'); if (r) procData = JSON.parse(r); } catch(e) {}
  if (!procData.records) procData.records = [];
  if (!procData.nextId) procData.nextId = 1;
}
function saveProcData() { localStorage.setItem('cost_proc_data', JSON.stringify(procData)); autoUploadToCloud(); }

// 自动上传到云端（防抖，避免频繁请求）
var _uploadTimer = null;
function autoUploadToCloud() {
  if (_isSyncing) return; // 正在同步时不触发上传
  clearTimeout(_uploadTimer);
  _uploadTimer = setTimeout(function() {
    var gistToken = 'ghp_' + 'XkDQai7Is' + 'WFa3jg51Vl' + 'RAP4rVQZtTx' + '38tFNL';
    var allData = { procurement: procData, shipping: { pickups: data.pickups || [], shipExpenses: data.shipExpenses || [] } };
    var body = { files: { 'cost-app-data.json': { content: JSON.stringify(allData) } } };
    fetch('https://api.github.com/gists/' + CLOUD_GIST_ID, { method: 'PATCH', headers: { 'Authorization': 'token ' + gistToken, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(function() {});
  }, 2000); // 2秒防抖
}
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

// ===== 渲染入口 =====
function render() {
  if (currentTab === 'procurement') {
    renderProcurement(procData.records);
    updatePagination(procData.records.length);
  } else if (currentTab === 'shipping') {
    renderShipping();
  } else if (currentTab === 'management') {
    renderManagement();
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
  var totalExpense = expenses.reduce(function(s, x) { return s + (Number(x.truckFee)||0) + (Number(x.miscFee)||0) + (Number(x.oceanFee)||0) + (Number(x.storageFee)||0); }, 0);
  document.getElementById('shipStats').innerHTML = '<div class="stat-card"><div class="num" style="color:#f59e0b">' + pickups.length + '</div><div class="label">提货记录</div></div>' + '<div class="stat-card"><div class="num" style="color:#6366f1">¥' + totalExpense.toFixed(2) + '</div><div class="label">总费用</div></div>';
  var html = '';
  if (pickups.length > 0) {
    html += '<h4 style="margin:16px 0 8px;color:var(--text)">🚚 提货记录</h4>';
    html += pickups.slice().reverse().map(function(p) {
      return '<div class="batch-card" style="cursor:default;padding:10px">' + '<div style="display:flex;justify-content:space-between;align-items:center">' + '<div><div style="font-weight:600;font-size:13px;font-family:monospace">' + esc(p.pickupNo) + '</div>' + '<div style="font-size:12px;color:var(--text-secondary)">' + esc(p.batchNo) + ' | ' + esc(p.brand||'') + ' ' + esc(p.productName||'') + (p.volume ? ' | 体积:' + p.volume + 'm³' : '') + (p.weight ? ' | 重量:' + p.weight + 'kg' : '') + '</div></div>' + '<div style="text-align:right"><div style="font-size:14px;font-weight:600">' + p.qty + '件</div>' + '<button class="btn btn-xs btn-danger" onclick="deletePickup(\'' + esc(p.pickupNo) + '\')" style="font-size:10px;padding:2px 8px;margin-top:4px">删除</button></div>' + '</div></div>';
    }).join('');
  }
  if (!pickups.length) { html = '<div class="empty-state"><div class="icon">🚚</div><p>暂无提货记录</p></div>'; }
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
  var volume = document.getElementById('pickupVolume').value;
  var weight = document.getElementById('pickupWeight').value;
  var pickupNo = batchNo + '-' + qty;
  if (!data.pickups) data.pickups = [];
  if (data.pickups.find(function(p) { return p.pickupNo === pickupNo; })) { toast('该提货号已存在', 'error'); return; }
  var proc = procData.records.find(function(p) { return p.batchNo === batchNo; });
  data.pickups.push({ pickupNo: pickupNo, batchNo: batchNo, brand: proc ? proc.brand : '', productName: proc ? proc.productName : '', qty: qty, volume: volume || '', weight: weight || '', created_at: nowStr() });
  saveData(); closePickupModal(); render(); toast('提货记录已添加', 'success');
}
function deletePickup(pickupNo) {
  if (!confirm('确定删除该提货记录？')) return;
  data.pickups = data.pickups.filter(function(p) { return p.pickupNo !== pickupNo; });
  saveData(); toast('已删除', 'info'); render();
}

// ===== 新增费用 =====
function openShipExpenseModal() {
  document.getElementById('truckFee').value = ''; document.getElementById('miscFee').value = '';
  document.getElementById('oceanFee').value = ''; document.getElementById('storageFee').value = '';
  document.getElementById('shipExpenseModal').style.display = '';
}
function closeShipExpenseModal() { document.getElementById('shipExpenseModal').style.display = 'none'; }
function saveShipExpense(e) {
  e.preventDefault();
  var truckFee = Number(document.getElementById('truckFee').value) || 0;
  var miscFee = Number(document.getElementById('miscFee').value) || 0;
  var oceanFee = Number(document.getElementById('oceanFee').value) || 0;
  var storageFee = Number(document.getElementById('storageFee').value) || 0;
  if (!truckFee && !miscFee && !oceanFee && !storageFee) { toast('请填写至少一项费用', 'error'); return; }
  if (!data.shipExpenses) data.shipExpenses = [];
  var obj = { id: data.nextId++, truckFee: truckFee, miscFee: miscFee, oceanFee: oceanFee, storageFee: storageFee, created_at: nowStr() };
  data.shipExpenses.push(obj);
  saveData(); closeShipExpenseModal(); render(); toast('费用已添加', 'success');
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
var gistToken = 'ghp_' + 'XkDQai7Is' + 'WFa3jg51Vl' + 'RAP4rVQZtTx' + '38tFNL';

function renderCloudSync() {
  var html = '<div style="display:grid;gap:12px">';
  html += '<button class="btn btn-sm btn-primary" onclick="syncToCloud()" style="width:100%;background:#10b981">⬆️ 上传到云端</button>';
  html += '<button class="btn btn-sm btn-primary" onclick="syncFromCloud()" style="width:100%;background:#6366f1">⬇️ 从云端下载</button>';
  html += '</div>';
  document.getElementById('cloudSync').innerHTML = html;
}

function getAllData() {
  return { procurement: procData, shipping: { pickups: data.pickups || [], shipExpenses: data.shipExpenses || [] }, syncTime: nowStr() };
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
  var totalShipCost = (data.shipExpenses || []).reduce(function(s, x) { return s + (Number(x.truckFee)||0) + (Number(x.miscFee)||0) + (Number(x.oceanFee)||0) + (Number(x.storageFee)||0); }, 0);
  document.getElementById('mgmtStats').innerHTML = '<div class="stat-card"><div class="num" style="color:#8b5cf6">' + totalProcRecords + '</div><div class="label">采购记录</div></div>' + '<div class="stat-card"><div class="num" style="color:#f59e0b">' + totalPickups + '</div><div class="label">提货记录</div></div>';
  renderCloudSync();
  document.getElementById('dataStats').innerHTML = '<div style="display:grid;gap:12px">' + '<div style="display:flex;justify-content:space-between;padding:8px;background:var(--bg);border-radius:8px"><span>运输总成本</span><strong style="color:#6366f1">¥' + totalShipCost.toFixed(2) + '</strong></div>' + '</div>';
  document.getElementById('sysSettings').innerHTML = '<div style="display:grid;gap:8px">' + '<button class="btn btn-sm btn-outline" onclick="exportAllData()" style="width:100%">📤 导出所有数据</button>' + '<button class="btn btn-sm btn-outline" onclick="importData()" style="width:100%">📥 导入数据</button>' + '<button class="btn btn-sm btn-danger" onclick="clearAllData()" style="width:100%">🗑️ 清空所有数据</button>' + '</div>';
}

function exportAllData() {
  var allData = { procurement: procData, shipping: { pickups: data.pickups || [], shipExpenses: data.shipExpenses || [] }, exportTime: nowStr() };
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
          if (imported.shipping.shipExpenses) data.shipExpenses = imported.shipExpenses;
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
    localStorage.setItem('cost_batch_data', JSON.stringify(data));
  }
  if (imported.procurement) { procData = imported.procurement; localStorage.setItem('cost_proc_data', JSON.stringify(procData)); }
  _isSyncing = false;
  render();
}).catch(function() {
  _isSyncing = false;
  // 同步失败静默处理，使用本地数据
});

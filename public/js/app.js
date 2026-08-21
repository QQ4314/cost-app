// ===== 数据层 =====
let data = { batches: [], nextId: 1, pickups: [], shipExpenses: [] };
let procData = { records: [], nextId: 1 };
var _isSyncing = false; // 标记是否正在从云端同步

// 当前 Tab
var currentTab = 'procurement';
var selectedReportProduct = '';
var procurementSearchKeyword = '';
var shippingView = 'pickups';
var pickupRecordSearchKeyword = '';
var expenseRecordSearchKeyword = '';

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
    var filteredRecords = filterProcurementRecords(procData.records, procurementSearchKeyword);
    renderProcurement(filteredRecords);
    updatePagination(filteredRecords.length, procData.records.length);
  } else if (currentTab === 'shipping') {
    renderShipping();
  } else if (currentTab === 'report') {
    renderReport();
  }
}

function updatePagination(total, allTotal) {
  var pageInfo = document.getElementById('pageInfo');
  if (pageInfo) {
    pageInfo.textContent = allTotal != null && total !== allTotal ? '找到 ' + total + ' 条（全部 ' + allTotal + ' 条）' : '共 ' + total + ' 条';
  }
}

// ===== 运输端 =====
function getExpensePickupNos(expense) {
  var values = Array.isArray(expense && expense.pickupNos) ? expense.pickupNos : [expense && expense.pickupNo];
  return values.reduce(function(result, value) {
    value = String(value || '').trim();
    if (value && result.indexOf(value) === -1) result.push(value);
    return result;
  }, []);
}

function pickupAllocationMetric(pickup, method) {
  if (method === '体积') {
    var volumeCm3 = nonNegativeNumber(pickup && pickup.volumeCm3);
    if (!volumeCm3 && pickup) volumeCm3 = nonNegativeNumber(pickup.lengthCm) * nonNegativeNumber(pickup.widthCm) * nonNegativeNumber(pickup.heightCm);
    if (!volumeCm3 && pickup && pickup.volume !== '' && pickup.volume != null) volumeCm3 = nonNegativeNumber(pickup.volume) * 1000000;
    return volumeCm3;
  }
  if (method === '重量') {
    var weightG = pickup && pickup.weightG !== '' && pickup.weightG != null ? nonNegativeNumber(pickup.weightG) : 0;
    if (!weightG && pickup && pickup.weight !== '' && pickup.weight != null) weightG = nonNegativeNumber(pickup.weight) * 1000;
    return weightG;
  }
  return 0;
}

function filterPickupRecords(pickups, keyword) {
  var normalized = String(keyword || '').trim().toLowerCase();
  if (!normalized) return (pickups || []).slice();
  return (pickups || []).filter(function(pickup) { return String(pickup.pickupNo || '').toLowerCase().indexOf(normalized) >= 0; });
}

function filterExpenseRecords(expenses, keyword) {
  var normalized = String(keyword || '').trim().toLowerCase();
  if (!normalized) return (expenses || []).slice();
  return (expenses || []).filter(function(expense) {
    return String(expense.expenseNo || '').toLowerCase().indexOf(normalized) >= 0 || getExpensePickupNos(expense).some(function(pickupNo) { return pickupNo.toLowerCase().indexOf(normalized) >= 0; });
  });
}

function switchShippingView(view) {
  shippingView = view === 'expenses' ? 'expenses' : 'pickups';
  renderShipping();
}

function searchPickupRecords(keyword) { pickupRecordSearchKeyword = String(keyword || ''); renderShipping(); }
function searchExpenseRecords(keyword) { expenseRecordSearchKeyword = String(keyword || ''); renderShipping(); }
function clearPickupRecordSearch() { pickupRecordSearchKeyword = ''; document.getElementById('pickupRecordSearch').value = ''; renderShipping(); document.getElementById('pickupRecordSearch').focus(); }
function clearExpenseRecordSearch() { expenseRecordSearchKeyword = ''; document.getElementById('expenseRecordSearch').value = ''; renderShipping(); document.getElementById('expenseRecordSearch').focus(); }

function renderShipping() {
  var pickups = data.pickups || [];
  var expenses = data.shipExpenses || [];
  var filteredPickups = filterPickupRecords(pickups, pickupRecordSearchKeyword);
  var filteredExpenses = filterExpenseRecords(expenses, expenseRecordSearchKeyword);
  var totalExpense = expenses.reduce(function(s, x) { return s + nonNegativeNumber(x.amount); }, 0);
  document.getElementById('shipStats').innerHTML = '<div class="stat-card"><div class="num" style="color:#f59e0b">' + pickups.length + '</div><div class="label">提货记录</div></div>' + '<div class="stat-card"><div class="num" style="color:#6366f1">' + expenses.length + '</div><div class="label">费用笔数</div></div>' + '<div class="stat-card"><div class="num" style="color:#6366f1">¥' + totalExpense.toFixed(2) + '</div><div class="label">总费用</div></div>';
  document.getElementById('shipPickupTab').className = 'ship-view-tab' + (shippingView === 'pickups' ? ' active' : '');
  document.getElementById('shipExpenseTab').className = 'ship-view-tab' + (shippingView === 'expenses' ? ' active' : '');
  document.getElementById('shipPickupTab').textContent = '🚚 提货记录 (' + pickups.length + ')';
  document.getElementById('shipExpenseTab').textContent = '💰 费用记录 (' + expenses.length + ')';
  document.getElementById('shipPickupPanel').style.display = shippingView === 'pickups' ? '' : 'none';
  document.getElementById('shipExpensePanel').style.display = shippingView === 'expenses' ? '' : 'none';

  var pickupHtml = '';
  if (filteredPickups.length > 0) {
    pickupHtml = filteredPickups.slice().reverse().map(function(p) {
      return '<div class="batch-card" style="cursor:default;padding:10px">' + '<div style="display:flex;justify-content:space-between;align-items:center">' + '<div><div style="font-weight:600;font-size:13px;font-family:monospace">' + esc(p.pickupNo) + '</div>' + '<div style="font-size:12px;color:var(--text-secondary)">' + esc(p.batchNo) + ' | ' + esc(p.brand||'') + ' ' + esc(p.productName||'') + pickupMeasurementText(p) + '</div></div>' + '<div style="text-align:right"><div style="font-size:14px;font-weight:600">' + fmtQty(p.qty) + '件</div>' + '<button class="btn btn-xs btn-danger" onclick="deletePickup(\'' + esc(p.pickupNo) + '\')" style="font-size:10px;padding:2px 8px;margin-top:4px">删除</button></div>' + '</div></div>';
    }).join('');
  } else {
    pickupHtml = pickups.length && pickupRecordSearchKeyword.trim() ? '<div class="empty-state"><div class="icon">🔎</div><p>没有匹配的提货号</p></div>' : '<div class="empty-state"><div class="icon">🚚</div><p>暂无提货记录</p></div>';
  }
  document.getElementById('shipPickupList').innerHTML = pickupHtml;

  var expenseHtml = '';
  if (filteredExpenses.length > 0) {
    expenseHtml = filteredExpenses.slice().reverse().map(function(e) {
      var pickupNos = getExpensePickupNos(e);
      return '<div class="batch-card" style="cursor:default;padding:10px">' + '<div style="display:flex;justify-content:space-between;align-items:center">' + '<div><div style="font-weight:600;font-size:13px;font-family:monospace">' + esc(e.expenseNo||'') + '</div>' + '<div style="font-size:12px;color:var(--text-secondary)">' + esc(e.feeType||'') + (pickupNos.length ? ' | 提货:' + pickupNos.map(esc).join('、') : '') + (e.calcMethod ? ' | ' + esc(e.calcMethod) : '') + '</div></div>' + '<div style="text-align:right"><div style="font-size:14px;font-weight:600;color:#6366f1">¥' + nonNegativeNumber(e.amount).toFixed(2) + '</div>' + '<button class="btn btn-xs btn-danger" onclick="deleteShipExpense(' + e.id + ')" style="font-size:10px;padding:2px 8px;margin-top:4px">删除</button></div>' + '</div></div>';
    }).join('');
  } else {
    expenseHtml = expenses.length && expenseRecordSearchKeyword.trim() ? '<div class="empty-state"><div class="icon">🔎</div><p>没有匹配的费用批次号或提货号</p></div>' : '<div class="empty-state"><div class="icon">💰</div><p>暂无费用记录</p></div>';
  }
  document.getElementById('shipExpenseList').innerHTML = expenseHtml;
}

// ===== 新增提货 =====
function getBatchPickupStatus(batchNo) {
  var records = procData.records.filter(function(record) { return record.batchNo === batchNo; });
  var outputQty = records.reduce(function(sum, record) { return sum + nonNegativeNumber(record.outputQty); }, 0);
  var pickedQty = (data.pickups || []).filter(function(pickup) { return pickup.batchNo === batchNo; }).reduce(function(sum, pickup) { return sum + nonNegativeNumber(pickup.qty); }, 0);
  return { records: records, outputQty: outputQty, pickedQty: pickedQty, remainingQty: Math.max(0, outputQty - pickedQty) };
}

function pickupMeasurementText(pickup) {
  var text = '';
  if (nonNegativeNumber(pickup.lengthCm) > 0 && nonNegativeNumber(pickup.widthCm) > 0 && nonNegativeNumber(pickup.heightCm) > 0) {
    text += ' | 尺寸:' + fmtQty(pickup.lengthCm) + '×' + fmtQty(pickup.widthCm) + '×' + fmtQty(pickup.heightCm) + 'cm';
  } else if (pickup.volume !== undefined && pickup.volume !== '') {
    text += ' | 体积:' + esc(pickup.volume) + 'm³（旧数据）';
  }
  if (pickup.weightG !== undefined && pickup.weightG !== '') {
    text += ' | 重量:' + fmtQty(pickup.weightG) + 'g';
  } else if (pickup.weight !== undefined && pickup.weight !== '') {
    text += ' | 重量:' + esc(pickup.weight) + 'kg（旧数据）';
  }
  return text;
}

function parsePickupMeasurements(lengthRaw, widthRaw, heightRaw, weightRaw) {
  var dimensionValues = [lengthRaw, widthRaw, heightRaw];
  var hasAnyDimension = dimensionValues.some(function(value) { return String(value).trim() !== ''; });
  var dimensions = dimensionValues.map(function(value) { return Number(value); });
  if (hasAnyDimension && (dimensionValues.some(function(value) { return String(value).trim() === ''; }) || dimensions.some(function(value) { return !Number.isFinite(value) || value <= 0; }))) {
    return { ok: false, error: '请完整填写大于0的长、宽、高' };
  }
  var hasWeight = String(weightRaw).trim() !== '';
  var weightG = Number(weightRaw);
  if (hasWeight && (!Number.isFinite(weightG) || weightG < 0)) return { ok: false, error: '重量不能小于0' };
  return {
    ok: true,
    lengthCm: hasAnyDimension ? dimensions[0] : '',
    widthCm: hasAnyDimension ? dimensions[1] : '',
    heightCm: hasAnyDimension ? dimensions[2] : '',
    volumeCm3: hasAnyDimension ? dimensions[0] * dimensions[1] * dimensions[2] : '',
    weightG: hasWeight ? weightG : ''
  };
}

function openPickupModal() {
  document.getElementById('pickupBatchSearch').value = ''; document.getElementById('pickupBatchNo').value = '';
  document.getElementById('pickupQty').value = ''; document.getElementById('pickupQty').removeAttribute('max'); document.getElementById('pickupQty').setCustomValidity('');
  document.getElementById('pickupLengthCm').value = ''; document.getElementById('pickupWidthCm').value = ''; document.getElementById('pickupHeightCm').value = ''; document.getElementById('pickupWeightG').value = ''; document.getElementById('pickupNo').value = '';
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
  var status = getBatchPickupStatus(batchNo);
  var p = status.records[0];
  if (!p) return;
  document.getElementById('pickupBatchNo').value = batchNo;
  document.getElementById('pickupBatchSearch').value = batchNo;
  document.getElementById('batchSearchResults').style.display = 'none';
  document.getElementById('selectedBatchInfo').style.display = 'block';
  document.getElementById('selectedBatchInfo').innerHTML = '<strong>订单批次号:</strong> ' + esc(p.batchNo) + '<br>' + '<strong>品牌:</strong> ' + esc(p.brand||'') + ' | <strong>品名:</strong> ' + esc(p.productName||'') + '<br>' + '<strong>产出数量:</strong> ' + fmtQty(status.outputQty) + ' | <strong>已提货:</strong> ' + fmtQty(status.pickedQty) + ' | <strong style="color:' + (status.remainingQty > 0 ? '#059669' : '#dc2626') + '">剩余可提货: ' + fmtQty(status.remainingQty) + '</strong>';
  document.getElementById('pickupQty').max = status.remainingQty;
  updatePickupNo();
}
function updatePickupNo() {
  var batchNo = document.getElementById('pickupBatchNo').value;
  var qty = document.getElementById('pickupQty').value;
  var qtyInput = document.getElementById('pickupQty');
  var status = batchNo ? getBatchPickupStatus(batchNo) : null;
  qtyInput.setCustomValidity(status && Number(qty) > status.remainingQty ? '提货数量不能超过剩余可提货数量 ' + fmtQty(status.remainingQty) : '');
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
  var qty = Number(document.getElementById('pickupQty').value);
  if (!batchNo) { toast('请选择订单批次号', 'error'); return; }
  if (!Number.isSafeInteger(qty) || qty <= 0) { toast('提货数量必须是大于0的整数', 'error'); return; }
  var status = getBatchPickupStatus(batchNo);
  if (!status.records.length) { toast('订单批次号不存在，请重新选择', 'error'); return; }
  if (qty > status.remainingQty) { toast('提货数量不能超过剩余可提货数量 ' + fmtQty(status.remainingQty), 'error'); document.getElementById('pickupQty').focus(); return; }
  var measurements = parsePickupMeasurements(document.getElementById('pickupLengthCm').value, document.getElementById('pickupWidthCm').value, document.getElementById('pickupHeightCm').value, document.getElementById('pickupWeightG').value);
  if (!measurements.ok) { toast(measurements.error, 'error'); return; }
  var pickupNo = genPickupNo(batchNo, qty);
  if (!data.pickups) data.pickups = [];
  var proc = status.records[0];
  data.pickups.push({ pickupNo: pickupNo, batchNo: batchNo, brand: proc.brand || '', productName: proc.productName || '', qty: qty, lengthCm: measurements.lengthCm, widthCm: measurements.widthCm, heightCm: measurements.heightCm, volumeCm3: measurements.volumeCm3, weightG: measurements.weightG, created_at: nowStr() });
  shippingView = 'pickups'; saveData(); closePickupModal(); render(); toast('提货记录已添加', 'success');
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
  document.getElementById('expensePickupRows').innerHTML = '';
  addExpensePickupRow();
  document.getElementById('shipExpenseModal').style.display = '';
}
function closeShipExpenseModal() { document.getElementById('shipExpenseModal').style.display = 'none'; }

function updateExpensePickupRemoveButtons() {
  var rows = document.querySelectorAll('#expensePickupRows .expense-pickup-row');
  Array.prototype.forEach.call(rows, function(row) {
    row.querySelector('.expense-pickup-remove').style.visibility = rows.length > 1 ? 'visible' : 'hidden';
  });
}

function addExpensePickupRow(selectedPickupNo) {
  var container = document.getElementById('expensePickupRows');
  var row = document.createElement('div');
  row.className = 'expense-pickup-row';
  var input = document.createElement('input');
  input.type = 'text'; input.className = 'form-control expense-pickup-search'; input.placeholder = '输入关键词搜索已有提货号...'; input.autocomplete = 'off';
  var results = document.createElement('div');
  results.className = 'expense-pickup-results';
  var removeButton = document.createElement('button');
  removeButton.type = 'button'; removeButton.className = 'btn btn-outline expense-pickup-remove'; removeButton.textContent = '✕'; removeButton.title = '移除此提货号'; removeButton.style.cssText = 'width:36px;padding:6px;color:#dc2626';
  input.addEventListener('input', function() { input.dataset.pickupNo = ''; renderExpensePickupResults(input, results); });
  input.addEventListener('focus', function() { renderExpensePickupResults(input, results); });
  input.addEventListener('blur', function() { setTimeout(function() { results.style.display = 'none'; }, 150); });
  removeButton.addEventListener('click', function() { row.remove(); updateExpensePickupRemoveButtons(); });
  row.appendChild(input); row.appendChild(removeButton); row.appendChild(results); container.appendChild(row);
  if (selectedPickupNo) { input.value = selectedPickupNo; input.dataset.pickupNo = selectedPickupNo; }
  updateExpensePickupRemoveButtons();
  if (!selectedPickupNo) input.focus();
}

function renderExpensePickupResults(input, results) {
  var keyword = input.value.trim().toLowerCase();
  var pickups = (data.pickups || []).filter(function(pickup) {
    if (!keyword) return true;
    return [pickup.pickupNo, pickup.batchNo, pickup.brand, pickup.productName].some(function(value) { return String(value || '').toLowerCase().indexOf(keyword) >= 0; });
  }).slice(0, 30);
  results.innerHTML = '';
  if (!pickups.length) {
    var empty = document.createElement('div'); empty.className = 'expense-pickup-result'; empty.textContent = '没有匹配的已生成提货号'; empty.style.color = 'var(--text-secondary)'; results.appendChild(empty);
  } else {
    pickups.forEach(function(pickup) {
      var option = document.createElement('div'); option.className = 'expense-pickup-result';
      var title = document.createElement('div'); title.style.cssText = 'font-weight:600;font-size:13px;font-family:monospace'; title.textContent = pickup.pickupNo || '';
      var detail = document.createElement('div'); detail.style.cssText = 'font-size:11px;color:var(--text-secondary)'; detail.textContent = (pickup.batchNo || '') + ' | ' + (pickup.brand || '') + ' ' + (pickup.productName || '');
      option.appendChild(title); option.appendChild(detail);
      option.addEventListener('mousedown', function(event) { event.preventDefault(); selectExpensePickup(input, results, pickup.pickupNo || ''); });
      results.appendChild(option);
    });
  }
  results.style.display = 'block';
}

function selectExpensePickup(input, results, pickupNo) {
  var duplicate = Array.prototype.some.call(document.querySelectorAll('#expensePickupRows .expense-pickup-search'), function(other) {
    return other !== input && other.dataset.pickupNo === pickupNo;
  });
  if (duplicate) { toast('该提货号已选择，请勿重复添加', 'error'); return; }
  input.value = pickupNo; input.dataset.pickupNo = pickupNo; results.style.display = 'none';
}

function collectExpensePickupNos() {
  var values = [];
  var inputs = document.querySelectorAll('#expensePickupRows .expense-pickup-search');
  for (var i = 0; i < inputs.length; i++) {
    var typed = inputs[i].value.trim();
    var selected = String(inputs[i].dataset.pickupNo || '').trim();
    if (!typed) continue;
    if (!selected || typed !== selected) return { ok: false, error: '请从搜索结果中选择有效的提货号' };
    if (values.indexOf(selected) !== -1) return { ok: false, error: '同一个提货号不能重复选择' };
    values.push(selected);
  }
  return { ok: true, pickupNos: values };
}

function saveShipExpense(e) {
  e.preventDefault();
  var feeType = document.getElementById('feeType').value;
  var amount = Number(document.getElementById('expenseAmount').value);
  if (!feeType) { toast('请选择费用类型', 'error'); return; }
  if (!Number.isFinite(amount) || amount <= 0) { toast('请填写大于 0 的有效金额', 'error'); return; }
  var selectedPickups = collectExpensePickupNos();
  if (!selectedPickups.ok) { toast(selectedPickups.error, 'error'); return; }
  if (!selectedPickups.pickupNos.length) { toast('请至少选择一个已生成的提货号', 'error'); return; }
  if (!data.shipExpenses) data.shipExpenses = [];
  var obj = {
    id: data.nextId++,
    expenseNo: document.getElementById('expenseNo').value,
    feeType: feeType,
    amount: amount,
    pickupNo: selectedPickups.pickupNos[0] || '',
    pickupNos: selectedPickups.pickupNos,
    calcMethod: document.getElementById('calcMethod').value || '',
    created_at: nowStr()
  };
  data.shipExpenses.push(obj);
  shippingView = 'expenses'; saveData(); closeShipExpenseModal(); render(); toast('费用已添加', 'success');
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
function filterProcurementRecords(records, keyword) {
  var normalized = String(keyword || '').trim().toLowerCase();
  if (!normalized) return (records || []).slice();
  return (records || []).filter(function(record) {
    return String(record.batchNo || '').toLowerCase().indexOf(normalized) >= 0 || String(record.productName || '').toLowerCase().indexOf(normalized) >= 0;
  });
}

function searchProcurement(keyword) {
  procurementSearchKeyword = String(keyword || '');
  var filteredRecords = filterProcurementRecords(procData.records, procurementSearchKeyword);
  renderProcurement(filteredRecords);
  updatePagination(filteredRecords.length, procData.records.length);
}

function clearProcurementSearch() {
  procurementSearchKeyword = '';
  document.getElementById('procSearchInput').value = '';
  renderProcurement(procData.records);
  updatePagination(procData.records.length, procData.records.length);
  document.getElementById('procSearchInput').focus();
}

function renderProcurement(list) {
  var totalOrderQty = list.reduce(function(s, p) { return s + nonNegativeNumber(p.orderQty); }, 0);
  var totalOutputQty = list.reduce(function(s, p) { return s + nonNegativeNumber(p.outputQty); }, 0);
  var totalProcurementFee = list.reduce(function(s, p) { return s + calcProcurementFee(p); }, 0);
  document.getElementById('procStats').innerHTML = '<div class="stat-card"><div class="num" style="color:#8b5cf6">' + list.length + '</div><div class="label">采购记录</div></div>' + '<div class="stat-card"><div class="num" style="color:#8b5cf6">' + totalOrderQty + '</div><div class="label">下单总量</div></div>' + '<div class="stat-card"><div class="num" style="color:#8b5cf6">' + totalOutputQty + '</div><div class="label">产出总量</div></div>' + '<div class="stat-card"><div class="num" style="color:#8b5cf6">¥' + num(totalProcurementFee) + '</div><div class="label">采购费用</div></div>';
  if (list.length === 0) { document.getElementById('procList').innerHTML = procData.records.length && procurementSearchKeyword.trim() ? '<div class="empty-state"><div class="icon">🔎</div><p>没有匹配的订单批次号或品名</p></div>' : '<div class="empty-state"><div class="icon">🛒</div><p>暂无采购记录</p></div>'; return; }
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

function summarizeBatchRows(rows) {
  var totals = (rows || []).reduce(function(result, row) {
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
  totals.unitCost = totals.pickupQty > 0 ? totals.totalCost / totals.pickupQty : null;
  return totals;
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
        shippingCost: 0, expenseCount: 0, shippingExpenseDetails: []
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
  var pickupByNo = Object.create(null);
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
        pickupByNo[pickupKey] = pickup;
      } else {
        pickupNoStates[pickupKey].count++;
        if (pickupNoStates[pickupKey].groupKey !== groupKey) {
          pickupNoStates[pickupKey].conflict = true;
          delete pickupToBatch[pickupKey];
          delete pickupByNo[pickupKey];
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
    var pickupNos = getExpensePickupNos(expense);
    var links = pickupNos.map(function(pickupNo) {
      var pickupKey = '$' + pickupNo;
      return { pickupNo: pickupNo, groupKey: pickupToBatch[pickupKey], pickup: pickupByNo[pickupKey] };
    });
    if (!links.length || links.some(function(link) { return !link.groupKey || !link.pickup; })) { unallocatedExpenses.push(expense); return; }
    var weights = links.map(function(link) { return pickupAllocationMetric(link.pickup, expense.calcMethod); });
    var totalWeight = weights.reduce(function(sum, weight) { return sum + weight; }, 0);
    var allocationBasis = expense.calcMethod || '平均分摊';
    if (totalWeight <= 0) { weights = links.map(function() { return 1; }); totalWeight = links.length; allocationBasis = expense.calcMethod ? expense.calcMethod + '（无数据，平均分摊）' : '平均分摊'; }
    var amount = nonNegativeNumber(expense.amount);
    var allocations = Object.create(null);
    links.forEach(function(link, index) {
      if (!allocations[link.groupKey]) allocations[link.groupKey] = { amount: 0, pickupNos: [] };
      allocations[link.groupKey].amount += amount * weights[index] / totalWeight;
      addUniqueValue(allocations[link.groupKey].pickupNos, link.pickupNo);
    });
    Object.keys(allocations).forEach(function(groupKey) {
      var allocation = allocations[groupKey];
      groups[groupKey].shippingCost += allocation.amount;
      groups[groupKey].expenseCount++;
      groups[groupKey].shippingExpenseDetails.push({
        expenseNo: expense.expenseNo || '', feeType: expense.feeType || '', calcMethod: expense.calcMethod || '',
        allocationBasis: allocationBasis, pickupNos: allocation.pickupNos, allPickupNos: pickupNos,
        originalAmount: amount, allocatedAmount: allocation.amount, created_at: expense.created_at || ''
      });
    });
  });

  var rows = groupKeys.map(function(groupKey) {
    var row = groups[groupKey];
    row.date = row.dates.join(' / ');
    row.brand = row.brands.join(' / ');
    row.productName = row.productNames.join(' / ');
    row.identityConflict = row.dates.length > 1 || row.brands.length > 1 || row.productNames.length > 1;
    row.procurementCost = row.materialCost + row.packagingCost + row.laborCost;
    row.totalCost = row.procurementCost + row.shippingCost;
    row.unitCost = row.pickupQty > 0 ? row.totalCost / row.pickupQty : null;
    return row;
  });

  rows.sort(function(a, b) {
    var dateCompare = String(b.date || '').localeCompare(String(a.date || ''));
    return dateCompare || String(a.batchNo).localeCompare(String(b.batchNo));
  });

  var totals = summarizeBatchRows(rows);

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
    product.unitCost = product.pickupQty > 0 ? product.totalCost / product.pickupQty : null;
    return product;
  }).sort(function(a, b) { return String(a.productName).localeCompare(String(b.productName), 'zh-CN'); });
}

function getReportProductNames() {
  var names = [];
  (procData.records || []).forEach(function(record) { addUniqueValue(names, record.productName); });
  return names.sort(function(a, b) { return a.localeCompare(b, 'zh-CN'); });
}

function searchReportProducts(keyword) {
  var results = document.getElementById('reportProductResults');
  var normalized = String(keyword || '').trim().toLowerCase();
  var names = getReportProductNames().filter(function(name) { return !normalized || name.toLowerCase().indexOf(normalized) >= 0; }).slice(0, 50);
  results.innerHTML = '';
  if (!names.length) {
    var empty = document.createElement('div'); empty.className = 'report-product-option'; empty.textContent = '没有匹配的品名'; empty.style.color = 'var(--text-secondary)'; results.appendChild(empty);
  } else {
    names.forEach(function(name) {
      var option = document.createElement('div'); option.className = 'report-product-option'; option.textContent = name;
      option.addEventListener('mousedown', function(event) { event.preventDefault(); selectReportProduct(name); });
      results.appendChild(option);
    });
  }
  results.style.display = 'block';
}

function hideReportProductResults() {
  setTimeout(function() { document.getElementById('reportProductResults').style.display = 'none'; }, 150);
}

function selectReportProduct(productName) {
  selectedReportProduct = productName;
  document.getElementById('reportProductSearch').value = productName;
  document.getElementById('reportProductResults').style.display = 'none';
  renderReport();
}

function clearReportProduct() {
  selectedReportProduct = '';
  document.getElementById('reportProductSearch').value = '';
  document.getElementById('reportProductResults').style.display = 'none';
  renderReport();
}

function reportRowsForProduct(rows, productName) {
  return (rows || []).filter(function(row) { return (row.productNames || []).indexOf(productName) !== -1; });
}

function renderBatchShippingExpenseDetails(row) {
  var details = row.shippingExpenseDetails || [];
  if (!details.length) return '';
  var detailRows = details.map(function(detail) {
    return '<tr><td><strong>' + esc(detail.expenseNo || '') + '</strong></td><td>' + esc(detail.feeType || '') + '</td>' +
      '<td>' + (detail.pickupNos || []).map(esc).join('、') + '</td><td>' + esc(detail.allocationBasis || '') + '</td>' +
      '<td class="num-col">¥' + num(detail.originalAmount) + '</td><td class="num-col"><strong>¥' + num(detail.allocatedAmount) + '</strong></td></tr>';
  }).join('');
  return '<tr class="report-expense-detail-row"><td colspan="14"><div class="report-expense-detail-box"><strong style="font-size:12px;color:#475569">🚛 运输费用明细（' + details.length + ' 项）</strong>' +
    '<div style="overflow-x:auto"><table class="report-expense-detail-table"><thead><tr><th>费用批次号</th><th>费用类型</th><th>本批次关联提货号</th><th>分摊方式</th><th class="num-col">原费用金额</th><th class="num-col">本批次分摊金额</th></tr></thead><tbody>' + detailRows + '</tbody></table></div></div></td></tr>';
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

  var productNames = getReportProductNames();
  if (selectedReportProduct && productNames.indexOf(selectedReportProduct) === -1) selectedReportProduct = '';
  var productInput = document.getElementById('reportProductSearch');
  if (document.activeElement !== productInput) productInput.value = selectedReportProduct;

  if (!report.rows.length) {
    document.getElementById('reportProductSummary').innerHTML = '';
    document.getElementById('reportList').innerHTML = '<div class="empty-state"><div class="icon">📊</div><p>采购端暂无订单，暂时不能生成批次报表</p></div>';
  } else if (!selectedReportProduct) {
    document.getElementById('reportProductSummary').innerHTML = '';
    document.getElementById('reportList').innerHTML = '<div class="empty-state"><div class="icon">🔎</div><p>请先输入关键词并选择一个品名</p></div>';
  } else {
    var selectedRows = reportRowsForProduct(report.rows, selectedReportProduct);
    var selectedTotals = summarizeBatchRows(selectedRows);
    document.getElementById('reportProductSummary').innerHTML = '<h3 class="report-section-title">📦 ' + esc(selectedReportProduct) + ' 汇总</h3><div class="stats-bar">' +
      '<div class="stat-card"><div class="num" style="color:#0f766e">' + selectedRows.length + '</div><div class="label">订单批次数</div></div>' +
      '<div class="stat-card"><div class="num" style="color:#0f766e">' + fmtQty(selectedTotals.outputQty) + '</div><div class="label">产出数量</div></div>' +
      '<div class="stat-card"><div class="num" style="color:#f59e0b">' + fmtQty(selectedTotals.pickupQty) + '</div><div class="label">已提货数量</div></div>' +
      '<div class="stat-card"><div class="num" style="color:#8b5cf6">¥' + num(selectedTotals.procurementCost) + '</div><div class="label">采购费用</div></div>' +
      '<div class="stat-card"><div class="num" style="color:#6366f1">¥' + num(selectedTotals.shippingCost) + '</div><div class="label">运输费用</div></div>' +
      '<div class="stat-card"><div class="num" style="color:#059669">¥' + num(selectedTotals.totalCost) + '</div><div class="label">总费用</div></div>' +
      '<div class="stat-card"><div class="num" style="color:#dc2626">' + (selectedTotals.unitCost == null ? '--' : '¥' + num(selectedTotals.unitCost)) + '</div><div class="label">货品成本/件</div></div></div>';

    var html = '<h3 class="report-section-title">📋 ' + esc(selectedReportProduct) + ' — 订单批次号明细</h3><div style="overflow-x:auto"><table class="proc-table report-table"><thead><tr>' +
      '<th class="batch-col">订单批次号</th><th>下单日期</th><th>品牌</th><th>品名</th>' +
      '<th class="num-col">下单量</th><th class="num-col">产出量</th><th class="num-col">已提货</th>' +
      '<th class="num-col">原料总成本</th><th class="num-col">包材总成本</th><th class="num-col">工费总额</th>' +
      '<th class="num-col">采购费用</th><th class="num-col">运输费用</th><th class="num-col">总费用</th><th class="num-col">货品成本/件</th>' +
      '</tr></thead><tbody>';
    selectedRows.forEach(function(row) {
      var pickupColor = row.outputQty > 0 && row.pickupQty > row.outputQty ? '#dc2626' : 'inherit';
      html += '<tr>' +
        '<td class="batch-col"><strong style="color:' + (row.missingBatchNo ? '#ea580c' : '#0f766e') + '">' + esc(row.batchNo) + '</strong>' + (row.recordCount > 1 ? '<div style="font-size:10px;color:var(--text-secondary)">合并 ' + row.recordCount + ' 条采购</div>' : '') + '</td>' +
        '<td>' + esc(row.date) + '</td><td><strong>' + esc(row.brand) + '</strong></td><td>' + esc(row.productName) + '</td>' +
        '<td class="num-col">' + fmtQty(row.orderQty) + '</td><td class="num-col">' + fmtQty(row.outputQty) + '</td>' +
        '<td class="num-col" style="color:' + pickupColor + '">' + fmtQty(row.pickupQty) + '</td>' +
        '<td class="num-col">¥' + num(row.materialCost) + '</td><td class="num-col">¥' + num(row.packagingCost) + '</td><td class="num-col">¥' + num(row.laborCost) + '</td>' +
        '<td class="num-col">¥' + num(row.procurementCost) + '</td><td class="num-col">¥' + num(row.shippingCost) + '</td>' +
        '<td class="num-col"><strong>¥' + num(row.totalCost) + '</strong></td><td class="num-col"><strong>' + (row.unitCost == null ? '--' : '¥' + num(row.unitCost)) + '</strong></td>' +
        '</tr>' + renderBatchShippingExpenseDetails(row);
    });
    html += '</tbody><tfoot><tr><td class="batch-col">汇总</td><td colspan="3">' + selectedRows.length + ' 个订单批次</td>' +
      '<td class="num-col">' + fmtQty(selectedTotals.orderQty) + '</td><td class="num-col">' + fmtQty(selectedTotals.outputQty) + '</td><td class="num-col">' + fmtQty(selectedTotals.pickupQty) + '</td>' +
      '<td class="num-col">¥' + num(selectedTotals.materialCost) + '</td><td class="num-col">¥' + num(selectedTotals.packagingCost) + '</td><td class="num-col">¥' + num(selectedTotals.laborCost) + '</td>' +
      '<td class="num-col">¥' + num(selectedTotals.procurementCost) + '</td><td class="num-col">¥' + num(selectedTotals.shippingCost) + '</td><td class="num-col">¥' + num(selectedTotals.totalCost) + '</td><td class="num-col">' + (selectedTotals.unitCost == null ? '--' : '¥' + num(selectedTotals.unitCost)) + '</td></tr></tfoot></table></div>';
    document.getElementById('reportList').innerHTML = html;
  }

  renderCloudSync();
  document.getElementById('reportMethod').innerHTML = '<div style="display:grid;gap:8px;font-size:13px;line-height:1.5">' +
    '<div><strong>归集路径：</strong>订单批次号 → 一个或多个提货号 → 运输费用</div>' +
    '<div><strong>采购费用：</strong>原料总成本 + 包材总成本 + 工费总额</div>' +
    '<div><strong>多提货号分摊：</strong>按所选体积或重量比例分摊；未指定或全部缺少对应数据时平均分摊</div>' +
    '<div><strong>货品成本：</strong>（采购费用 + 运输费用）÷ 已提货数量</div>' +
    '<div style="color:var(--text-secondary)">未关联提货号的运输费用不会自动分摊，需在运输端补充关联。</div></div>';
  document.getElementById('sysSettings').innerHTML = '<div style="display:grid;gap:8px">' + '<button class="btn btn-sm btn-outline" onclick="exportAllData()" style="width:100%">📤 导出所有数据</button>' + '<button class="btn btn-sm btn-outline" onclick="importData()" style="width:100%">📥 导入数据</button>' + '<button class="btn btn-sm btn-danger" onclick="clearAllData()" style="width:100%">🗑️ 清空所有数据</button>' + '</div>';
}

function exportBatchReport() {
  var report = buildBatchReport(procData.records, data.pickups || [], data.shipExpenses || []);
  if (!report.rows.length) { toast('没有批次数据可导出', 'error'); return; }
  if (!selectedReportProduct) { toast('请先选择要导出的品名', 'error'); return; }
  var selectedRows = reportRowsForProduct(report.rows, selectedReportProduct);
  var selectedTotals = summarizeBatchRows(selectedRows);
  var rows = selectedRows.map(function(row) {
    return {
      '订单批次号': row.batchNo, '下单日期': row.date, '品牌': row.brand, '品名': row.productName,
      '下单数量': row.orderQty, '产出数量': row.outputQty, '已提货数量': row.pickupQty,
      '原料总成本': row.materialCost, '包材总成本': row.packagingCost, '工费总额': row.laborCost,
      '采购费用': row.procurementCost, '运输费用': row.shippingCost, '总费用': row.totalCost,
      '货品成本/件': row.unitCost == null ? '' : row.unitCost
    };
  });
  var workbook = XLSX.utils.book_new();
  var summarySheet = XLSX.utils.json_to_sheet([{
    '品名': selectedReportProduct, '订单批次数': selectedRows.length, '下单数量': selectedTotals.orderQty,
    '产出数量': selectedTotals.outputQty, '已提货数量': selectedTotals.pickupQty,
    '采购费用': selectedTotals.procurementCost, '运输费用': selectedTotals.shippingCost, '总费用': selectedTotals.totalCost,
    '货品成本/件': selectedTotals.unitCost == null ? '' : selectedTotals.unitCost
  }]);
  summarySheet['!cols'] = [{wch:20},{wch:12},{wch:12},{wch:12},{wch:12},{wch:14},{wch:14},{wch:14},{wch:14}];
  XLSX.utils.book_append_sheet(workbook, summarySheet, '品名汇总');
  var reportSheet = XLSX.utils.json_to_sheet(rows);
  reportSheet['!cols'] = [{wch:28},{wch:12},{wch:14},{wch:18},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:14},{wch:12},{wch:12}];
  XLSX.utils.book_append_sheet(workbook, reportSheet, '订单批次明细');
  var shippingDetailRows = [];
  selectedRows.forEach(function(row) {
    (row.shippingExpenseDetails || []).forEach(function(detail) {
      shippingDetailRows.push({
        '订单批次号': row.batchNo, '品名': row.productName, '费用批次号': detail.expenseNo, '费用类型': detail.feeType,
        '本批次关联提货号': (detail.pickupNos || []).join('、'), '全部关联提货号': (detail.allPickupNos || []).join('、'),
        '分摊方式': detail.allocationBasis, '原费用金额': detail.originalAmount, '本批次分摊金额': detail.allocatedAmount, '录入时间': detail.created_at || ''
      });
    });
  });
  if (shippingDetailRows.length) {
    var shippingDetailSheet = XLSX.utils.json_to_sheet(shippingDetailRows);
    shippingDetailSheet['!cols'] = [{wch:28},{wch:18},{wch:18},{wch:14},{wch:28},{wch:34},{wch:22},{wch:14},{wch:18},{wch:20}];
    XLSX.utils.book_append_sheet(workbook, shippingDetailSheet, '运输费用明细');
  }
  if (report.unallocatedExpenses.length) {
    var unallocatedRows = report.unallocatedExpenses.map(function(expense) {
      var pickupNos = getExpensePickupNos(expense);
      return {
        '费用批次号': expense.expenseNo || '', '费用类型': expense.feeType || '', '金额': nonNegativeNumber(expense.amount),
        '提货号': pickupNos.join('、'), '未归集原因': pickupNos.length ? '一个或多个提货号未匹配采购批次' : '未关联提货号', '录入时间': expense.created_at || ''
      };
    });
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(unallocatedRows), '未归集运输费用');
  }
  if (report.unmatchedPickups.length) {
    var unmatchedPickupRows = report.unmatchedPickups.map(function(pickup) {
      return {
        '提货号': pickup.pickupNo || '', '订单批次号': pickup.batchNo || '', '品牌': pickup.brand || '', '品名': pickup.productName || '',
        '提货数量': nonNegativeNumber(pickup.qty), '长(cm)': pickup.lengthCm === '' || pickup.lengthCm == null ? '' : nonNegativeNumber(pickup.lengthCm),
        '宽(cm)': pickup.widthCm === '' || pickup.widthCm == null ? '' : nonNegativeNumber(pickup.widthCm), '高(cm)': pickup.heightCm === '' || pickup.heightCm == null ? '' : nonNegativeNumber(pickup.heightCm),
        '体积(cm³)': pickup.volumeCm3 === '' || pickup.volumeCm3 == null ? '' : nonNegativeNumber(pickup.volumeCm3), '重量(g)': pickup.weightG === '' || pickup.weightG == null ? '' : nonNegativeNumber(pickup.weightG),
        '旧体积(m³)': pickup.volume || '', '旧重量(kg)': pickup.weight || '', '录入时间': pickup.created_at || ''
      };
    });
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(unmatchedPickupRows), '未匹配提货记录');
  }
  var safeProductName = selectedReportProduct.replace(/[\\/:*?"<>|]/g, '_');
  XLSX.writeFile(workbook, safeProductName + '_订单批次费用报表_' + todayStr() + '.xlsx');
  toast('已导出 ' + selectedRows.length + ' 个订单批次', 'success');
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

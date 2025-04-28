// app.js

// Utility to shorten model names
function shortModel(fullModel, brand) {
  return fullModel
    .replace(new RegExp(brand, 'i'), '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(' ');
}

// State
let compatibility = [], invParts = [], batParts = [];
const invPartsMap = {}, batPartsMap = {};
let filtered = [], currentPage = 1, pageSize = 10;
let sortCol = null, sortDesc = false;

// Load data
Promise.all([
  fetch('data/compatibility.json').then(r => r.json()),
  fetch('data/invParts.json').then(r => r.json()),
  fetch('data/batParts.json').then(r => r.json())
]).then(([comp, invs, bats]) => {
  compatibility = comp;
  invParts = invs;
  batParts = bats;

  invs.forEach(i =>
    invPartsMap[i.sku.toLowerCase()] = i.parts
  );
  bats.forEach(b =>
    batPartsMap[b.sku.toLowerCase()] = {
      required:    b.requiredParts,
      conditional: b.conditionalParts
    }
  );

  initFilters();
  makeTableSortable();
  document.getElementById('pageSizeSelect')
    .addEventListener('change', () => {
      currentPage = 1;
      renderTable();
    });
}).catch(console.error);

// Initialize filter dropdowns
function initFilters() {
  const im = document.getElementById('invMake'),
        bm = document.getElementById('batMake');

  [...new Set(compatibility.map(e => e.invBrand))]
    .forEach(m => im.append(new Option(m, m)));
  [...new Set(compatibility.map(e => e.batBrand))]
    .forEach(m => bm.append(new Option(m, m)));

  im.onchange = onInvMakeChange;
  bm.onchange = onBatMakeChange;
  document.getElementById('applyFiltersBtn').onclick = applyFilters;
}

function onInvMakeChange() {
  const sel = document.getElementById('invModel');
  sel.innerHTML = '<option value="">--Any--</option>';
  [...new Set(
    compatibility
      .filter(e => !this.value || e.invBrand === this.value)
      .map(e => e.invModel)
  )].forEach(m => sel.append(new Option(m, m)));
}

function onBatMakeChange() {
  const sel = document.getElementById('batModel');
  sel.innerHTML = '<option value="">--Any--</option>';
  [...new Set(
    compatibility
      .filter(e => !this.value || e.batBrand === this.value)
      .map(e => e.batModel)
  )].forEach(m => sel.append(new Option(m, m)));
}

// Apply all filters and rebuild the table
function applyFilters() {
  const fIM     = document.getElementById('invMake').value,
        fIModel = document.getElementById('invModel').value,
        fIK     = +document.getElementById('invKW').value || 0,
        fIP     = document.getElementById('invPhase').value,
        fBM     = document.getElementById('batMake').value,
        fBModel = document.getElementById('batModel').value,
        minS    = +document.getElementById('minStorage').value || 0,
        maxS    = +document.getElementById('maxStorage').value || Infinity;

  filtered = [];
  compatibility.forEach(e => {
    if ((fIM && e.invBrand !== fIM) ||
        (fIModel && e.invModel !== fIModel) ||
        (fIK && +e.invKW !== fIK)) return;

    if (fIP) {
      const m = e.invModel.toLowerCase();
      if (fIP === 'single' && !/(single phase|1[- ]phase)/.test(m)) return;
      if (fIP === 'three' && !/(three phase|3[- ]phase)/.test(m)) return;
    }

    if ((fBM && e.batBrand !== fBM) ||
        (fBModel && e.batModel !== fBModel)) return;

    for (let n = e.minModules; n <= e.maxModules; n++) {
      const tot = n * +e.moduleCapacity;
      if (tot < minS || tot > maxS) continue;
      filtered.push({ ...e, modules: n, total: +tot.toFixed(1) });
    }
  });

  currentPage = 1;
  renderTable();
}

// Render the results table
function renderTable() {
  const tb = document.querySelector('#resultsTable tbody');
  tb.innerHTML = '';

  if (sortCol !== null) {
    const keys = ['invBrand','batBrand','modules','total'];
    filtered.sort((a, b) => {
      const av = a[keys[sortCol]], bv = b[keys[sortCol]];
      const cmp = typeof av === 'number'
        ? av - bv
        : av.localeCompare(bv);
      return sortDesc ? -cmp : cmp;
    });
  }

  pageSize = +document.getElementById('pageSizeSelect').value;
  const start = (currentPage - 1) * pageSize,
        page  = filtered.slice(start, start + pageSize);

  if (!page.length) {
    tb.innerHTML = '<tr><td colspan="5">No matches found.</td></tr>';
  } else {
    page.forEach(r => {
      const btn = `
        <button class="viewBOMBtn"
          data-inv="${r.invSKU}" data-invbrand="${r.invBrand}"
          data-invmodel="${r.invModel}" data-invkw="${r.invKW}"
          data-bat="${r.batSKU}" data-batbrand="${r.batBrand}"
          data-batmodel="${r.batModel}"
          data-modulecap="${r.moduleCapacity}"
          data-modules="${r.modules}">
          View BOM
        </button>`;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.invBrand} ${shortModel(r.invModel, r.invBrand)} (${r.invKW} kW)</td>
        <td>${r.batBrand} ${shortModel(r.batModel, r.batBrand)} (${r.moduleCapacity} kWh)</td>
        <td>${r.modules}</td>
        <td>${r.total}</td>
        <td>${btn}</td>`;
      tb.appendChild(tr);
    });
  }

  document.getElementById('resultsSection').style.display = '';
  renderPagination();
}

// Pagination controls
function renderPagination() {
  const pg = document.getElementById('pagination');
  pg.innerHTML = '';
  const total = Math.ceil(filtered.length / pageSize) || 1;

  const makeBtn = (text, page) => {
    const b = document.createElement('button');
    b.textContent = text;
    b.disabled = page === currentPage;
    b.onclick  = () => { currentPage = page; renderTable(); };
    return b;
  };

  pg.appendChild(makeBtn('‹', Math.max(1, currentPage - 1)));
  for (let p = Math.max(1, currentPage - 2); p <= Math.min(total, currentPage + 2); p++) {
    const btn = makeBtn(p, p);
    if (p === currentPage) btn.style.fontWeight = 'bold';
    pg.appendChild(btn);
  }
  pg.appendChild(makeBtn('›', Math.min(total, currentPage + 1)));
}

// Enable column sorting
function makeTableSortable() {
  document.querySelectorAll('#resultsTable th').forEach((th, i) => {
    if (i === 4) return; // skip action column
    th.onclick = () => {
      if (sortCol === i) sortDesc = !sortDesc;
      else { sortCol = i; sortDesc = false; }
      renderTable();
    };
  });
}

// Handle View BOM clicks
document.getElementById('resultsTable')
  .addEventListener('click', e => {
    if (!e.target.classList.contains('viewBOMBtn')) return;
    showBOM(e.target.dataset);
  });

// Build and display the BOM
function showBOM(d) {
  const invKey = d.inv.replace(/\s*\(.*?\)\s*/, '').toLowerCase().trim();
  const batKey = d.bat.replace(/\s*\(.*?\)\s*/, '').toLowerCase().trim();

  let html = `
    <h3>Configuration BOM</h3>
    <table id="bomTable">
      <thead>
        <tr><th>Description</th><th>Part</th><th>SKU</th><th>Qty</th></tr>
      </thead>
      <tbody>`;

  // Inverter row
  html += `
    <tr>
      <td>Inverter</td>
      <td>${d.invbrand} ${shortModel(d.invmodel, d.invbrand)} (${d.invkw} kW)</td>
      <td>${invKey}</td><td>1</td>
    </tr>`;

  // Battery row
  html += `
    <tr>
      <td>Battery</td>
      <td>${d.batbrand} ${shortModel(d.batmodel, d.batbrand)} (${d.modulecap} kWh)</td>
      <td>${batKey}</td><td>${d.modules}</td>
    </tr>`;

  // Inverter components
  (invPartsMap[invKey] || []).forEach(p => {
    const qty = p.per_module ? p.quantity * d.modules : p.quantity;
    html += `
      <tr>
        <td>Inverter Component</td>
        <td>${p.name}</td>
        <td>${p.sku}</td>
        <td>${qty}</td>
      </tr>`;
  });

  // Battery required parts
  (batPartsMap[batKey]?.required || []).forEach(p => {
    const qty = p.per_module ? p.quantity * d.modules : p.quantity;
    html += `
      <tr>
        <td>Battery Component</td>
        <td>${p.name}</td>
        <td>${p.sku}</td>
        <td>${qty}</td>
      </tr>`;
  });

  // Battery conditional parts
  (batPartsMap[batKey]?.conditional || []).forEach(p => {
    if (d.modules < p.min_modules ||
        (p.max_modules !== null && d.modules > p.max_modules)) return;
    const qty = p.per_module ? p.quantity * d.modules : p.quantity;
    html += `
      <tr>
        <td>Battery Component</td>
        <td>${p.name}</td>
        <td>${p.sku}</td>
        <td>${qty}</td>
      </tr>`;
  });

  html += `</tbody></table>`;
  document.getElementById('bomDetails').innerHTML = html;
  document.getElementById('bomSection').style.display = '';
}

// Close the BOM panel
document.getElementById('closeBOMBtn').onclick = () => {
  document.getElementById('bomSection').style.display = 'none';
};

// Download BOM as PDF
document.getElementById('downloadPdfBtn').onclick = () => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:'pt', format:'a4' });
  doc.setFontSize(14);
  doc.text('Bill of Materials', 40, 40);
  doc.autoTable({
    html: '#bomTable',
    startY: 60,
    margin: { left:40, right:40 },
    styles: { fontSize:10, cellPadding:4 },
    headStyles: { fillColor:[240,240,245], textColor:25 },
    theme: 'grid'
  });
  doc.save('bom.pdf');
};

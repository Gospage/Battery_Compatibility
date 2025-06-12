/**
 * app.js
 * Supports AIO inverters with built-in storage + optional external modules.
 * AIO entries in compatibility.json should include:
 *   builtInCapacity: number (kWh)
 *   builtInSKU:      string
 *   builtInBrand:    string
 *   builtInModel:    string
 */

// Utility to shorten model names
function shortModel(fullModel, brand) {
  return fullModel
    .replace(new RegExp(brand, 'i'), '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(' ');
}

// Utility to normalize SKUs
function normalizeSKU(sku) {
  return sku.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// === State ===
let compatibility = [], invParts = [], batParts = [];
const invPartsMap = {}, batPartsMap = {};
let filtered = [], currentPage = 1, pageSize = 10;
let sortCol = null, sortDesc = false;

// === Data loading ===
Promise.all([
  fetch('data/compatibility.json').then(r => r.json()),
  fetch('data/invParts.json').then(r => r.json()),
  fetch('data/batParts.json').then(r => r.json())
]).then(([comp, invs, bats]) => {
  compatibility = comp;
  invParts = invs;
  batParts = bats;

  invs.forEach(i =>
    invPartsMap[ normalizeSKU(i.sku) ] = i.parts
  );
  bats.forEach(b =>
    batPartsMap[ normalizeSKU(b.sku) ] = {
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

// === Reset Filters ===
function resetFilters() {
  // Clear dropdowns
  ['invMake','invModel','invKW','invPhase','batMake','batModel'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  // Reset sliders (if present) to their min/max attributes
  ['minStorage','maxStorage'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.hasAttribute('min')) el.value = el.getAttribute('min');
    if (el.hasAttribute('max')) el.value = el.getAttribute('max');
  });
  updateAllFilters();
}

// === Initialize filters & buttons ===
function initFilters() {
  const im = document.getElementById('invMake'),
        km = document.getElementById('invKW'),
        bm = document.getElementById('batMake');

  // 1) Inverter makes
  [...new Set(
    compatibility
      .map(e => e.invBrand)
      .filter(b => b && b.trim())
  )].forEach(m => im.append(new Option(m, m)));

  // 2) Inverter kW (we’ll fill it in updateAllFilters)
  km.innerHTML = '<option value="">--Any kW--</option>';

  // 3) Battery makes
  [...new Set(
    compatibility
      .map(e => e.batBrand)
      .filter(b => b && b.trim())
  )].forEach(m => bm.append(new Option(m, m)));

  // Hook every filter into the master updater
  ['invMake','invModel','invKW','invPhase','batMake','batModel']
    .forEach(id =>
      document.getElementById(id).onchange = updateAllFilters
    );

  // Also hook storage sliders (if you have them)
  ['minStorage','maxStorage']
    .forEach(id =>
      document.getElementById(id).oninput = updateAllFilters
    );

  // Apply Filters button
  const applyBtn = document.getElementById('applyFiltersBtn');
  applyBtn.onclick = applyFilters;

  // Insert Reset Filters button just to the left
  const resetBtn = document.createElement('button');
  resetBtn.id = 'resetFiltersBtn';
  resetBtn.className = applyBtn.className;
  resetBtn.textContent = 'Reset Filters';
  resetBtn.onclick = resetFilters;
  applyBtn.parentNode.insertBefore(resetBtn, applyBtn);

  // First pass
  updateAllFilters();
}

// === Master filter‐updater ===
function updateAllFilters() {
  const sel = {
    invBrand: document.getElementById('invMake').value,
    invModel: document.getElementById('invModel').value,
    invKW:     document.getElementById('invKW').value,
    invPhase:  document.getElementById('invPhase').value,
    batBrand:  document.getElementById('batMake').value,
    batModel:  document.getElementById('batModel').value
  };
  const valid = {
    invBrand: new Set(),
    invModel: new Set(),
    invKW:    new Set(),
    invPhase: new Set(),
    batBrand: new Set(),
    batModel: new Set()
  };

  /**
 * @param {'single'|'three'|''} filterPhase  the dropdown value
 * @param {string} entryPhase                the e.invPhase from your JSON
 * @returns {boolean}
 */
function phaseMatches(filterPhase, entryPhase) {
  if (!filterPhase) return true;
  if (filterPhase === 'single') return entryPhase === '1';
  if (filterPhase === 'three')  return entryPhase === '3';
  return false;
}


  compatibility.forEach(e => {
  // ─── gather every battery brand/model for this entry ───
  const allBatBrands = [];
  const allBatModels = [];
  if (e.batBrand) {
    allBatBrands.push(e.batBrand);
    allBatModels.push(e.batModel);
  }
  if (Array.isArray(e.batteryOptions)) {
    e.batteryOptions.forEach(o => {
      if (o.batBrand) allBatBrands.push(o.batBrand);
      if (o.batModel) allBatModels.push(o.batModel);
    });
  }
    // ───── Inverter dropdowns ─────
     // ───── Inverter-Make dropdown ─────
 if (
    (!sel.invModel || e.invModel === sel.invModel) &&
    (!sel.invKW    || +e.invKW   === +sel.invKW) &&
    (!sel.invPhase || phaseMatches(sel.invPhase, e.invPhase)) &&
    (!sel.batBrand || allBatBrands.includes(sel.batBrand)) &&
    (!sel.batModel || allBatModels.includes(sel.batModel))
  ) {
    valid.invBrand.add(e.invBrand);
  }

  // ───── Inverter-Model dropdown ─────
  if (
    (!sel.invBrand || e.invBrand === sel.invBrand) &&
    (!sel.invKW    || +e.invKW   === +sel.invKW) &&
    (!sel.invPhase || phaseMatches(sel.invPhase, e.invPhase)) &&
    (!sel.batBrand || allBatBrands.includes(sel.batBrand)) &&
    (!sel.batModel || allBatModels.includes(sel.batModel))
  ) {
    valid.invModel.add(e.invModel);
  }

  // ───── Inverter-kW dropdown ─────
  if (
    (!sel.invBrand || e.invBrand === sel.invBrand) &&
    (!sel.invModel || e.invModel === sel.invModel) &&
    (!sel.invPhase || phaseMatches(sel.invPhase, e.invPhase)) &&
    (!sel.batBrand || allBatBrands.includes(sel.batBrand)) &&
    (!sel.batModel || allBatModels.includes(sel.batModel))
  ) {
    valid.invKW.add(+e.invKW);
  }

  // ───── Inverter-Phase dropdown ─────
  if (
    (!sel.invBrand || e.invBrand === sel.invBrand) &&
    (!sel.invModel || e.invModel === sel.invModel) &&
    (!sel.invKW    || +e.invKW   === +sel.invKW) &&
    (!sel.batBrand || allBatBrands.includes(sel.batBrand)) &&
    (!sel.batModel || allBatModels.includes(sel.batModel))
  ) {
    if (/(single phase|1[- ]phase)/i.test(e.invModel)) valid.invPhase.add('single');
    if (/(three phase|3[- ]phase)/i.test(e.invModel)) valid.invPhase.add('three');
  }


    // ───── Battery-Make dropdown ─────
    if (
      (!sel.invBrand || e.invBrand === sel.invBrand) &&
      (!sel.invModel || e.invModel === sel.invModel) &&
      (!sel.invKW    || +e.invKW   === +sel.invKW) &&
      (!sel.invPhase || phaseMatches(sel.invPhase, e.invModel)) &&
      (!sel.batModel || e.batModel === sel.batModel)
    ) {
      // legacy field
      if (e.batBrand) valid.batBrand.add(e.batBrand);
      // mix-and-match entries
      if (Array.isArray(e.batteryOptions)) {
        e.batteryOptions
          .map(o => o.batBrand)
          .filter(b => b)
          .forEach(b => valid.batBrand.add(b));
      }
    }

    // ───── Battery-Model dropdown ─────
   // f) battery models (handle both single‐type and mix-and-match)
if (
  (!sel.invBrand || e.invBrand === sel.invBrand) &&
  (!sel.invModel || e.invModel === sel.invModel) &&
  (!sel.invKW    || +e.invKW   === +sel.invKW) &&
  (!sel.invPhase || phaseMatches(sel.invPhase, e.invPhase))
) {
  // single-type battery
  if (e.batBrand && e.batModel && (!sel.batBrand || e.batBrand === sel.batBrand)) {
    valid.batModel.add(e.batModel);
  }
  // mix-and-match options
  if (Array.isArray(e.batteryOptions)) {
    e.batteryOptions.forEach(o => {
      if (!sel.batBrand || o.batBrand === sel.batBrand) {
        valid.batModel.add(o.batModel);
      }
    });
  }
}

  });

  // Helper to rebuild a <select>
  function rebuild(selectEl, optionsSet, preserve, blankLabel) {
    const prev = preserve;
    selectEl.innerHTML = '';
    selectEl.append(new Option(blankLabel, ''));
    Array.from(optionsSet)
      .filter(v => v)
      .sort()
      .forEach(v => selectEl.append(new Option(v, v)));
    if (optionsSet.has(prev)) selectEl.value = prev;
  }

  // Rebuild each filter
  rebuild(document.getElementById('invMake'),  valid.invBrand,   sel.invBrand,  '--Any--');
  rebuild(document.getElementById('invModel'), valid.invModel,  sel.invModel, '--Any--');

  {
    const el = document.getElementById('invKW'),
          old = sel.invKW;
    el.innerHTML = '<option value="">--Any kW--</option>';
    Array.from(valid.invKW).sort((a,b)=>a-b)
      .forEach(k => el.append(new Option(`${k} kW`, k)));
    if (valid.invKW.has(+old)) el.value = old;
  }

  {
    const el = document.getElementById('invPhase'),
          old = sel.invPhase;
    el.querySelectorAll('option').forEach(o => {
      if (!o.value) return;
      o.disabled = !valid.invPhase.has(o.value);
    });
    if (!valid.invPhase.has(old)) el.value = '';
  }

  rebuild(document.getElementById('batMake'),  valid.batBrand,  sel.batBrand,  '--Any--');
  rebuild(document.getElementById('batModel'), valid.batModel,  sel.batModel,  '--Any--');
}


// Apply all filters and rebuild the table
function applyFilters() {
  // 1) Grab all filter values
  const fIM     = document.getElementById('invMake').value,
        fIModel = document.getElementById('invModel').value,
        fIK     = +document.getElementById('invKW').value || 0,
        fIP     = document.getElementById('invPhase').value,
        fBM     = document.getElementById('batMake').value,
        fBModel = document.getElementById('batModel').value,
        minS    = +document.getElementById('minStorage').value || 0,
        maxS    = +document.getElementById('maxStorage').value || Infinity;

  // 2) Filter the compatibility list
  filtered = [];
  compatibility.forEach(e => {
    // Basic inverter filters
    if ((fIM     && e.invBrand  !== fIM)    ||
        (fIModel && e.invModel  !== fIModel)||
        (fIK     && +e.invKW    !== fIK))   return;

    // Phase filter
    if (fIP) {
      const m = e.invModel.toLowerCase();
      if (fIP === 'single' && !/(single phase|1[- ]phase)/.test(m)) return;
      if (fIP === 'three' && !/(three phase|3[- ]phase)/.test(m)) return;
    }


// Battery make/model (handle mix-and-match)
if (fBM || fBModel) {
  // gather every brand/model for this entry
  const brands = [];
  const models = [];
  if (e.batBrand) {
    brands.push(e.batBrand);
    models.push(e.batModel);
  }
  if (Array.isArray(e.batteryOptions)) {
    e.batteryOptions.forEach(o => {
      brands.push(o.batBrand);
      models.push(o.batModel);
    });
  }
  // if user picked a make or model we don’t have here, skip
  if (fBM     && !brands.includes(fBM))    return;
  if (fBModel && !models.includes(fBModel)) return;
}


    // AIO built-in capacity base
    const baseCap = +e.builtInCapacity || 0;

    // Mix-and-match support?
    if (Array.isArray(e.batteryOptions)) {
      const [opt0, opt1] = e.batteryOptions,
            minT = e.minModules,
            maxT = e.maxModules;

      for (let n0 = 0; n0 <= maxT; n0++) {
        for (let n1 = 0; n1 <= maxT - n0; n1++) {
          const totalMods = n0 + n1;
          if (totalMods < minT || totalMods > maxT) continue;

          const extra = n0 * opt0.moduleCapacity + n1 * opt1.moduleCapacity;
          const total = baseCap + extra;
          if (total < minS || total > maxS || total === 0) continue;

          filtered.push({
            ...e,
            moduleBreakdown: [
              { ...opt0, count: n0 },
              { ...opt1, count: n1 }
            ],
            modules: totalMods,
            total:   +total.toFixed(1)
          });
        }
      }
    }
    // Legacy single-type batteries
    else {
      for (let n = e.minModules; n <= e.maxModules; n++) {
        const extra = n * +e.moduleCapacity;
        const total = baseCap + extra;
        if (total < minS || total > maxS || total === 0) continue;

        filtered.push({
          ...e,
          modules:      n,
          total:        +total.toFixed(1),
          baseCapacity: baseCap,
          builtInSKU:   e.builtInSKU   || null,
          builtInBrand: e.builtInBrand || null,
          builtInModel: e.builtInModel || null
        });
      }
    }
  });

  // 3) Reset pagination & render
  currentPage = 1;
  renderTable();


 // 4a) Inverter Phase dropdown
  const ph = document.getElementById('invPhase');
  ph.innerHTML =
    '<option value="">--Any Phase--</option>' +
    '<option value="single">Single Phase</option>' +
    '<option value="three">Three Phase</option>';
  ph.onchange = updateAllFilters;




  // 4) **NEW**: scroll smoothly to the results section
  const resultsSection = document.getElementById('resultsSection');
  resultsSection.scrollIntoView({ behavior: 'smooth' });
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
  // Build battery description
  let batLabel;

  if (r.moduleBreakdown) {
    // Mix-and-match: show each type’s count×capacity
    batLabel = r.moduleBreakdown
      .filter(opt => opt.count > 0)
      .map(opt => `${opt.count}×${opt.moduleCapacity} kWh`)
      .join(' + ');

  } else if (r.baseCapacity) {
    // AIO: built-in + external modules
    batLabel = `${r.batBrand} ${shortModel(r.batModel, r.batBrand)}` +
               ` — ${r.baseCapacity} kWh built-in`;
    if (r.modules > 0) {
      batLabel += ` + ${r.modules}×${r.moduleCapacity} kWh`;
    }

  } else {
    // Legacy single-type battery
    batLabel = `${r.batBrand} ${shortModel(r.batModel, r.batBrand)}` +
               ` (${r.moduleCapacity} kWh)`;
  }

       // "View BOM" button carries all needed data
       // create the <tr> and the first four cells however you have them
const tr = document.createElement('tr');
tr.innerHTML = `
  <td>${r.invBrand} ${shortModel(r.invModel, r.invBrand)} (${r.invKW} kW)</td>
  <td>${batLabel}</td>
  <td>${r.modules}</td>
  <td>${r.total}</td>
`;

// now the action cell with a real JS click handler
const actionTd = document.createElement('td');
const viewBtn = document.createElement('button');
viewBtn.textContent = 'View BOM';
viewBtn.className   = 'btn btn--primary';
// Bind the full record 'r' into the handler:
viewBtn.addEventListener('click', () => showBOM(r));
actionTd.appendChild(viewBtn);
tr.appendChild(actionTd);

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



 // Build and display the BOM
// Build and display the BOM
function showBOM(r) {
  const invKey   = normalizeSKU(r.invSKU),
        invRaw   = r.invSKU,
        modules  = +r.modules;

  let html = `
    
    <table id="bomTable">
      <thead>
        <tr><th>Description</th><th>Part</th><th>SKU</th><th>Qty</th></tr>
      </thead>
      <tbody>`;

  // 1) Inverter row
  html += `
    <tr>
      <td>Inverter</td>
      <td>${r.invBrand} ${shortModel(r.invModel, r.invBrand)} (${r.invKW} kW)</td>
      <td>${invRaw}</td>
      <td>1</td>
    </tr>`;

  // 2) Inverter additional parts
  (invPartsMap[invKey] || []).forEach(p => {
    const qty = p.per_module ? p.quantity * modules : p.quantity;
    html += `
      <tr>
        <td>Inverter Component</td>
        <td>${p.name}</td>
        <td>${p.sku}</td>
        <td>${qty}</td>
      </tr>`;
  });

  // 3) Battery modules & parts
  if (r.moduleBreakdown) {
    const mbs = r.moduleBreakdown.filter(opt => opt.count > 0);

    // 3a) Emit each module row
    mbs.forEach(opt => {
      const keyRaw = opt.batSKU;
      html += `
        <tr>
          <td>Battery Module</td>
          <td>${opt.batBrand} ${shortModel(opt.batModel, opt.batBrand)} (${opt.moduleCapacity} kWh)</td>
          <td>${keyRaw}</td>
          <td>${opt.count}</td>
        </tr>`;
    });

    // 3b) Required + conditional parts (using first module type)
    if (mbs.length) {
      const primaryKey = normalizeSKU(mbs[0].batSKU);
      const totalMods  = modules;

      (batPartsMap[primaryKey]?.required || []).forEach(p => {
        const qty = p.per_module ? p.quantity * totalMods : p.quantity;
        html += `
          <tr>
            <td>Battery Component</td>
            <td>${p.name}</td>
            <td>${p.sku}</td>
            <td>${qty}</td>
          </tr>`;
      });

      (batPartsMap[primaryKey]?.conditional || []).forEach(p => {
        if (totalMods < p.min_modules ||
            (p.max_modules !== null && totalMods > p.max_modules)) return;
        const qty = p.per_module ? p.quantity * totalMods : p.quantity;
        html += `
          <tr>
            <td>Battery Component</td>
            <td>${p.name}</td>
            <td>${p.sku}</td>
            <td>${qty}</td>
          </tr>`;
      });
    }
  }
  else {
    // Legacy single-type battery
    const batKeyRaw  = r.batSKU,
          batKeyNorm = normalizeSKU(r.batSKU);

    html += `
      <tr>
        <td>Battery Module</td>
        <td>${r.batBrand} ${shortModel(r.batModel, r.batBrand)} (${r.moduleCapacity} kWh)</td>
        <td>${batKeyRaw}</td>
        <td>${modules}</td>
      </tr>`;

    (batPartsMap[batKeyNorm]?.required || []).forEach(p => {
      const qty = p.per_module ? p.quantity * modules : p.quantity;
      html += `
        <tr>
          <td>Battery Component</td>
          <td>${p.name}</td>
          <td>${p.sku}</td>
          <td>${qty}</td>
        </tr>`;
    });

    (batPartsMap[batKeyNorm]?.conditional || []).forEach(p => {
      if (modules < p.min_modules ||
          (p.max_modules !== null && modules > p.max_modules)) return;
      const qty = p.per_module ? p.quantity * modules : p.quantity;
      html += `
        <tr>
          <td>Battery Component</td>
          <td>${p.name}</td>
          <td>${p.sku}</td>
          <td>${qty}</td>
        </tr>`;
    });
  }

  html += `
      </tbody>
    </table>`;

  // render and scroll into view
  document.getElementById('bomDetails').innerHTML = html;
  const bomSection = document.getElementById('bomSection');
  bomSection.style.display = '';
  bomSection.scrollIntoView({ behavior: 'smooth' });
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
document.addEventListener('DOMContentLoaded', () => {
  // grab your animated <h1>
  const heading = document.querySelector('.hero__content h1');
  // grab the thing you want to scroll to
  const target  = document.getElementById('filterSection');

  // when the CSS animation on the H1 ends, scroll into view
  heading.addEventListener('animationend', () => {
    target.scrollIntoView({ behavior: 'smooth' });
  });
});

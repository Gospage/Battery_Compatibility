  <script>
    // ——— State holders ———
    let compatibility = [];
    let invPartsMap   = {}; // invSKU → [ {sku,name,quantity,per_module,min_modules?,max_modules?}, … ]
    let batPartsMap   = {}; // batSKU → { requiredParts: […], conditionalParts: […] }
    let inverters     = [];
    let batteries     = [];

    document.addEventListener('DOMContentLoaded', () => {
      Promise.all([
        fetch('data/compatibility.json').then(r => r.json()),
        fetch('data/invParts.json').       then(r => r.json()),
        fetch('data/batParts.json').       then(r => r.json())
      ]).then(([compat, invParts, batParts]) => {
        compatibility = compat;

        // Build invPartsMap
        invParts.forEach(item => {
          invPartsMap[item.sku] = item.parts;
        });

        // Build batPartsMap
        batParts.forEach(item => {
          batPartsMap[item.sku] = {
            requiredParts:    item.requiredParts    || [],
            conditionalParts: item.conditionalParts || []
          };
        });

        // Derive unique inverters record
        const invMap = {};
        compatibility.forEach(entry => {
          const key = entry.invSKU;
          if (!invMap[key]) {
            invMap[key] = {
              id:         entry.invSKU,
              make:       entry.invBrand,
              model:      entry.invModel,
              kW:         parseFloat(entry.invKW),
              maxModules: entry.maxModules
            };
          } else {
            // take the largest maxModules across all battery pairings
            invMap[key].maxModules = Math.max(invMap[key].maxModules, entry.maxModules);
          }
        });
        inverters = Object.values(invMap);

        // Derive unique batteries record
        const batMap = {};
        compatibility.forEach(entry => {
          const key = entry.batSKU;
          if (!batMap[key]) {
            batMap[key] = {
              id:      entry.batSKU,
              make:    entry.batBrand,
              model:   entry.batModel
              // NOTE: you may want to add moduleCapacity here in your JSON
            };
          }
        });
        batteries = Object.values(batMap);

        // Now wire up the UI
        populateFilters();
      });
    });

    // ——— populateFilters remains the same ———
    function populateFilters() {
      // Inverter Make
      const invMakeSelect = document.getElementById('invMake');
      const invMakes = [...new Set(inverters.map(inv => inv.make))];
      invMakes.forEach(make => {
        const option = document.createElement('option');
        option.value = make;
        option.textContent = make;
        invMakeSelect.appendChild(option);
      });

      // Battery Make
      const batMakeSelect = document.getElementById('batMake');
      const batMakes = [...new Set(batteries.map(bat => bat.make))];
      batMakes.forEach(make => {
        const option = document.createElement('option');
        option.value = make;
        option.textContent = make;
        batMakeSelect.appendChild(option);
      });
    }

    // ——— event listeners for invMake/batMake change remain the same ———

    // ——— Apply Filters ———
    document.getElementById('applyFiltersBtn').addEventListener('click', () => {
      const fInvMake = document.getElementById('invMake').value;
      const fInvModel= document.getElementById('invModel').value;
      const fInvKW   = parseFloat(document.getElementById('invKW').value);
      const fBatMake = document.getElementById('batMake').value;
      const fBatModel= document.getElementById('batModel').value;
      const fTotal   = parseFloat(document.getElementById('totalStorage').value);

      // clear old results
      const tbody = document.querySelector('#resultsTable tbody');
      tbody.innerHTML = '';

      let found = false;

      // Filter compatibility rows directly
      compatibility.forEach(entry => {
        if (
          ( !fInvMake   || entry.invBrand === fInvMake ) &&
          ( !fInvModel  || entry.invModel === fInvModel ) &&
          ( !fInvKW     || parseFloat(entry.invKW) === fInvKW ) &&
          ( !fBatMake   || entry.batBrand === fBatMake ) &&
          ( !fBatModel  || entry.batModel === fBatModel )
        ) {
          // if totalStorage filter is set, we need moduleCapacity to test modules
          // otherwise, default to the maxModules for that inverter
          const moduleCounts = fTotal
            ? [] // ← you'll need battery.moduleCapacity here to compute modules
            : [ entry.maxModules ];

          moduleCounts.forEach(m => {
            const row = document.createElement('tr');
            row.innerHTML = `
              <td>${entry.invBrand} ${entry.invModel} (${entry.invKW} kW)</td>
              <td>${entry.batBrand} ${entry.batModel}</td>
              <td>${m}</td>
              <td>${ (window.batteryModuleCapacity||1) * m }</td>
              <td>
                <button class="viewBOMBtn"
                        data-inv="${entry.invSKU}"
                        data-bat="${entry.batSKU}"
                        data-modules="${m}">
                  View BOM
                </button>
              </td>
            `;
            tbody.appendChild(row);
            found = true;
          });
        }
      });

      if (!found) {
        tbody.innerHTML = '<tr><td colspan="5">No matching combinations found.</td></tr>';
      }
      document.getElementById('resultsSection').style.display = 'block';
      document.getElementById('bomSection').style.display     = 'none';
    });

    // ——— View BOM Button ———
    document.getElementById('resultsTable').addEventListener('click', e => {
      if (e.target.classList.contains('viewBOMBtn')) {
        const invSKU = e.target.dataset.inv;
        const batSKU = e.target.dataset.bat;
        const modules= parseInt(e.target.dataset.modules, 10);
        generateBOM(invSKU, batSKU, modules);
      }
    });

    // ——— Generate BOM ———
    function generateBOM(invSKU, batSKU, modules) {
      const invParts    = invPartsMap[invSKU]    || [];
      const batEntry    = batPartsMap[batSKU]    || { requiredParts:[], conditionalParts:[] };
      const bomDiv      = document.getElementById('bomDetails');
      let html = `<h3>Configuration BOM</h3>`;
      html += `<p><strong>Inverter:</strong> ${invSKU} &mdash; ${modules} module(s)</p>`;
      html += `<p><strong>Battery:</strong> ${batSKU}</p>`;
      html += `<table><thead>
                 <tr><th>SKU</th><th>Description</th><th>Quantity</th></tr>
               </thead><tbody>`;

      // Core items
      html += `<tr><td>${invSKU}</td><td>Inverter</td><td>1</td></tr>`;
      html += `<tr><td>${batSKU}</td><td>Battery Module</td><td>${modules}</td></tr>`;

      // Inverter Accessories
      invParts.forEach(p => {
        const meetsCond = p.min_modules == null
                        || (modules >= p.min_modules
                            && (modules <= p.max_modules || p.max_modules === Infinity));
        if (!p.min_modules || meetsCond) {
          const qty = p.per_module ? p.quantity * modules : p.quantity;
          html += `<tr>
                     <td>${p.sku}</td>
                     <td>${p.name}</td>
                     <td>${qty}</td>
                   </tr>`;
        }
      });

      // Battery Required Parts
      batEntry.requiredParts.forEach(p => {
        const qty = p.per_module ? p.quantity * modules : p.quantity;
        html += `<tr>
                   <td>${p.sku}</td>
                   <td>${p.name}</td>
                   <td>${qty}</td>
                 </tr>`;
      });

      // Battery Conditional Parts
      batEntry.conditionalParts.forEach(p => {
        if (modules >= p.min_modules
         && (modules <= p.max_modules || p.max_modules === Infinity)) {
          const qty = p.per_module ? p.quantity * modules : p.quantity;
          html += `<tr>
                     <td>${p.sku}</td>
                     <td>${p.name}</td>
                     <td>${qty}</td>
                   </tr>`;
        }
      });

      html += `</tbody></table>`;
      bomDiv.innerHTML = html;
      document.getElementById('bomSection').style.display = 'block';
    }

    // ——— Close BOM ———
    document.getElementById('closeBOMBtn').addEventListener('click', () => {
      document.getElementById('bomSection').style.display = 'none';
    });
  </script>

// preview.js — prévisualisation des données et test de l'URL

const Preview = (() => {

  async function loadPreview(rid) {
    const el = document.getElementById('preview-container');
    if (!el) return;
    el.innerHTML = '<p class="fr-text--sm fr-text--mention">Chargement de l\'aperçu…</p>';
    try {
      const resp = await fetch(`/api/preview?rid=${encodeURIComponent(rid)}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error);
      renderTable(el, data.data || [], data.meta?.total || 0);
    } catch (e) {
      el.innerHTML = `<p class="fr-text--sm fr-text--mention fr-text--error">Aperçu indisponible : ${esc(e.message)}</p>`;
    }
  }

  function renderTable(el, rows, total) {
    if (!rows.length) {
      el.innerHTML = '<p class="fr-text--sm fr-text--mention">Aucune donnée disponible.</p>';
      return;
    }
    const cols = Object.keys(rows[0]).filter(c => c !== '__id');
    const visibleCols = cols.slice(0, 6);

    el.innerHTML = `
      <p class="fr-text--sm fr-text--mention fr-mb-1w">${total.toLocaleString('fr-FR')} lignes au total — aperçu des 5 premières</p>
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>${visibleCols.map(c => `<th scope="col" title="${esc(c)}">${esc(truncate(c, 18))}</th>`).join('')}
            ${cols.length > 6 ? `<th scope="col" style="color:var(--text-mention-grey)">+${cols.length - 6} col.</th>` : ''}
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => `
              <tr>${visibleCols.map(c => `<td title="${esc(String(row[c] ?? ''))}">${esc(truncate(String(row[c] ?? ''), 30))}</td>`).join('')}
              ${cols.length > 6 ? '<td>…</td>' : ''}
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  async function testQuery(rid, searchCol, searchMode, testValue, filters) {
    const el = document.getElementById('test-results');
    if (!el) return;
    if (!testValue.trim()) {
      el.innerHTML = '<p class="fr-text--sm fr-text--mention">Saisissez une valeur de test.</p>';
      return;
    }

    el.innerHTML = '<p class="fr-text--sm fr-text--mention">Test en cours…</p>';

    const params = new URLSearchParams({
      rid,
      search_col: searchCol,
      search_mode: searchMode,
      value: testValue,
      filters: JSON.stringify(filters),
    });

    try {
      const resp = await fetch(`/api/test-url?${params}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error);

      if (data.total === 0) {
        el.innerHTML = `
          <div class="fr-alert fr-alert--warning fr-alert--sm">
            <p>Aucun résultat pour <strong>${esc(testValue)}</strong>. Vérifiez la valeur ou les filtres.</p>
          </div>`;
        return;
      }

      el.innerHTML = `
        <div class="fr-alert fr-alert--success fr-alert--sm fr-mb-2w">
          <p><strong>${data.total.toLocaleString('fr-FR')} résultat(s)</strong> pour « ${esc(testValue)} »</p>
        </div>`;

      const container = document.createElement('div');
      renderTable(container, data.rows, data.total);
      el.appendChild(container);

    } catch (e) {
      el.innerHTML = `
        <div class="fr-alert fr-alert--error fr-alert--sm">
          <p>Erreur : ${esc(e.message)}</p>
        </div>`;
    }
  }

  async function loadColumnValues(rid, col, targetEl) {
    if (!targetEl) return;
    targetEl.innerHTML = '<span class="fr-text--sm fr-text--mention">Chargement…</span>';
    try {
      const resp = await fetch(`/api/column-values?rid=${encodeURIComponent(rid)}&col=${encodeURIComponent(col)}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error);
      const tops = data.tops || [];
      if (!tops.length) {
        targetEl.innerHTML = '<span class="fr-text--sm fr-text--mention">Aucune valeur fréquente trouvée.</span>';
        return;
      }
      targetEl.innerHTML = `
        <p class="fr-text--sm fr-text--mention fr-mb-1w">${data.nb_distinct} valeurs distinctes — les plus fréquentes :</p>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${tops.slice(0, 10).map(t =>
            `<button class="fr-tag fr-tag--sm" onclick="Filters._injectValue('${esc(String(t.value)).replace(/'/g,"\\'")}')">
              ${esc(String(t.value))} <span style="opacity:0.6;margin-left:4px;">(${t.count})</span>
            </button>`
          ).join('')}
        </div>`;
    } catch (e) {
      targetEl.innerHTML = `<span class="fr-text--sm fr-text--mention">Valeurs non disponibles.</span>`;
    }
  }

  function truncate(str, n) {
    return str.length > n ? str.slice(0, n) + '…' : str;
  }

  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return { loadPreview, testQuery, loadColumnValues };
})();

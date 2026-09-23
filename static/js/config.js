// config.js — sauvegarde et export de la configuration

const Config = (() => {

  function build(rid, searchCol, searchMode, filters, url) {
    return {
      generated_at: new Date().toISOString(),
      rid,
      search_column: searchCol,
      search_mode: searchMode,
      filters: filters.map(f => ({
        column: f.col,
        operator: f.op,
        value: f.val || null,
      })),
      url_template: url,
      base_api: `https://tabular-api.data.gouv.fr/api/resources/${rid}/data/`,
    };
  }

  function exportJson(rid, searchCol, searchMode, filters, url) {
    const cfg = build(rid, searchCol, searchMode, filters, url);
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
    download(blob, 'referentiel-config.json');
  }

  function exportYaml(rid, searchCol, searchMode, filters, url) {
    const cfg = build(rid, searchCol, searchMode, filters, url);
    const yaml = toYaml(cfg);
    const blob = new Blob([yaml], { type: 'text/yaml' });
    download(blob, 'referentiel-config.yaml');
  }

  function toYaml(obj, indent = 0) {
    const pad = '  '.repeat(indent);
    return Object.entries(obj).map(([k, v]) => {
      if (v === null || v === undefined) return `${pad}${k}: ~`;
      if (typeof v === 'string') return `${pad}${k}: "${v.replace(/"/g, '\\"')}"`;
      if (typeof v === 'boolean' || typeof v === 'number') return `${pad}${k}: ${v}`;
      if (Array.isArray(v)) {
        if (!v.length) return `${pad}${k}: []`;
        return `${pad}${k}:\n` + v.map(item =>
          typeof item === 'object'
            ? `${'  '.repeat(indent + 1)}-\n${toYaml(item, indent + 2)}`
            : `${'  '.repeat(indent + 1)}- "${item}"`
        ).join('\n');
      }
      if (typeof v === 'object') return `${pad}${k}:\n${toYaml(v, indent + 1)}`;
      return `${pad}${k}: ${v}`;
    }).join('\n');
  }

  function download(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  function renderSummary(rid, searchCol, searchMode, filters, columns) {
    const el = document.getElementById('config-summary');
    if (!el) return;

    const filterRows = filters.length
      ? filters.map(f => `
          <tr>
            <td><code>${esc(f.col)}</code></td>
            <td><span class="fr-badge fr-badge--sm fr-badge--blue-cumulus">${f.op}</span></td>
            <td>${f.val ? `<code>${esc(f.val)}</code>` : '<em style="opacity:0.5">—</em>'}</td>
          </tr>`).join('')
      : '<tr><td colspan="3" style="color:var(--text-mention-grey);">Aucun filtre</td></tr>';

    el.innerHTML = `
      <dl class="fr-mb-2w">
        <div class="summary-row">
          <dt>rid</dt>
          <dd><code>${esc(rid)}</code></dd>
        </div>
        <div class="summary-row">
          <dt>Colonne de recherche</dt>
          <dd><code>${esc(searchCol)}</code> <span class="fr-badge fr-badge--sm fr-badge--green-emeraude">${searchMode}</span></dd>
        </div>
        <div class="summary-row">
          <dt>Colonnes disponibles</dt>
          <dd>${columns.length} colonnes</dd>
        </div>
      </dl>
      <p class="fr-text--sm fr-text--mention fr-mb-1w">Filtres fixes</p>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Colonne</th><th>Opérateur</th><th>Valeur</th></tr></thead>
          <tbody>${filterRows}</tbody>
        </table>
      </div>`;
  }

  function esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return { exportJson, exportYaml, renderSummary };
})();

// filters.js — gestion des filtres fixes

const Filters = (() => {
  let filters = [];
  let columns = [];
  let currentRid = "";
  let activeValuesTarget = null;

  const OPERATORS = [
    { value: "exact", label: "égal à (exact)" },
    { value: "contains", label: "contient (contains)" },
    { value: "in", label: "dans la liste (in)" },
    { value: "differs", label: "différent de" },
    { value: "isnull", label: "est vide" },
    { value: "isnotnull", label: "n'est pas vide" },
  ];

  function setColumns(cols) {
    columns = cols;
  }
  function setRid(rid) {
    currentRid = rid;
  }

  function add() {
    filters.push({ col: columns[0] || "", op: "exact", val: "" });
    render();
    UrlBuilder.build();
  }

  function remove(i) {
    filters.splice(i, 1);
    render();
    UrlBuilder.build();
  }

  function update(i, field, val) {
    filters[i][field] = val;
    if (field === "op") render();
    UrlBuilder.build();
  }

  function getAll() {
    return filters.filter(
      (f) =>
        f.col && (f.op === "isnull" || f.op === "isnotnull" || f.val.trim()),
    );
  }

  function reset() {
    filters = [];
    render();
  }

  function _injectValue(val) {
    if (activeValuesTarget !== null) {
      filters[activeValuesTarget].val = val;
      render();
      UrlBuilder.build();
    }
  }

  function _showValues(i) {
    activeValuesTarget = i;
    const targetEl = document.getElementById(`filter-values-${i}`);
    if (currentRid && filters[i]?.col) {
      Preview.loadColumnValues(currentRid, filters[i].col, targetEl);
    }
  }

  function render() {
    const container = document.getElementById("filters-container");
    if (!filters.length) {
      container.innerHTML =
        '<p class="fr-text--sm fr-text--mention fr-mb-0">Aucun filtre ajouté.</p>';
      return;
    }

    container.innerHTML =
      `
      <div class="filter-header">
        <span>Colonne</span>
        <span>Opérateur</span>
        <span>Valeur</span>
        <span></span>
      </div>` +
      filters
        .map((f, i) => {
          const noValue = f.op === "isnull" || f.op === "isnotnull";
          const colOptions = columns
            .map(
              (c) =>
                `<option value="${esc(c)}" ${c === f.col ? "selected" : ""}>${esc(c)}</option>`,
            )
            .join("");
          const opOptions = OPERATORS.map(
            (o) =>
              `<option value="${o.value}" ${o.value === f.op ? "selected" : ""}>${o.label}</option>`,
          ).join("");

          return `
      <div class="filter-row" id="filter-row-${i}">
        <select class="fr-select" id="filter-col-${i}" aria-label="Colonne" onchange="Filters._update(${i},'col',this.value)">
          ${colOptions}
        </select>
        <select class="fr-select" id="filter-op-${i}" aria-label="Opérateur" onchange="Filters._update(${i},'op',this.value)">
          ${opOptions}
        </select>
        <div>
          ${
            noValue
              ? '<input class="fr-input" type="text" disabled placeholder="—" />'
              : `<input class="fr-input" type="text" id="filter-val-${i}"
                value="${esc(f.val)}"
                placeholder="${f.op === "in" ? "val1,val2,val3" : "Valeur exacte"}"
                oninput="Filters._update(${i},'val',this.value)" />
               <div id="filter-values-${i}" class="filter-values-hint fr-mt-1w"></div>`
          }
        </div>
        <div class="filter-actions">
          ${
            !noValue
              ? `<button class="fr-btn fr-btn--tertiary fr-btn--sm fr-btn--icon-only fr-icon-search-line"
            title="Valeurs fréquentes" onclick="Filters._showValues(${i})"
            aria-label="Valeurs fréquentes"></button>`
              : ''
          }
          <button class="btn-remove-filter fr-icon-delete-line" title="Supprimer"
            onclick="Filters._remove(${i})" aria-label="Supprimer le filtre ${i + 1}">
          </button>
        </div>
      </div>`;
        })
        .join("");
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  return {
    setColumns,
    setRid,
    add,
    getAll,
    reset,
    _update: update,
    _remove: remove,
    _showValues,
    _injectValue,
  };
})();

function addFilter() {
  Filters.add();
}

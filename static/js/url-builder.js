// url-builder.js — construction et affichage de l'URL finale

const UrlBuilder = (() => {
  let rid = '';
  let searchCol = '';
  let searchMode = 'contains';

  function setRid(r) { rid = r; }
  function setSearchCol(c) { searchCol = c; build(); }
  function setMode(m) { searchMode = m; build(); }

  function encodeCol(col) {
    return encodeURIComponent(col);
  }

  function build() {
    const textarea = document.getElementById('result-url');
    const highlight = document.getElementById('url-highlight');
    if (!textarea || !highlight) return;

    if (!rid || !searchCol) {
      textarea.value = '';
      highlight.innerHTML = '<span style="color:var(--text-mention-grey)">Sélectionnez une colonne de recherche.</span>';
      return;
    }

    const base = `https://tabular-api.data.gouv.fr/api/resources/${rid}/data/`;
    const searchParam = `${encodeCol(searchCol)}__${searchMode}={id}`;

    const filterParts = Filters.getAll().map(f => {
      const k = encodeCol(f.col);
      if (f.op === 'isnull' || f.op === 'isnotnull') return `${k}__${f.op}`;
      return `${k}__${f.op}=${encodeURIComponent(f.val)}`;
    });

    const allParams = [searchParam, ...filterParts].join('&');
    const fullUrl = base + '?' + allParams;

    textarea.value = fullUrl;

    // Highlight coloré
    const filterHtml = filterParts.length
      ? `<span class="part-filter">&amp;${filterParts.join('&amp;')}</span>`
      : '';

    highlight.innerHTML =
      `<span class="part-base">${base}?</span>` +
      `<span class="part-search">${encodeCol(searchCol)}__${searchMode}=</span>` +
      `<span class="part-placeholder">{id}</span>` +
      filterHtml;
  }

  function getUrl() {
    return document.getElementById('result-url')?.value || '';
  }

  function getSearchCol() { return searchCol; }
  function getMode() { return searchMode; }

  return { setRid, setSearchCol, setMode, build, getUrl, getSearchCol, getMode };
})();

// url-builder-json.js — construction d'URLs DN pour le mode JSON (APIs data.gouv.fr / transport)

const UrlBuilderJson = (() => {

  // État courant
  let state = {
    mode: 'detenteur',   // 'detenteur' | 'utilisateur'
    source: 'transport', // 'transport' | 'datagouv'
    org: null,           // { id, name }
    dataset: null,       // { id, title, ... }
    reuse: null,         // { id, title, organization_name }
    step: 1,
  };

  // ── Recherche organisation ──────────────────────────────

  async function searchOrg(q) {
    if (!q || q.length < 2) return [];
    const resp = await fetch(`/api/org-search?q=${encodeURIComponent(q)}`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error);
    return data.results || [];
  }

  function selectOrg(org) {
    state.org = org;
    state.dataset = null;
    renderOrgSelected();
    loadOrgDatasets();
    goJsonStep(2);
  }

  // ── Datasets d'une organisation ─────────────────────────

  async function loadOrgDatasets(q = '') {
    if (!state.org) return;
    const el = document.getElementById('json-datasets-list');
    if (!el) return;
    el.innerHTML = '<p class="fr-text--sm fr-text--mention">Chargement des jeux de données…</p>';
    try {
      const params = new URLSearchParams({ org_id: state.org.id, source: state.source });
      if (q) params.set('q', q);
      const resp = await fetch(`/api/org-datasets?${params}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error);
      renderDatasetList(el, data.datasets || []);
    } catch (e) {
      el.innerHTML = `<div class="fr-alert fr-alert--error fr-alert--sm"><p>${esc(e.message)}</p></div>`;
    }
  }

  function renderDatasetList(el, datasets) {
    if (!datasets.length) {
      el.innerHTML = '<p class="fr-text--sm fr-text--mention">Aucun jeu de données trouvé.</p>';
      return;
    }
    el.innerHTML = datasets.map(d => `
      <div class="json-dataset-item ${state.dataset?.id === d.id ? 'selected' : ''}"
        onclick="UrlBuilderJson._selectDataset(${JSON.stringify(d).replace(/"/g, '&quot;')})">
        <div class="json-dataset-title">${esc(d.title)}</div>
        <div class="json-dataset-meta">
          ${d.last_update ? `Mis à jour : ${formatDate(d.last_update)}` : ''}
          ${d.formats?.length ? ` · ${d.formats.join(', ')}` : ''}
          ${d.modes?.length ? ` · ${d.modes.join(', ')}` : ''}
        </div>
      </div>`).join('');
  }

  function _selectDataset(d) {
    state.dataset = d;
    document.querySelectorAll('.json-dataset-item').forEach(el => el.classList.remove('selected'));
    event.currentTarget.classList.add('selected');
    loadDatasetMeta(d.id);
    goJsonStep(3);
  }

  // ── Métadonnées dataset ─────────────────────────────────

  async function loadDatasetMeta(id) {
    const el = document.getElementById('json-meta-container');
    if (!el) return;
    el.innerHTML = '<p class="fr-text--sm fr-text--mention">Chargement des métadonnées…</p>';
    try {
      const resp = await fetch(`/api/dataset-meta?id=${encodeURIComponent(id)}&source=${state.source}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error);
      state.dataset = { ...state.dataset, ...data };
      renderMeta(el, data);
      buildJsonUrls(data);
    } catch (e) {
      el.innerHTML = `<div class="fr-alert fr-alert--error fr-alert--sm"><p>${esc(e.message)}</p></div>`;
    }
  }

  function renderMeta(el, d) {
    const rows = [
      ['Titre', d.title],
      ['Organisation', d.organization_name],
      ['Dernière mise à jour', formatDate(d.last_update)],
      ['Formats', d.formats],
      d.modes ? ['Modes de transport', d.modes] : null,
      d.networks ? ['Réseaux', d.networks] : null,
      d.has_fares !== null ? ['Tarifaire', d.has_fares ? 'Oui' : 'Non'] : null,
      d.has_pathways !== null ? ['Cheminement piétons', d.has_pathways ? 'Oui' : 'Non'] : null,
      d.has_shapes !== null ? ['Description topographique', d.has_shapes ? 'Oui' : 'Non'] : null,
    ].filter(Boolean);

    el.innerHTML = `
      <dl class="fr-mb-0">
        ${rows.map(([k, v]) => `
          <div class="summary-row">
            <dt>${esc(k)}</dt>
            <dd>${esc(String(v || '—'))}</dd>
          </div>`).join('')}
      </dl>`;
  }

  // ── Réutilisations (mode utilisateur) ──────────────────

  async function searchReuse(q) {
    if (!q || q.length < 2) return [];
    const resp = await fetch(`/api/reuse-search?q=${encodeURIComponent(q)}`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error);
    return data.results || [];
  }

  function selectReuse(reuse) {
    state.reuse = reuse;
    renderReuseSelected();
    loadReuseDatasets(reuse.id);
    goJsonStep(2);
  }

  async function loadReuseDatasets(reuseId) {
    const el = document.getElementById('json-datasets-list');
    if (!el) return;
    el.innerHTML = '<p class="fr-text--sm fr-text--mention">Chargement des jeux de données associés…</p>';
    try {
      const resp = await fetch(`/api/reuse-datasets?id=${encodeURIComponent(reuseId)}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error);
      renderDatasetList(el, data.datasets || []);
    } catch (e) {
      el.innerHTML = `<div class="fr-alert fr-alert--error fr-alert--sm"><p>${esc(e.message)}</p></div>`;
    }
  }

  // ── Construction des URLs DN ────────────────────────────

  function buildJsonUrls(meta) {
    const base = window.location.origin;
    const id = meta.id;
    const src = state.source;

    const urls = {
      'Métadonnées du dataset (pré-remplissage DN)':
        `${base}/api/dataset-meta?id={id}&source=${src}`,
    };

    if (state.mode === 'detenteur') {
      urls['Datasets de l\'organisation (étape 2)'] =
        `${base}/api/org-datasets?org_id={id}&source=${src}`;
      urls['Recherche organisation (étape 1)'] =
        `${base}/api/org-search?q={id}`;
    } else {
      urls['Datasets de la réutilisation (étape 2)'] =
        `${base}/api/reuse-datasets?id={id}`;
      urls['Recherche réutilisation (étape 1)'] =
        `${base}/api/reuse-search?q={id}`;
    }

    renderJsonUrls(urls, meta);
  }

  function renderJsonUrls(urls, meta) {
    const el = document.getElementById('json-url-result');
    if (!el) return;
    el.innerHTML = Object.entries(urls).map(([label, url]) => `
      <div class="fr-mb-3w">
        <p class="fr-text--sm fr-text--mention fr-mb-1w">${esc(label)}</p>
        <div class="url-highlight fr-p-2w">
          <span class="part-base">${esc(url.split('{id}')[0])}</span><span class="part-placeholder">{id}</span><span class="part-base">${esc(url.split('{id}')[1] || '')}</span>
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:6px;">
          <button class="fr-btn fr-btn--secondary fr-btn--sm fr-btn--icon-left fr-icon-clipboard-line"
            onclick="UrlBuilderJson._copyUrl('${url.replace(/'/g,"\\'")}')">Copier</button>
        </div>
      </div>`).join('');

    // Champs DN suggérés
    const el2 = document.getElementById('json-dn-mapping');
    if (!el2) return;
    const mappings = [
      ['$.title', 'Nom du jeu de données'],
      ['$.last_update', 'Dernière mise à jour'],
      ['$.organization_name', 'Organisation'],
      ['$.formats', 'Formats'],
      meta.modes ? ['$.modes', 'Modes de transport'] : null,
      meta.networks ? ['$.networks', 'Réseaux'] : null,
      meta.has_fares !== null ? ['$.has_fares', 'Tarifaire'] : null,
      meta.has_pathways !== null ? ['$.has_pathways', 'Cheminement piétons'] : null,
      meta.has_shapes !== null ? ['$.has_shapes', 'Description topographique'] : null,
    ].filter(Boolean);

    el2.innerHTML = `
      <p class="fr-text--sm fr-text--mention fr-mb-1w">Mapping suggéré pour le champ DN :</p>
      <table class="fr-table fr-table--sm" style="display:table;width:100%">
        <thead><tr><th>Chemin JSON</th><th>Champ DN à remplir</th></tr></thead>
        <tbody>${mappings.map(([path, label]) =>
          `<tr><td><code>${esc(path)}</code></td><td>${esc(label)}</td></tr>`
        ).join('')}</tbody>
      </table>`;
  }

  // ── Navigation interne ──────────────────────────────────

  function goJsonStep(n) {
    state.step = n;
    document.querySelectorAll('.json-step').forEach((el, i) => {
      el.classList.toggle('fr-hidden', i + 1 > n);
    });
    document.getElementById(`json-step-indicator`)?.setAttribute('data-step', n);
  }

  function setMode(mode) {
    state.mode = mode;
    state.org = null;
    state.dataset = null;
    state.reuse = null;
    state.step = 1;
    renderStep1();
  }

  function setSource(source) {
    state.source = source;
    if (state.org) loadOrgDatasets();
  }

  function renderOrgSelected() {
    const el = document.getElementById('json-org-selected');
    if (!el || !state.org) return;
    el.innerHTML = `<div class="fr-alert fr-alert--success fr-alert--sm">
      <p><strong>${esc(state.org.name)}</strong> sélectionnée — ${state.org.nb_datasets} jeux de données</p>
    </div>`;
  }

  function renderReuseSelected() {
    const el = document.getElementById('json-org-selected');
    if (!el || !state.reuse) return;
    el.innerHTML = `<div class="fr-alert fr-alert--success fr-alert--sm">
      <p>Réutilisation <strong>${esc(state.reuse.title)}</strong> (${esc(state.reuse.organization_name)})</p>
    </div>`;
  }

  function renderStep1() {
    const el = document.getElementById('json-step1-content');
    if (!el) return;
    el.innerHTML = state.mode === 'detenteur' ? `
      <div class="fr-input-group">
        <label class="fr-label" for="json-org-search">Rechercher une organisation</label>
        <input class="fr-input" type="search" id="json-org-search"
          placeholder="Tapez le nom de l'organisation (ex : SNCF, Métropole de Lyon…)"
          oninput="UrlBuilderJson._onOrgSearch(this.value)" />
      </div>
      <div id="json-org-results" class="json-results-list fr-mt-1w"></div>
      <div id="json-org-selected" class="fr-mt-2w"></div>` : `
      <div class="fr-input-group">
        <label class="fr-label" for="json-reuse-search">Rechercher une réutilisation</label>
        <input class="fr-input" type="search" id="json-reuse-search"
          placeholder="Tapez le nom de l'organisation ou de la réutilisation"
          oninput="UrlBuilderJson._onReuseSearch(this.value)" />
      </div>
      <div id="json-reuse-results" class="json-results-list fr-mt-1w"></div>
      <div id="json-org-selected" class="fr-mt-2w"></div>`;
  }

  // ── Handlers debounce ───────────────────────────────────

  let _debounceTimer = null;

  async function _onOrgSearch(q) {
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(async () => {
      const el = document.getElementById('json-org-results');
      if (!el) return;
      if (!q || q.length < 2) { el.innerHTML = ''; return; }
      el.innerHTML = '<p class="fr-text--sm fr-text--mention">Recherche…</p>';
      try {
        const results = await searchOrg(q);
        if (!results.length) { el.innerHTML = '<p class="fr-text--sm fr-text--mention">Aucun résultat.</p>'; return; }
        el.innerHTML = results.map(org => `
          <div class="json-result-item" onclick="UrlBuilderJson._selectOrg(${JSON.stringify(org).replace(/"/g,'&quot;')})">
            <strong>${esc(org.name)}</strong>${org.acronym ? ` (${esc(org.acronym)})` : ''}
            <span class="fr-text--sm fr-text--mention" style="margin-left:8px;">${org.nb_datasets} datasets</span>
          </div>`).join('');
      } catch (e) {
        el.innerHTML = `<p class="fr-text--sm fr-text--mention" style="color:var(--text-default-error)">${esc(e.message)}</p>`;
      }
    }, 300);
  }

  async function _onReuseSearch(q) {
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(async () => {
      const el = document.getElementById('json-reuse-results');
      if (!el) return;
      if (!q || q.length < 2) { el.innerHTML = ''; return; }
      el.innerHTML = '<p class="fr-text--sm fr-text--mention">Recherche…</p>';
      try {
        const results = await searchReuse(q);
        if (!results.length) { el.innerHTML = '<p class="fr-text--sm fr-text--mention">Aucun résultat.</p>'; return; }
        el.innerHTML = results.map(r => `
          <div class="json-result-item" onclick="UrlBuilderJson._selectReuse(${JSON.stringify(r).replace(/"/g,'&quot;')})">
            <strong>${esc(r.organization_name)}</strong> — ${esc(r.title)}
            <span class="fr-text--sm fr-text--mention" style="margin-left:8px;">${r.nb_datasets} datasets</span>
          </div>`).join('');
      } catch (e) {
        el.innerHTML = `<p class="fr-text--sm fr-text--mention" style="color:var(--text-default-error)">${esc(e.message)}</p>`;
      }
    }, 300);
  }

  // ── Utilitaires ─────────────────────────────────────────

  function formatDate(str) {
    if (!str) return '';
    try { return new Date(str).toLocaleDateString('fr-FR'); } catch { return str; }
  }

  function esc(str) {
    return String(str ?? '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function _copyUrl(url) {
    navigator.clipboard.writeText(url).then(() => {
      // Feedback bref
      const btns = document.querySelectorAll('#json-url-result .fr-btn--secondary');
      btns.forEach(b => { if (b.onclick?.toString().includes(url.slice(0,20))) b.textContent = 'Copié !'; });
      setTimeout(() => btns.forEach(b => b.innerHTML = '<span class="fr-icon-clipboard-line" aria-hidden="true"></span> Copier'), 2000);
    });
  }

  return {
    setMode, setSource, goJsonStep, renderStep1,
    _selectOrg: selectOrg,
    _selectDataset,
    _selectReuse: selectReuse,
    _onOrgSearch,
    _onReuseSearch,
    _copyUrl,
    loadOrgDatasets,
    getState: () => state,
  };
})();

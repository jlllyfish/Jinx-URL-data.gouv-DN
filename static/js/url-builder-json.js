// url-builder-json.js — générateur d'URL pour les APIs JSON
// (data.gouv.fr datasets / reuses, transport.data.gouv.fr datasets)
// Même parcours que le mode CSV : source → paramètre de recherche + filtres → URL {id}

const JsonUI = (() => {

  // ── Catalogue : champ de la réponse JSON → paramètre d'API ──
  // Pour chaque champ utilisable comme clé, le mode (contains = autosuggestion,
  // exact = correspondance exacte) et la façon de l'interroger :
  // kind 'query' → ?key={id} · 'path' → .../{id}/ · 'suggest' → suggest/?q={id}
  const Q = (key) => ({ kind: 'query', key });
  const PATH = { kind: 'path' };
  const SUGGEST = { kind: 'suggest' };
  const PROXY = { kind: 'proxy' };   // recherche filtrée par l'app (/api/ref/…)

  const SOURCES = {
    datasets: {
      label: 'Jeux de données — data.gouv.fr',
      base: 'https://www.data.gouv.fr/api/1/datasets/',
      fields: {
        '*': { label: 'Texte libre', hint: 'titre, description, mots-clés', contains: Q('q') },
        'title': { contains: SUGGEST, hint: 'recherche dans le titre et le sigle — sans filtres' },
        'acronym': { contains: SUGGEST, hint: 'recherche dans le titre et le sigle — sans filtres' },
        'id': { exact: PATH, hint: 'fiche complète du jeu' },
        'slug': { exact: PATH, hint: 'fiche complète du jeu' },
        'organization.id': { exact: Q('organization') },
        'owner.id': { exact: Q('owner') },
        'tags[]': { exact: Q('tag') },
        'resources[].format': { exact: Q('format') },
        'resources[].schema.name': { exact: Q('schema') },
        'license': { exact: Q('license') },
        'spatial.zones[]': { exact: Q('geozone') },
        'spatial.granularity': { exact: Q('granularity') },
        'badges[].kind': { exact: Q('badge') },
      },
      filters: ['organization', 'tag', 'format', 'license', 'geozone', 'badge', 'organization_badge', 'schema', 'reuse', 'featured', 'sort', 'page_size'],
    },
    reuses: {
      label: 'Réutilisations — data.gouv.fr',
      base: 'https://www.data.gouv.fr/api/1/reuses/',
      fields: {
        '*': { label: 'Texte libre', hint: 'titre, description', contains: Q('q') },
        'title': { contains: SUGGEST, hint: 'recherche dans le titre — sans filtres' },
        'id': { exact: PATH, hint: 'fiche complète, avec les jeux utilisés' },
        'slug': { exact: PATH, hint: 'fiche complète, avec les jeux utilisés' },
        'datasets[].id': { exact: Q('dataset') },
        'organization.id': { exact: Q('organization') },
        'owner.id': { exact: Q('owner') },
        'tags[]': { exact: Q('tag') },
        'type': { exact: Q('type') },
        'topic': { exact: Q('topic') },
      },
      filters: ['organization', 'dataset', 'tag', 'type', 'topic', 'badge', 'organization_badge', 'featured', 'page_size'],
    },
    transport: {
      label: 'Jeux de données — transport.data.gouv.fr',
      base: 'https://transport.data.gouv.fr/api/datasets/',
      fields: {
        'id': { exact: PATH, hint: 'identifiant data.gouv du jeu — fiche complète' },
        'datagouv_id': { exact: PATH, hint: 'identique à id' },
      },
      filters: [],
      note: "L'API transport.data.gouv.fr ne sait chercher que par identifiant. Toute autre colonne, et tout filtre, passe par l'app.",
    },
  };

  const FILTER_DEFS = {
    organization: { label: 'Organisation (id)', lookup: true, placeholder: 'Tapez un nom puis 🔍' },
    tag: { label: 'Mot-clé (tag)', lookup: true, multi: true, placeholder: 'Tapez un mot-clé puis 🔍' },
    format: { label: 'Format de ressource', lookup: true, placeholder: 'csv, json…' },
    license: { label: 'Licence', lookup: true },
    geozone: { label: 'Zone géographique (id)', lookup: true, placeholder: 'Tapez une commune puis 🔍' },
    badge: { label: 'Badge', lookup: true },
    organization_badge: { label: 'Badge de l\'organisation', lookup: true },
    schema: { label: 'Schéma', lookup: true },
    reuse: { label: 'Réutilisation (id)', lookup: true, placeholder: 'Tapez un titre puis 🔍' },
    dataset: { label: 'Jeu de données (id)', lookup: true, placeholder: 'Tapez un titre puis 🔍' },
    type: { label: 'Type de réutilisation', lookup: true },
    topic: { label: 'Thématique', lookup: true },
    featured: { label: 'Mis en avant', choices: [['true', 'oui'], ['false', 'non']] },
    sort: { label: 'Tri', choices: [
      ['-last_update', 'dernière mise à jour ↓'], ['last_update', 'dernière mise à jour ↑'],
      ['-created', 'création ↓'], ['title', 'titre A→Z'], ['-views', 'vues ↓'],
      ['-reuses', 'réutilisations ↓'], ['-followers', 'abonnés ↓'],
    ] },
    page_size: { label: 'Nombre de résultats', choices: [['5', '5'], ['10', '10'], ['20', '20'], ['50', '50']] },
  };

  const state = {
    step: 1,
    source: 'datasets',
    mode: 'contains',
    search: null,        // champ JSON choisi comme clé (ex : 'organization.id')
    sample: [],          // enregistrements d'aperçu
    filters: [],         // [{param, val}]
    lastTest: null,      // dernière réponse JSON de test
    previewUrl: '',      // URL réellement interrogée pour l'aperçu
  };

  // ── Étape 1 : source ─────────────────────────────────────

  function init() {
    renderSources();
    goStep(1);
  }

  function renderSources() {
    const el = document.getElementById('j-source-list');
    el.innerHTML = Object.entries(SOURCES).map(([k, s]) => `
      <div class="api-mode-option ${k === state.source ? 'selected' : ''}" tabindex="0"
        onclick="JsonUI.setSource('${k}')"
        onkeydown="if(event.key==='Enter'||event.key===' ')JsonUI.setSource('${k}')">
        <div class="api-mode-icon fr-icon-code-s-slash-line" aria-hidden="true"></div>
        <div>
          <div class="api-mode-title">${esc(s.label)}</div>
          <div class="api-mode-desc"><code>${esc(s.base)}</code></div>
        </div>
      </div>`).join('');
  }

  function setSource(key) {
    state.source = key;
    state.search = null;
    state.filters = [];
    state.lastTest = null;
    state.sample = [];
    renderSources();
  }

  // Collage d'une URL d'API : détection de la source + reprise des paramètres en filtres
  function parsePastedUrl() {
    const input = document.getElementById('j-url-input').value.trim();
    const status = document.getElementById('j-step1-status');
    if (!input) return true;
    let u;
    try { u = new URL(input); } catch { status.innerHTML = alertHtml('URL invalide.', 'error'); return false; }
    const key = Object.keys(SOURCES).find(k => (u.origin + u.pathname).startsWith(SOURCES[k].base));
    if (!key) {
      status.innerHTML = alertHtml('URL non reconnue. Utilisez une des trois bases proposées.', 'error');
      return false;
    }
    setSource(key);
    const allowed = SOURCES[key].filters;
    const ignored = [];
    u.searchParams.forEach((val, param) => {
      if (allowed.includes(param)) state.filters.push({ param, val });
      else if (param !== 'q' && param !== 'page') ignored.push(param);
    });
    if (ignored.length) {
      status.innerHTML = alertHtml(`Paramètres ignorés (non gérés ou non filtrables) : ${ignored.join(', ')}`, 'warning');
    }
    return true;
  }

  function next1() {
    document.getElementById('j-step1-status').innerHTML = '';
    if (!parsePastedUrl()) return;
    const src = SOURCES[state.source];
    syncModeRadios();
    goStep(2);
    renderSearchParams();
    renderFilters();
    renderResultHint();
    loadPreview();
  }

  // ── Étape 2 : colonne clé + mode ────────────────────────

  function setMode(mode) {
    state.mode = mode;
    if (state.search === '*' && mode === 'exact') state.search = null;
    renderSearchParams();
    renderFilters();
    renderResultHint();
  }

  function syncModeRadios() {
    const src = SOURCES[state.source];
    ['contains', 'exact'].forEach(m => {
      const r = document.getElementById(`j-mode-${m}`);
      if (!r) return;
      r.checked = state.mode === m;
      r.disabled = false;
    });
    const note = document.getElementById('j-source-note');
    note.innerHTML = src.note ? `<div class="fr-notice fr-notice--info fr-mb-2w"><div class="fr-container"><div class="fr-notice__body"><p class="fr-notice__title">${esc(src.note)}</p></div></div></div>` : '';
  }

  // Spécification d'interrogation du champ choisi dans le mode courant
  function currentSearch() {
    if (!state.search) return null;
    const f = SOURCES[state.source].fields[state.search];
    const native = f && f[state.mode];
    if (state.search === '*') return native || null;      // texte libre : natif uniquement
    if (native) {
      const ok = native.kind === 'query' ? !hasFieldFilters() : !activeFilters().length;
      if (ok) return native;
    }
    return PROXY;
  }

  function isProxy() { return currentSearch() === PROXY; }

  // Le proxy sur data.gouv.fr exige un filtre natif (sinon 40 000+ jeux à parcourir)
  function planError() {
    if (isProxy() && state.source !== 'transport' && !nativeFilters().length) {
      return 'Cette colonne passe par l\'app : ajoutez au moins un filtre natif (organisation, tag, format…) pour limiter le volume parcouru.';
    }
    return '';
  }

  // Liste des champs : ceux du catalogue + ceux vus dans l'aperçu
  function allFields() {
    const cat = SOURCES[state.source].fields;
    const seen = state.sample.length ? flattenKeys(state.sample[0]) : [];
    const keys = [...Object.keys(cat)];
    seen.forEach(k => { if (!keys.includes(k)) keys.push(k); });
    return keys;
  }

  function renderSearchParams() {
    const el = document.getElementById('j-search-list');
    const cat = SOURCES[state.source].fields;
    const keys = allFields();
    const usable = keys.filter(k => cat[k] && cat[k][state.mode]);
    const other = keys.filter(k => !usable.includes(k) && !(k === '*' && state.mode === 'exact'));

    const item = (k, enabled) => {
      const def = cat[k] || {};
      const otherMode = state.mode === 'contains' ? 'exact' : 'contains';
      const why = enabled
        ? (def.hint || paramLabel(def[state.mode]))
        : 'via l\'app (proxy)' + (def[otherMode] ? ` · native en ${otherMode === 'exact' ? 'exact' : 'autosuggestion'}` : '');
      return `
      <div class="col-item col-item--2l ${k === state.search ? 'selected' : ''} ${enabled ? '' : 'col-item--proxy'}"
        tabindex="0" onclick="JsonUI.selectSearch('${escJs(k)}')"
        onkeydown="if(event.key==='Enter'||event.key===' ')JsonUI.selectSearch('${escJs(k)}')">
        <span class="fr-icon-arrow-right-s-line" aria-hidden="true" style="font-size:0.75rem;flex-shrink:0;"></span>
        <span class="col-item__txt">
          <strong>${esc(def.label || k)}</strong>
          <small>${esc(why)}</small>
        </span>
      </div>`;
    };

    el.innerHTML = usable.map(k => item(k, true)).join('') +
      (other.length ? `
        <details class="col-grid__more">
          <summary class="fr-text--sm">Autres colonnes, recherche via l'app (${other.length})</summary>
          <div class="col-grid fr-mt-1w">${other.map(k => item(k, false)).join('')}</div>
        </details>` : '');
  }

  function paramLabel(spec) {
    if (!spec) return '';
    if (spec.kind === 'proxy') return 'recherche via l\'app';
    if (spec.kind === 'path') return 'fiche unique';
    if (spec.kind === 'suggest') return 'endpoint suggest';
    return `paramètre ${spec.key}=`;
  }

  function selectSearch(key) {
    state.search = key;
    renderSearchParams();
    renderFilters();
    // Valeur de test pré-remplie depuis l'aperçu
    const input = document.getElementById('j-test-value');
    const ex = state.sample.length ? sampleValue(state.sample[0], key) : '';
    if (input && ex) input.value = state.mode === 'contains' ? String(ex).split(/\s+/)[0] : ex;
    renderResultHint();
  }

  function renderEndpoint() {
    const el = document.getElementById('j-endpoint');
    if (!el) return;
    if (state.step === 1) { el.classList.add('fr-hidden'); return; }
    el.classList.remove('fr-hidden');
    const url = buildUrl();
    const row = (label, content) =>
      `<div class="endpoint-bar__row"><span class="endpoint-bar__label">${label}</span>${content}</div>`;
    const link = (u) => `<a class="endpoint-bar__url" href="${esc(u)}" target="_blank" rel="noopener" title="Ouvrir dans un nouvel onglet">${esc(u)}</a>`;
    el.innerHTML =
      row('API', `<strong>${esc(SOURCES[state.source].label)}</strong>`) +
      (state.previewUrl ? row('Aperçu', link(state.previewUrl)) : '') +
      row('URL générée', url
        ? `<code>${esc(url)}</code>${isProxy() ? ' <span class="fr-badge fr-badge--sm fr-badge--warning">via l\'app</span>' : ''}`
        : `<span class="fr-text--mention">${esc(planError() || 'choisissez la colonne clé')}</span>`);
  }

  function renderResultHint() {
    renderEndpoint();
    const el = document.getElementById('j-search-url');
    if (!el) return;
    const url = buildUrl();
    const err = planError();
    const note = !state.search ? '' : err
      ? alertHtml(err, 'warning')
      : isProxy()
        ? `<p class="fr-text--xs fr-text--mention fr-mt-1w fr-mb-0">Recherche via l'app : l'URL pointe vers ${esc(location.origin)}. Premier appel plus lent (chargement puis cache 10 min).</p>`
        : `<p class="fr-text--xs fr-text--mention fr-mt-1w fr-mb-0">Recherche native par l'API ${state.source === 'transport' ? 'transport.data.gouv.fr' : 'data.gouv.fr'}.</p>`;
    el.innerHTML = (url && !err ? `<div class="url-highlight fr-p-2w fr-mt-2w">${highlightHtml(url)}</div>` : '') + note;
  }

  // Clés aplaties d'un enregistrement : a.b, liste[].champ, tags[]
  function flattenKeys(obj, prefix = '', depth = 0, out = []) {
    if (obj == null || depth > 2) return out;
    Object.entries(obj).forEach(([k, v]) => {
      const path = prefix ? `${prefix}.${k}` : k;
      if (Array.isArray(v)) {
        const first = v.find(x => x != null);
        if (first && typeof first === 'object') flattenKeys(first, `${path}[]`, depth + 1, out);
        else out.push(`${path}[]`);
      } else if (v && typeof v === 'object') {
        flattenKeys(v, path, depth + 1, out);
      } else {
        out.push(path);
      }
    });
    return out;
  }

  function sampleValue(obj, key) {
    if (key === '*') return obj.title || '';
    return getField(obj, key).split(', ')[0];
  }

  // ── Filtres fixes ───────────────────────────────────────


  function isFieldParam(p) { return p.startsWith('field:'); }
  function fieldPath(p) { return p.slice(6); }
  function hasFieldFilters() { return activeFilters().some(f => isFieldParam(f.param)); }
  function nativeFilters() { return activeFilters().filter(f => !isFieldParam(f.param)); }
  function filterLabel(f) {
    if (isFieldParam(f.param)) return `${fieldPath(f.param)} ${f.op === 'contains' ? 'contient' : '='}`;
    return `${FILTER_DEFS[f.param].label} =`;
  }

  function addFilter() {
    const avail = [...SOURCES[state.source].filters, ...allFields().filter(k => k !== '*').map(k => `field:${k}`)];
    if (!avail.length) return;
    const used = state.filters.map(f => f.param);
    const param = avail.find(p => !used.includes(p) || (FILTER_DEFS[p] || {}).multi) || avail[0];
    state.filters.push({ param, op: 'eq', val: '' });
    renderFilters();
  }

  function removeFilter(i) { state.filters.splice(i, 1); renderFilters(); renderResultHint(); loadPreview(); }

  function updateFilter(i, field, val) {
    state.filters[i][field] = val;
    if (field === 'param') { state.filters[i].val = ''; state.filters[i].op = 'eq'; renderFilters(); }
    if (field === 'op') renderFilters();
    renderResultHint();
  }

  function renderFilters() {
    const el = document.getElementById('j-filters-container');
    const card = document.getElementById('j-filters-card');
    const s = currentSearch();
    const nativeAvail = SOURCES[state.source].filters.filter(p =>
      !(s && s.kind === 'query' && s.key === p && !FILTER_DEFS[p].multi));
    const fieldAvail = state.search === '*' ? [] : allFields().filter(k => k !== '*');
    const btn = document.getElementById('j-btn-add-filter');
    card.classList.remove('fr-hidden');
    btn.disabled = !nativeAvail.length && !fieldAvail.length;

    if (!state.filters.length) {
      el.innerHTML = '<p class="fr-text--sm fr-text--mention fr-mb-0">Aucun filtre ajouté.</p>';
      return;
    }

    el.innerHTML = `
      <div class="filter-header"><span>Paramètre</span><span>Opérateur</span><span>Valeur</span><span></span></div>` +
      state.filters.map((f, i) => {
        const isField = isFieldParam(f.param);
        const def = isField ? { lookup: true, placeholder: 'Valeur (🔍 valeurs fréquentes)' } : (FILTER_DEFS[f.param] || {});
        const opt = (v, l) => `<option value="${esc(v)}" ${v === f.param ? 'selected' : ''}>${esc(l)}</option>`;
        const paramOpts =
          (nativeAvail.length ? `<optgroup label="Paramètres de l'API">${nativeAvail.map(p => opt(p, FILTER_DEFS[p].label)).join('')}</optgroup>` : '') +
          (fieldAvail.length ? `<optgroup label="Colonnes (via l'app)">${fieldAvail.map(k => opt(`field:${k}`, k)).join('')}</optgroup>` : '');
        const opSelect = isField
          ? `<select class="fr-select" aria-label="Opérateur" onchange="JsonUI._updateFilter(${i},'op',this.value)">
              <option value="eq" ${f.op !== 'contains' ? 'selected' : ''}>égal à</option>
              <option value="contains" ${f.op === 'contains' ? 'selected' : ''}>contient</option>
             </select>`
          : `<select class="fr-select" aria-label="Opérateur" disabled><option>égal à</option></select>`;
        const valueField = def.choices
          ? `<select class="fr-select" aria-label="Valeur" onchange="JsonUI._updateFilter(${i},'val',this.value);JsonUI.loadPreview()">
              <option value="" ${!f.val ? 'selected' : ''} disabled>Choisir…</option>
              ${def.choices.map(([v, l]) => `<option value="${esc(v)}" ${v === f.val ? 'selected' : ''}>${esc(l)}</option>`).join('')}
             </select>`
          : `<input class="fr-input" type="text" id="j-filter-val-${i}" value="${esc(f.val)}"
              placeholder="${esc(def.placeholder || 'Valeur')}" aria-label="Valeur"
              oninput="JsonUI._updateFilter(${i},'val',this.value)"
              onchange="JsonUI.loadPreview()"
              onkeydown="if(event.key==='Enter'){event.preventDefault();JsonUI._showValues(${i})}" />`;
        return `
        <div class="filter-row">
          <select class="fr-select" aria-label="Paramètre" onchange="JsonUI._updateFilter(${i},'param',this.value)">${paramOpts}</select>
          ${opSelect}
          <div>
            ${valueField}
            <div id="j-filter-values-${i}" class="filter-values-hint fr-mt-1w"></div>
          </div>
          <div class="filter-actions">
            ${def.lookup ? `<button class="fr-btn fr-btn--tertiary fr-btn--sm fr-btn--icon-only fr-icon-search-line"
                title="Valeurs possibles" aria-label="Valeurs possibles" onclick="JsonUI._showValues(${i})"></button>` : ''}
            <button class="btn-remove-filter fr-icon-delete-line" title="Supprimer"
              aria-label="Supprimer le filtre ${i + 1}" onclick="JsonUI._removeFilter(${i})"></button>
          </div>
        </div>`;
      }).join('');
  }

  async function showValues(i) {
    const f = state.filters[i];
    const target = document.getElementById(`j-filter-values-${i}`);
    if (!target) return;
    target.innerHTML = '<span class="fr-text--sm fr-text--mention">Recherche…</span>';
    try {
      let endpoint;
      if (isFieldParam(f.param)) {
        const others = activeFilters().filter(x => x !== f);
        const qs = [`path=${encodeURIComponent(fieldPath(f.param))}`, `q=${encodeURIComponent(f.val || '')}`,
          ...others.filter(x => !isFieldParam(x.param)).map(x => `${x.param}=${encodeURIComponent(x.val)}`),
          ...others.filter(x => isFieldParam(x.param)).map(fieldFilterParam)];
        endpoint = `/api/ref-values/${state.source}?${qs.join('&')}`;
      } else {
        endpoint = `/api/json/values?${new URLSearchParams({ param: f.param, source: state.source, q: f.val || '' })}`;
      }
      const resp = await fetch(endpoint);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error);
      if (!data.values.length) {
        target.innerHTML = `<span class="fr-text--sm fr-text--mention">${esc(data.info || 'Aucune valeur trouvée.')}</span>`;
        return;
      }
      target.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:6px;">` +
        data.values.map(v => `
          <button class="fr-tag fr-tag--sm" type="button" title="${esc(v.value)}"
            onclick="JsonUI._pickValue(${i}, '${escJs(v.value)}')">${esc(v.label)}</button>`).join('') +
        `</div>`;
    } catch (e) {
      target.innerHTML = `<span class="fr-text--sm fr-text--mention">Valeurs non disponibles : ${esc(e.message)}</span>`;
    }
  }

  function pickValue(i, val) {
    state.filters[i].val = val;
    renderFilters();
    renderResultHint();
    loadPreview();
  }

  // ── Construction de l'URL ───────────────────────────────

  function activeFilters() {
    return state.filters.filter(f => f.val !== '' && f.val != null);
  }

  function filterQuery() {
    return nativeFilters().map(f => `${f.param}=${encodeURIComponent(f.val)}`);
  }

  function fieldFilterParam(f) {
    return `${f.op === 'contains' ? 'fc.' : 'f.'}${encodeURIComponent(fieldPath(f.param))}=${encodeURIComponent(f.val)}`;
  }

  function proxyBase() { return `${location.origin}/api/ref/${state.source}`; }

  function proxyParts() {
    return {
      key: [`field=${encodeURIComponent(state.search)}`, `mode=${state.mode}`],
      filters: [...filterQuery().filter(p => !p.startsWith('page_size=') && !p.startsWith('sort=')),
                ...activeFilters().filter(f => isFieldParam(f.param)).map(fieldFilterParam)],
    };
  }

  function buildUrl() {
    const src = SOURCES[state.source];
    const s = currentSearch();
    if (!s || planError()) return '';
    if (s.kind === 'proxy') {
      const { key, filters } = proxyParts();
      return `${proxyBase()}?${[...key, ...filters, 'q={id}'].join('&')}`;
    }
    if (s.kind === 'path') return `${src.base}{id}${state.source === 'transport' ? '' : '/'}`;
    if (s.kind === 'suggest') return `${src.base}suggest/?q={id}`;
    return `${src.base}?${[`${s.key}={id}`, ...filterQuery()].join('&')}`;
  }

  function highlightHtml(url) {
    const src = SOURCES[state.source];
    const s = currentSearch();
    if (s.kind === 'proxy') {
      const { key, filters } = proxyParts();
      return `<span class="part-base">${esc(proxyBase())}?</span>` +
        `<span class="part-search">${esc(key.join('&'))}</span>` +
        (filters.length ? `<span class="part-filter">&amp;${esc(filters.join('&'))}</span>` : '') +
        `<span class="part-search">&amp;q=</span><span class="part-placeholder">{id}</span>`;
    }
    const rest = url.slice(src.base.length);
    if (s.kind !== 'query') {
      const [a, b] = rest.split('{id}');
      return `<span class="part-base">${esc(src.base)}${esc(a)}</span><span class="part-placeholder">{id}</span><span class="part-base">${esc(b || '')}</span>`;
    }
    const filters = filterQuery();
    return `<span class="part-base">${esc(src.base)}?</span>` +
      `<span class="part-search">${esc(s.key)}=</span><span class="part-placeholder">{id}</span>` +
      (filters.length ? `<span class="part-filter">&amp;${esc(filters.join('&'))}</span>` : '');
  }

  // ── Aperçu et test ──────────────────────────────────────

  async function proxyFetch(url) {
    const resp = await fetch(`/api/json/fetch?url=${encodeURIComponent(url)}`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error + (data.detail ? ` — ${data.detail}` : ''));
    return data;
  }

  async function loadPreview() {
    const el = document.getElementById('j-preview-container');
    if (!el || state.step !== 2) return;
    const src = SOURCES[state.source];
    const q = state.source === 'transport' ? [] : [...filterQuery().filter(p => !p.startsWith('page_size=')), 'page_size=5'];
    const url = src.base + (q.length ? `?${q.join('&')}` : '');
    state.previewUrl = url;
    renderEndpoint();
    el.innerHTML = '<p class="fr-text--sm fr-text--mention">Chargement de l\'aperçu…</p>';
    try {
      const data = await proxyFetch(url);
      const rows = records(data.json).slice(0, 5);
      if (rows[0] && typeof rows[0] === 'object') {
        const first = !state.sample.length;
        state.sample = rows;
        if (first) renderSearchParams();
      }
      el.innerHTML = `<p class="fr-text--sm fr-text--mention fr-mb-1w">${data.total != null ? `${Number(data.total).toLocaleString('fr-FR')} résultat(s) avec les filtres actuels — ` : ''}aperçu des 5 premiers</p>` +
        recordsTable(rows);
    } catch (e) {
      el.innerHTML = `<p class="fr-text--sm fr-text--mention">Aperçu indisponible : ${esc(e.message)}</p>`;
    }
  }

  async function runTest() {
    const el = document.getElementById('j-test-results');
    const value = document.getElementById('j-test-value').value.trim();
    const url = buildUrl();
    if (!url) { el.innerHTML = alertHtml('Sélectionnez d\'abord la colonne clé.', 'error'); return; }
    if (!value) { el.innerHTML = '<p class="fr-text--sm fr-text--mention">Saisissez une valeur de test.</p>'; return; }
    el.innerHTML = '<p class="fr-text--sm fr-text--mention">Test en cours…</p>';
    try {
      const target = url.replace('{id}', encodeURIComponent(value));
      let data;
      if (target.startsWith(location.origin)) {
        const resp = await fetch(target);
        const body = await resp.json();
        if (!resp.ok) throw new Error(body.error);
        data = { json: body, total: body.total, complete: body.complete };
      } else {
        data = await proxyFetch(target);
      }
      state.lastTest = data.json;
      const rows = records(data.json);
      if (!rows.length) {
        el.innerHTML = alertHtml(`Aucun résultat pour « ${esc(value)} ».`, 'warning');
        return;
      }
      const n = data.total != null ? data.total : rows.length;
      el.innerHTML = alertHtml(`<strong>${Number(n).toLocaleString('fr-FR')} résultat(s)</strong> pour « ${esc(value)} »` +
        (data.complete === false ? ' — recherche limitée aux 2 000 premiers enregistrements, affinez les filtres natifs' : ''), data.complete === false ? 'warning' : 'success') +
        recordsTable(rows.slice(0, 5));
    } catch (e) {
      state.lastTest = null;
      el.innerHTML = alertHtml(`Erreur : ${esc(e.message)}`, 'error');
    }
  }

  // Normalise : {data:[…]} | […] | {…} → tableau d'objets
  function records(json) {
    if (Array.isArray(json)) return json;
    if (json && Array.isArray(json.data)) return json.data;
    if (json && typeof json === 'object') return [json];
    return [];
  }

  const PREVIEW_COLS = [
    ['Titre', r => r.title || r.name || r.slug],
    ['Identifiant', r => r.id],
    ['Organisation', r => r.organization?.name || r.publisher?.name || r.owner?.last_name || ''],
    ['Mis à jour', r => (r.last_update || r.last_modified || r.updated || r.created_at || '').slice(0, 10)],
  ];

  // Valeur d'un champ « a.b[].c » dans un enregistrement (valeurs de tableau jointes)
  function getField(obj, path) {
    let vals = [obj];
    path.split('.').forEach(part => {
      const isArr = part.endsWith('[]');
      const k = isArr ? part.slice(0, -2) : part;
      vals = vals.flatMap(v => {
        const x = v == null ? undefined : v[k];
        return isArr ? (Array.isArray(x) ? x : []) : [x];
      });
    });
    return vals.filter(v => v != null && typeof v !== 'object').join(', ');
  }

  function recordsTable(rows) {
    if (!rows.length) return '<p class="fr-text--sm fr-text--mention">Aucune donnée.</p>';
    const k = currentSearch() ? state.search : null;
    const hasKey = k && !['title', 'id', '*'].includes(k);
    const cols = hasKey ? [[k, r => getField(r, k)], ...PREVIEW_COLS] : PREVIEW_COLS;
    const cls = (i) => (hasKey && i === 0 ? ' class="is-key"' : '');
    return `<div class="table-scroll"><table class="data-table">
      <thead><tr>${cols.map(([h], i) => `<th scope="col"${cls(i)}>${i === 0 && hasKey ? '<span class="fr-icon-key-line fr-icon--sm" aria-hidden="true"></span> ' : ''}${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${cols.map(([, fn], i) => {
        const v = String(fn(r) ?? '');
        const content = esc(v) || '<span class="fr-text--mention">—</span>';
        return `<td${cls(i)} title="${esc(v)}">${i === 0 ? `<span class="cell-clamp">${content}</span>` : content}</td>`;
      }).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
  }

  // Chemins JSON disponibles pour le mapping DN (à partir du dernier test)
  function jsonPaths(obj, prefix = '', depth = 0, out = []) {
    if (out.length > 60 || depth > 3 || obj == null) return out;
    if (Array.isArray(obj)) {
      if (obj.length) jsonPaths(obj[0], `${prefix}[0]`, depth + 1, out);
      return out;
    }
    if (typeof obj === 'object') {
      Object.entries(obj).forEach(([k, v]) => jsonPaths(v, prefix ? `${prefix}.${k}` : k, depth + 1, out));
      return out;
    }
    out.push([prefix, String(obj)]);
    return out;
  }

  // ── Navigation ──────────────────────────────────────────

  function goStep(n) {
    if (n === 3 && !buildUrl()) {
      document.getElementById('j-step2-alert').innerHTML = alertHtml(planError() || 'Sélectionnez d\'abord la colonne clé.', 'error');
      setTimeout(() => { document.getElementById('j-step2-alert').innerHTML = ''; }, 4000);
      return;
    }
    state.step = n;
    document.querySelectorAll('#mode-json .step-panel').forEach(p => p.classList.add('fr-hidden'));
    document.getElementById(`j-panel-step${n}`).classList.remove('fr-hidden');
    const titles = ['Choisir l\'API', 'Configurer la recherche', 'URL générée'];
    document.getElementById('j-step-current').textContent = n;
    document.getElementById('j-step-title').textContent = titles[n - 1];
    document.getElementById('j-step-progress').style.width = `${(n / 3) * 100}%`;
    renderEndpoint();
    if (n === 3) renderResult();
  }

  function renderResult() {
    const url = buildUrl();
    const s = currentSearch();
    document.getElementById('j-result-url').value = url;
    document.getElementById('j-url-highlight').innerHTML = highlightHtml(url);

    const rows = [
      ['API', SOURCES[state.source].label],
      ['Mode DN', state.mode === 'contains' ? 'Autosuggestion' : 'Correspondance exacte'],
      ['Clé saisie par l\'usager', `${(SOURCES[state.source].fields[state.search] || {}).label || state.search} (${paramLabel(s)})`],
      ['Filtres fixes', activeFilters().length
        ? activeFilters().map(f => `${filterLabel(f)} ${f.val}`).join(' · ') : 'aucun'],
    ];
    document.getElementById('j-config-summary').innerHTML = `<dl>${rows.map(([k, v]) =>
      `<div class="summary-row"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;

    const mapEl = document.getElementById('j-dn-mapping');
    if (!state.lastTest) {
      mapEl.innerHTML = '<p class="fr-text--sm fr-text--mention">Lancez un test à l\'étape 2 pour lister les champs disponibles.</p>';
      return;
    }
    const paths = jsonPaths(state.lastTest);
    mapEl.innerHTML = `<div class="table-scroll"><table class="data-table">
      <thead><tr><th scope="col">Chemin JSON</th><th scope="col">Exemple</th></tr></thead>
      <tbody>${paths.map(([p, v]) => `<tr><td><code>${esc(p)}</code></td><td title="${esc(v)}">${esc(v.slice(0, 80))}</td></tr>`).join('')}</tbody>
    </table></div>`;
  }

  function copyUrl() {
    const url = buildUrl();
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      const a = document.getElementById('j-copy-alert');
      a.classList.remove('fr-hidden');
      setTimeout(() => a.classList.add('fr-hidden'), 3000);
    });
  }

  function testInBrowser() {
    const url = buildUrl();
    const v = document.getElementById('j-test-value').value.trim() || 'test';
    if (url) window.open(url.replace('{id}', encodeURIComponent(v)), '_blank', 'noopener');
  }

  function reset() {
    state.source = 'datasets';
    state.mode = 'contains';
    state.search = null;
    state.filters = [];
    state.lastTest = null;
    state.sample = [];
    state.previewUrl = '';
    ['j-url-input', 'j-test-value'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
    ['j-step1-status', 'j-test-results', 'j-preview-container', 'j-search-url', 'j-filters-container'].forEach(id => { const e = document.getElementById(id); if (e) e.innerHTML = ''; });
    init();
  }

  // ── Helpers ─────────────────────────────────────────────

  function alertHtml(msg, type) {
    return `<div class="fr-alert fr-alert--${type} fr-alert--sm fr-mt-2w"><p>${msg}</p></div>`;
  }
  function esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function escJs(str) {
    return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
  }

  return {
    init, reset, setSource, next1, setMode, selectSearch, goStep,
    addFilter, loadPreview, runTest, copyUrl, testInBrowser,
    _updateFilter: updateFilter, _removeFilter: removeFilter,
    _showValues: showValues, _pickValue: pickValue,
  };
})();

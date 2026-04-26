// ui.js — contrôleur principal : navigation, état, interactions

const UI = (() => {
  let currentStep = 1;
  let columns = [];
  let currentRid = "";
  let colFilter = "";

  // --- Navigation entre étapes ---

  function goStep(n) {
    if (n === 3 && !UrlBuilder.getUrl()) {
      showAlert(
        "step2-alert",
        "Sélectionnez d'abord une colonne de recherche.",
        "error",
      );
      return;
    }
    currentStep = n;
    document
      .querySelectorAll(".step-panel")
      .forEach((p) => p.classList.add("fr-hidden"));
    document.getElementById(`panel-step${n}`).classList.remove("fr-hidden");

    const titles = [
      "Identifier la ressource",
      "Configurer la recherche",
      "URL générée",
    ];
    document.getElementById("step-current").textContent = n;
    document.getElementById("step-title").textContent = titles[n - 1];

    const stepper = document.querySelector(".fr-stepper__steps");
    if (stepper) stepper.setAttribute("data-fr-current-step", n);

    if (n === 3) {
      UrlBuilder.build();
      Config.renderSummary(
        currentRid,
        UrlBuilder.getSearchCol(),
        UrlBuilder.getMode(),
        Filters.getAll(),
        columns,
      );
    }
  }

  // --- Chargement du dataset ---

  async function loadDataset() {
    const input = document.getElementById("dataset-input").value.trim();
    const statusEl = document.getElementById("step1-status");
    const btn = document.getElementById("btn-load");

    if (!input) {
      showStatus(statusEl, "Veuillez saisir une URL ou un rid.", "error");
      return;
    }

    btn.setAttribute("aria-busy", "true");
    btn.setAttribute("aria-disabled", "true");
    btn.textContent = "Chargement…";
    statusEl.innerHTML = "";
    document.getElementById("resource-selector").classList.add("fr-hidden");

    const rid = Api.extractRid(input);
    if (rid) {
      await loadProfile(rid);
    } else {
      const slug = Api.extractSlug(input);
      if (!slug) {
        showStatus(
          statusEl,
          "URL non reconnue. Collez une URL data.gouv.fr ou un rid (UUID).",
          "error",
        );
        resetBtn(btn);
        return;
      }
      await loadDatasetResources(slug);
    }
    resetBtn(btn);
  }

  async function loadDatasetResources(slug) {
    const statusEl = document.getElementById("step1-status");
    try {
      const data = await Api.fetchDataset(slug);
      if (data.resources.length === 1) {
        await loadProfile(data.resources[0].id);
      } else {
        renderResourceSelector(data.resources);
      }
    } catch (e) {
      showStatus(statusEl, e.message, "error");
    }
  }

  function renderResourceSelector(resources) {
    const el = document.getElementById("resource-selector");
    el.classList.remove("fr-hidden");
    el.innerHTML = `
      <div class="fr-select-group">
        <label class="fr-label" for="resource-select">
          Plusieurs ressources disponibles — choisissez-en une
        </label>
        <select class="fr-select" id="resource-select" onchange="UI._onResourceSelect(this.value)">
          <option value="" disabled selected>Sélectionnez une ressource…</option>
          ${resources
            .map(
              (r) =>
                `<option value="${r.id}">${r.title} (${r.format.toUpperCase()})</option>`,
            )
            .join("")}
        </select>
      </div>`;
  }

  async function _onResourceSelect(rid) {
    if (!rid) return;
    const btn = document.getElementById("btn-load");
    btn.setAttribute("aria-busy", "true");
    btn.textContent = "Chargement…";
    await loadProfile(rid);
    resetBtn(btn);
  }

  async function loadProfile(rid) {
    const statusEl = document.getElementById("step1-status");
    try {
      const data = await Api.fetchProfile(rid);
      columns = data.columns;
      currentRid = rid;
      UrlBuilder.setRid(rid);
      Filters.setColumns(columns);
      Filters.setRid(rid);
      Filters.reset();
      colFilter = "";
      renderSearchCols(columns);
      showStatus(
        statusEl,
        `${columns.length} colonnes chargées · rid : ${rid}`,
        "success",
      );
      Preview.loadPreview(rid);
      goStep(2);
    } catch (e) {
      showStatus(statusEl, e.message, "error");
    }
  }

  // --- Colonne de recherche + filtre ---

  function filterCols() {
    colFilter =
      document.getElementById("col-search")?.value.toLowerCase() || "";
    renderSearchCols(columns);
  }

  function renderSearchCols(cols) {
    const el = document.getElementById("search-col-list");
    const filtered = colFilter
      ? cols.filter((c) => c.toLowerCase().includes(colFilter))
      : cols;

    if (!filtered.length) {
      el.innerHTML =
        '<p class="fr-text--sm fr-text--mention">Aucune colonne correspondante.</p>';
      return;
    }

    const selectedCol = UrlBuilder.getSearchCol();
    el.innerHTML = filtered
      .map(
        (c) => `
      <div class="col-item ${c === selectedCol ? "selected" : ""}"
        onclick="UI._selectCol(this, '${escAttr(c)}')" tabindex="0"
        onkeydown="if(event.key==='Enter'||event.key===' ')UI._selectCol(this,'${escAttr(c)}')">
        <span class="fr-icon-arrow-right-s-line" aria-hidden="true" style="font-size:0.75rem;flex-shrink:0;"></span>
        <span title="${escAttr(c)}">${esc(c)}</span>
      </div>`,
      )
      .join("");
  }

  function _selectCol(el, col) {
    document
      .querySelectorAll(".col-item")
      .forEach((x) => x.classList.remove("selected"));
    el.classList.add("selected");
    UrlBuilder.setSearchCol(col);
  }

  // --- Onglets mode (contains / exact) ---

  document.addEventListener("dsfr.tabChange", (e) => {
    const id = e.target?.id;
    if (id === "tab-contains") UrlBuilder.setMode("contains");
    if (id === "tab-exact") UrlBuilder.setMode("exact");
  });

  // --- Test de l'URL ---

  function runTest() {
    const value = document.getElementById("test-value")?.value?.trim();
    Preview.testQuery(
      currentRid,
      UrlBuilder.getSearchCol(),
      UrlBuilder.getMode(),
      value,
      Filters.getAll(),
    );
  }

  // --- Export config ---

  function exportJson() {
    Config.exportJson(
      currentRid,
      UrlBuilder.getSearchCol(),
      UrlBuilder.getMode(),
      Filters.getAll(),
      UrlBuilder.getUrl(),
    );
  }

  function exportYaml() {
    Config.exportYaml(
      currentRid,
      UrlBuilder.getSearchCol(),
      UrlBuilder.getMode(),
      Filters.getAll(),
      UrlBuilder.getUrl(),
    );
  }

  // --- Copie URL ---

  function copyUrl() {
    const url = UrlBuilder.getUrl();
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      const alert = document.getElementById("copy-alert");
      alert.classList.remove("fr-hidden");
      setTimeout(() => alert.classList.add("fr-hidden"), 3000);
    });
  }

  function testUrl() {
    const url = UrlBuilder.getUrl();
    if (!url) return;
    window.open(url.replace("{id}", "test"), "_blank", "noopener");
  }

  function reset() {
    columns = [];
    currentRid = "";
    colFilter = "";
    Filters.reset();
    UrlBuilder.setRid("");
    UrlBuilder.setSearchCol("");
    document.getElementById("dataset-input").value = "";
    document.getElementById("step1-status").innerHTML = "";
    document.getElementById("resource-selector").classList.add("fr-hidden");
    const prev = document.getElementById("preview-container");
    if (prev) prev.innerHTML = "";
    const testInput = document.getElementById("test-value");
    if (testInput) testInput.value = "";
    const testResults = document.getElementById("test-results");
    if (testResults) testResults.innerHTML = "";
    goStep(1);
  }

  // --- Helpers ---

  function showStatus(el, msg, type) {
    el.innerHTML = `
      <div class="fr-alert fr-alert--${type} fr-alert--sm fr-mt-2w">
        <p>${esc(msg)}</p>
      </div>`;
  }

  function showAlert(id, msg, type) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("div");
      el.id = id;
      document
        .getElementById("panel-step2")
        .querySelector(".fr-card")
        ?.appendChild(el);
    }
    el.innerHTML = `<div class="fr-alert fr-alert--${type} fr-alert--sm fr-mt-2w"><p>${esc(msg)}</p></div>`;
    setTimeout(() => (el.innerHTML = ""), 4000);
  }

  function resetBtn(btn) {
    btn.removeAttribute("aria-busy");
    btn.removeAttribute("aria-disabled");
    btn.textContent = "Charger les colonnes";
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escAttr(str) {
    return esc(str).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  return {
    goStep,
    loadDataset,
    copyUrl,
    testUrl,
    reset,
    filterCols,
    runTest,
    exportJson,
    exportYaml,
    _selectCol,
    _onResourceSelect,
  };
})();

// Fonctions globales appelées depuis le HTML
function loadDataset() {
  UI.loadDataset();
}
function goStep(n) {
  UI.goStep(n);
}
function copyUrl() {
  UI.copyUrl();
}
function testUrl() {
  UI.testUrl();
}
function reset() {
  UI.reset();
}
function filterCols() {
  UI.filterCols();
}
function runTest() {
  UI.runTest();
}
function exportJson() {
  UI.exportJson();
}
function exportYaml() {
  UI.exportYaml();
}

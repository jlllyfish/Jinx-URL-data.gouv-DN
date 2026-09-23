from flask import Flask, render_template, request, jsonify
import requests
from urllib.parse import urlparse

app = Flask(__name__)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; referentiel-generator/1.0; +https://github.com)",
    "Accept": "application/json",
}


def tabular_error(r):
    """Traduit les erreurs de l'API tabulaire en message lisible, ou None si OK."""
    if r.status_code == 404:
        return jsonify({"error": "Ressource non disponible sur l'API tabulaire (rid inconnu ou fichier non indexé par data.gouv.fr)."}), 404
    if r.status_code == 410:
        return jsonify({"error": "Ressource supprimée par son producteur (410). Récupérez le nouveau rid sur la page du jeu de données.",
                        "detail": r.text[:500]}), 410
    if r.status_code == 429:
        return jsonify({"error": "Trop de requêtes vers l'API tabulaire, réessayez dans un instant."}), 429
    return None


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/profile")
def get_profile():
    rid = request.args.get("rid", "").strip()
    if not rid:
        return jsonify({"error": "rid manquant"}), 400
    try:
        r = requests.get(
            f"https://tabular-api.data.gouv.fr/api/resources/{rid}/profile/",
            headers=HEADERS,
            timeout=10,
        )
        err = tabular_error(r)
        if err:
            return err
        r.raise_for_status()
        data = r.json()
        columns = data.get("profile", {}).get("header", [])
        return jsonify({"rid": rid, "columns": columns})
    except requests.exceptions.Timeout:
        return jsonify({"error": "Délai dépassé. Réessayez."}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/preview")
def get_preview():
    """Retourne les 5 premières lignes d'une ressource pour prévisualisation."""
    rid = request.args.get("rid", "").strip()
    if not rid:
        return jsonify({"error": "rid manquant"}), 400
    try:
        r = requests.get(
            f"https://tabular-api.data.gouv.fr/api/resources/{rid}/data/?page_size=5",
            headers=HEADERS,
            timeout=10,
        )
        err = tabular_error(r)
        if err:
            return err
        r.raise_for_status()
        return jsonify(r.json())
    except requests.exceptions.Timeout:
        return jsonify({"error": "Délai dépassé."}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/test-url")
def test_url():
    """Teste une URL construite avec une valeur de test fournie."""
    rid = request.args.get("rid", "").strip()
    search_col = request.args.get("search_col", "").strip()
    search_mode = request.args.get("search_mode", "contains").strip()
    test_value = request.args.get("value", "").strip()
    filters_raw = request.args.get("filters", "")

    if not rid or not search_col or not test_value:
        return jsonify({"error": "Paramètres manquants (rid, search_col, value)"}), 400

    import json as json_lib

    params = {f"{search_col}__{search_mode}": test_value}
    if filters_raw:
        try:
            for f in json_lib.loads(filters_raw):
                if f.get("op") in ("isnull", "isnotnull"):
                    params[f"{f['col']}__{f['op']}"] = ""
                elif f.get("val"):
                    params[f"{f['col']}__{f['op']}"] = f["val"]
        except Exception:
            pass

    try:
        r = requests.get(
            f"https://tabular-api.data.gouv.fr/api/resources/{rid}/data/",
            params=params,
            headers=HEADERS,
            timeout=10,
        )
        err = tabular_error(r)
        if err:
            return err
        r.raise_for_status()
        data = r.json()
        return jsonify({
            "total": data.get("meta", {}).get("total", 0),
            "rows": data.get("data", [])[:5],
        })
    except requests.exceptions.Timeout:
        return jsonify({"error": "Délai dépassé."}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/column-values")
def get_column_values():
    """Retourne les valeurs distinctes les plus fréquentes d'une colonne."""
    rid = request.args.get("rid", "").strip()
    col = request.args.get("col", "").strip()
    if not rid or not col:
        return jsonify({"error": "rid et col requis"}), 400
    try:
        # 1. Essai via le profil (rapide)
        r = requests.get(
            f"https://tabular-api.data.gouv.fr/api/resources/{rid}/profile/",
            headers=HEADERS,
            timeout=10,
        )
        r.raise_for_status()
        data = r.json()
        col_profile = data.get("profile", {}).get("profile", {}).get(col, {})
        tops = col_profile.get("tops", [])
        nb_distinct = col_profile.get("nb_distinct", 0)

        # 2. Si tops vide, on interroge /data/ et on déduplique
        if not tops:
            r2 = requests.get(
                f"https://tabular-api.data.gouv.fr/api/resources/{rid}/data/",
                params={"columns": col, "page_size": 200},
                headers=HEADERS,
                timeout=10,
            )
            r2.raise_for_status()
            rows = r2.json().get("data", [])
            counts = {}
            for row in rows:
                val = row.get(col)
                if val is not None and str(val).strip():
                    counts[str(val)] = counts.get(str(val), 0) + 1
            tops = [{"value": v, "count": c}
                    for v, c in sorted(counts.items(), key=lambda x: -x[1])[:15]]
            nb_distinct = len(counts)

        return jsonify({"tops": tops, "nb_distinct": nb_distinct})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/dataset")
def get_dataset():
    slug = request.args.get("slug", "").strip()
    if not slug:
        return jsonify({"error": "slug manquant"}), 400
    try:
        r = requests.get(
            f"https://www.data.gouv.fr/api/1/datasets/{slug}/",
            headers=HEADERS,
            timeout=10,
        )
        if r.status_code == 404:
            return jsonify({"error": "Dataset introuvable."}), 404
        r.raise_for_status()
        data = r.json()
        tabular_formats = {"csv", "xlsx", "xls", "parquet"}
        resources = [
            {"id": res["id"], "title": res.get("title", res["id"]), "format": res.get("format", "").lower()}
            for res in data.get("resources", [])
            if res.get("format", "").lower() in tabular_formats
        ]
        if not resources:
            return jsonify({"error": "Aucune ressource tabulaire (CSV, XLSX, Parquet) trouvée."}), 404
        return jsonify({"resources": resources})
    except requests.exceptions.Timeout:
        return jsonify({"error": "Délai dépassé. Réessayez."}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─────────────────────────────────────────────
# ROUTES JSON — APIs data.gouv.fr / transport.data.gouv.fr
# ─────────────────────────────────────────────

JSON_HOSTS = {"www.data.gouv.fr", "transport.data.gouv.fr"}
DG = "https://www.data.gouv.fr/api/1"

# Référentiels de valeurs pour la loupe des filtres JSON.
# (url, needs_q) — needs_q : l'endpoint exige un texte de recherche.
VALUE_LOOKUPS = {
    "organization": (f"{DG}/organizations/suggest/", True),
    "tag": (f"{DG}/tags/suggest/", True),
    "format": (f"{DG}/datasets/suggest/formats/", True),
    "geozone": (f"{DG}/spatial/zones/suggest/", True),
    "dataset": (f"{DG}/datasets/suggest/", True),
    "reuse": (f"{DG}/reuses/suggest/", True),
    "license": (f"{DG}/datasets/licenses/", False),
    "schema": (f"{DG}/datasets/schemas/", False),
    "organization_badge": (f"{DG}/organizations/badges/", False),
    "badge:datasets": (f"{DG}/datasets/badges/", False),
    "badge:reuses": (f"{DG}/reuses/badges/", False),
    "type": (f"{DG}/reuses/types/", False),
    "topic:reuses": (f"{DG}/reuses/topics/", False),
}


def _normalize_values(data):
    """Transforme les réponses hétérogènes des endpoints en [{value, label}]."""
    out = []
    if isinstance(data, dict) and not isinstance(data.get("data"), list):
        for k, v in data.items():
            out.append({"value": k, "label": v if isinstance(v, str) else k})
        return out
    items = data.get("data", []) if isinstance(data, dict) else data
    for it in items or []:
        if not isinstance(it, dict):
            out.append({"value": str(it), "label": str(it)})
            continue
        value = it.get("id") or it.get("name") or it.get("text") or it.get("kind")
        label = it.get("title") or it.get("name") or it.get("label") or it.get("text") or value
        if it.get("acronym"):
            label = f"{label} ({it['acronym']})"
        if it.get("level"):
            label = f"{label} — {it['level']}"
        if value:
            out.append({"value": str(value), "label": str(label)})
    return out


@app.route("/api/json/fetch")
def json_fetch():
    """Proxy GET restreint aux APIs data.gouv.fr / transport.data.gouv.fr."""
    url = request.args.get("url", "").strip()
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in JSON_HOSTS:
        return jsonify({"error": "URL non autorisée (www.data.gouv.fr ou transport.data.gouv.fr uniquement)."}), 400
    try:
        r = requests.get(url, headers=HEADERS, timeout=25)
        if r.status_code >= 400:
            code = r.status_code if r.status_code in (400, 404, 410, 429) else 502
            return jsonify({
                "error": f"L'API a répondu {r.status_code}.",
                "status": r.status_code,
                "detail": r.text[:400],
            }), code
        data = r.json()
        total, truncated = None, False
        if isinstance(data, list):
            total = len(data)
            truncated = total > 50
            data = data[:50]
        elif isinstance(data, dict) and isinstance(data.get("data"), list):
            total = data.get("total", len(data["data"]))
        return jsonify({"status": r.status_code, "total": total, "truncated": truncated, "json": data})
    except requests.exceptions.Timeout:
        return jsonify({"error": "Délai dépassé. Réessayez."}), 504
    except ValueError:
        return jsonify({"error": "La réponse n'est pas du JSON."}), 502
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/json/values")
def json_values():
    """Valeurs possibles pour un paramètre de filtre (loupe)."""
    param = request.args.get("param", "").strip()
    source = request.args.get("source", "datasets").strip()
    q = request.args.get("q", "").strip()
    lookup = VALUE_LOOKUPS.get(f"{param}:{source}") or VALUE_LOOKUPS.get(param)
    if not lookup:
        return jsonify({"values": [], "info": "Pas de liste de valeurs pour ce paramètre."})
    url, needs_q = lookup
    if needs_q and len(q) < 2:
        return jsonify({"values": [], "info": "Tapez au moins 2 caractères dans « Valeur » puis relancez la loupe."})
    try:
        params = {"q": q, "size": 15} if needs_q else {}
        r = requests.get(url, params=params, headers=HEADERS, timeout=10)
        r.raise_for_status()
        values = _normalize_values(r.json())
        if not needs_q and q:
            ql = q.lower()
            values = [v for v in values if ql in v["label"].lower() or ql in v["value"].lower()]
        return jsonify({"values": values[:30]})
    except requests.exceptions.Timeout:
        return jsonify({"error": "Délai dépassé."}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─────────────────────────────────────────────
# PROXY RÉFÉRENTIEL — recherche sur n'importe quel champ
# URL appelée par Démarche numérique quand l'API source
# ne sait pas filtrer sur le champ choisi.
# ─────────────────────────────────────────────

import time
import unicodedata

REF_SOURCES = {
    "datasets": {
        "base": f"{DG}/datasets/",
        "native": {"organization", "tag", "format", "license", "geozone", "badge",
                   "organization_badge", "schema", "reuse", "featured", "q"},
    },
    "reuses": {
        "base": f"{DG}/reuses/",
        "native": {"organization", "dataset", "tag", "type", "topic", "badge",
                   "organization_badge", "featured", "q"},
    },
    "transport": {
        "base": "https://transport.data.gouv.fr/api/datasets",
        "native": set(),
    },
}
REF_MAX_PAGES = 20        # 20 × 100 = 2 000 enregistrements max par source filtrée
REF_CACHE_TTL = 600       # 10 min
_REF_CACHE = {}


def _norm(v):
    v = unicodedata.normalize("NFKD", str(v))
    return "".join(c for c in v if not unicodedata.combining(c)).casefold().strip()


def _values_at(obj, path):
    """Valeurs scalaires au chemin 'a.b[].c' (les [] parcourent les tableaux)."""
    cur = [obj]
    for part in path.split("."):
        is_arr = part.endswith("[]")
        name = part[:-2] if is_arr else part
        nxt = []
        for o in cur:
            if not isinstance(o, dict) or name not in o:
                continue
            v = o[name]
            if is_arr and isinstance(v, list):
                nxt.extend(v)
            elif not is_arr:
                nxt.append(v)
        cur = nxt
    return [v for v in cur if v is not None and not isinstance(v, (dict, list))]


def _load_records(source, native_params):
    """Charge (et met en cache) les enregistrements de la source, pré-filtrés côté API."""
    cfg = REF_SOURCES[source]
    key = (source, tuple(sorted(native_params)))
    hit = _REF_CACHE.get(key)
    if hit and time.time() - hit[0] < REF_CACHE_TTL:
        return hit[1], hit[2]

    if source == "transport":
        r = requests.get(cfg["base"], headers=HEADERS, timeout=40)
        r.raise_for_status()
        records, complete = r.json(), True
    else:
        records, complete, page = [], True, 1
        while True:
            params = list(native_params) + [("page", page), ("page_size", 100)]
            r = requests.get(cfg["base"], params=params, headers=HEADERS, timeout=20)
            r.raise_for_status()
            d = r.json()
            records.extend(d.get("data", []))
            if not d.get("next_page"):
                break
            page += 1
            if page > REF_MAX_PAGES:
                complete = False
                break

    _REF_CACHE[key] = (time.time(), records, complete)
    return records, complete


def _ref_args(source):
    """Sépare les paramètres natifs (transmis à l'API) des filtres sur champs (f./fc.)."""
    native = [(k, v) for k, v in request.args.items(multi=True)
              if k in REF_SOURCES[source]["native"] and v]
    field_filters = [(k[2:], "eq", v) for k, v in request.args.items(multi=True) if k.startswith("f.") and v]
    field_filters += [(k[3:], "contains", v) for k, v in request.args.items(multi=True) if k.startswith("fc.") and v]
    return native, field_filters


def _match(rec, path, op, value):
    target = _norm(value)
    vals = [_norm(v) for v in _values_at(rec, path)]
    if op == "contains":
        return any(target in v for v in vals)
    return target in vals


@app.route("/api/ref/<source>")
def ref_search(source):
    """Ex : /api/ref/datasets?field=acronym&mode=exact&organization=…&q={id}"""
    if source not in REF_SOURCES:
        return jsonify({"error": "Source inconnue."}), 404
    field = request.args.get("field", "").strip()
    mode = request.args.get("mode", "contains")
    q = request.args.get("q", "").strip()
    limit = min(int(request.args.get("limit", 20) or 20), 100)
    if not field:
        return jsonify({"error": "Paramètre 'field' manquant."}), 400
    native, field_filters = _ref_args(source)
    native = [(k, v) for k, v in native if k != "q"]
    if source != "transport" and not native:
        return jsonify({"error": "Au moins un filtre natif (organization, tag…) est requis pour cette source."}), 400
    if not q:
        return jsonify({"data": [], "total": 0})
    try:
        records, complete = _load_records(source, native)
        recs = [r for r in records if all(_match(r, p, op, v) for p, op, v in field_filters)]
        matches = [r for r in recs if _match(r, field, "contains" if mode == "contains" else "eq", q)]
        return jsonify({"data": matches[:limit], "total": len(matches), "complete": complete})
    except requests.exceptions.Timeout:
        return jsonify({"error": "Délai dépassé côté API source."}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 502


@app.route("/api/ref-values/<source>")
def ref_values(source):
    """Valeurs les plus fréquentes d'un champ (loupe des filtres sur champ)."""
    if source not in REF_SOURCES:
        return jsonify({"error": "Source inconnue."}), 404
    path = request.args.get("path", "").strip()
    q = _norm(request.args.get("q", ""))
    native, field_filters = _ref_args(source)
    native = [(k, v) for k, v in native if k != "q"]
    if source != "transport" and not native:
        return jsonify({"values": [], "info": "Ajoutez d'abord un filtre natif (organisation, tag…)."})
    try:
        records, _ = _load_records(source, native)
        counts = {}
        for r in records:
            if not all(_match(r, p, op, v) for p, op, v in field_filters):
                continue
            for v in set(map(str, _values_at(r, path))):
                if not q or q in _norm(v):
                    counts[v] = counts.get(v, 0) + 1
        top = sorted(counts.items(), key=lambda kv: -kv[1])[:30]
        return jsonify({"values": [{"value": v, "label": f"{v} ({n})"} for v, n in top]})
    except Exception as e:
        return jsonify({"error": str(e)}), 502



if __name__ == "__main__":
    app.run(debug=True)

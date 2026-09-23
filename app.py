from flask import Flask, render_template, request, jsonify
import requests

app = Flask(__name__)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; referentiel-generator/1.0; +https://github.com)",
    "Accept": "application/json",
}


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
        if r.status_code == 404:
            return jsonify({"error": "Ressource introuvable. Vérifiez le rid."}), 404
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
        if r.status_code == 404:
            return jsonify({"error": "Ressource introuvable."}), 404
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
        if r.status_code == 404:
            return jsonify({"error": "Ressource introuvable."}), 404
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
# ROUTES JSON — APIs data.gouv.fr / transport
# ─────────────────────────────────────────────

@app.route("/api/org-search")
def org_search():
    """Recherche d'organisations par nom — autosuggestion étape 1 détenteurs."""
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify({"error": "Paramètre q manquant"}), 400
    try:
        r = requests.get(
            "https://www.data.gouv.fr/api/1/organizations/",
            params={"q": q, "page_size": 10},
            headers=HEADERS,
            timeout=10,
        )
        r.raise_for_status()
        data = r.json()
        results = [
            {
                "id": org["id"],
                "name": org.get("name", ""),
                "acronym": org.get("acronym", ""),
                "description": (org.get("description") or "")[:120],
                "nb_datasets": org.get("metrics", {}).get("datasets", 0),
            }
            for org in data.get("data", [])
        ]
        return jsonify({"results": results, "total": data.get("total", 0)})
    except requests.exceptions.Timeout:
        return jsonify({"error": "Délai dépassé."}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/org-datasets")
def org_datasets():
    """Liste les datasets d'une organisation — étape 2 détenteurs.
    source=datagouv|transport
    """
    org_id = request.args.get("org_id", "").strip()
    source = request.args.get("source", "transport").strip()
    q = request.args.get("q", "").strip()

    if not org_id:
        return jsonify({"error": "org_id manquant"}), 400

    try:
        if source == "transport":
            params = {"publisher_id": org_id, "size": 100}
            if q:
                params["q"] = q
            r = requests.get(
                "https://transport.data.gouv.fr/api/datasets/",
                params=params,
                headers=HEADERS,
                timeout=10,
            )
            r.raise_for_status()
            raw = r.json()
            # transport retourne une liste directe ou {"data": [...]}
            items = raw if isinstance(raw, list) else raw.get("data", [])
            datasets = [
                {
                    "id": d.get("datagouv_id") or d.get("id", ""),
                    "title": d.get("title", ""),
                    "description": (d.get("description") or "")[:120],
                    "last_update": d.get("updated_at") or d.get("last_update", ""),
                    "formats": list({
                        r.get("format", "").upper()
                        for r in d.get("resources", [])
                        if r.get("format")
                    }),
                    "modes": d.get("features", [{}])[0].get("properties", {}).get("modes", [])
                              if d.get("features") else [],
                    "networks": d.get("features", [{}])[0].get("properties", {}).get("network", [])
                               if d.get("features") else [],
                }
                for d in items
            ]
        else:
            # data.gouv.fr
            params = {"organization": org_id, "page_size": 100}
            if q:
                params["q"] = q
            r = requests.get(
                "https://www.data.gouv.fr/api/1/datasets/",
                params=params,
                headers=HEADERS,
                timeout=10,
            )
            r.raise_for_status()
            raw = r.json()
            items = raw.get("data", [])
            datasets = [
                {
                    "id": d.get("id", ""),
                    "title": d.get("title", ""),
                    "description": (d.get("description") or "")[:120],
                    "last_update": d.get("last_modified", ""),
                    "formats": list({
                        res.get("format", "").upper()
                        for res in d.get("resources", [])
                        if res.get("format")
                    }),
                    "modes": [],
                    "networks": [],
                }
                for d in items
            ]

        return jsonify({"datasets": datasets, "total": len(datasets), "source": source})
    except requests.exceptions.Timeout:
        return jsonify({"error": "Délai dépassé."}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/dataset-meta")
def dataset_meta():
    """Métadonnées aplaties d'un dataset — étape 3 détenteurs / pré-remplissage DN.
    source=datagouv|transport
    """
    dataset_id = request.args.get("id", "").strip()
    source = request.args.get("source", "transport").strip()

    if not dataset_id:
        return jsonify({"error": "id manquant"}), 400

    try:
        if source == "transport":
            r = requests.get(
                f"https://transport.data.gouv.fr/api/datasets/{dataset_id}",
                headers=HEADERS,
                timeout=10,
            )
        else:
            r = requests.get(
                f"https://www.data.gouv.fr/api/1/datasets/{dataset_id}/",
                headers=HEADERS,
                timeout=10,
            )

        if r.status_code == 404:
            return jsonify({"error": "Dataset introuvable."}), 404
        r.raise_for_status()
        d = r.json()

        # Propriétés transport (features GeoJSON)
        features_props = {}
        if d.get("features"):
            features_props = d["features"][0].get("properties", {})

        formats = list({
            res.get("format", "").upper()
            for res in d.get("resources", [])
            if res.get("format")
        })

        meta = {
            "id": d.get("datagouv_id") or d.get("id", dataset_id),
            "title": d.get("title", ""),
            "description": (d.get("description") or "")[:200],
            "last_update": d.get("updated_at") or d.get("last_modified", ""),
            "organization_name": (
                d.get("publisher", {}).get("name", "")  # transport
                or (d.get("organization") or {}).get("name", "")  # datagouv
            ),
            "organization_id": (
                d.get("publisher", {}).get("id", "")
                or (d.get("organization") or {}).get("id", "")
            ),
            "formats": ", ".join(formats),
            # Champs transport spécifiques
            "modes": ", ".join(features_props.get("modes", [])),
            "networks": ", ".join(features_props.get("network", []))
                        if isinstance(features_props.get("network"), list)
                        else features_props.get("network", ""),
            "has_fares": features_props.get("has_fares", None),
            "has_pathways": features_props.get("has_pathways", None),
            "has_shapes": features_props.get("has_shapes", None),
            "source": source,
        }
        return jsonify(meta)
    except requests.exceptions.Timeout:
        return jsonify({"error": "Délai dépassé."}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/reuse-search")
def reuse_search():
    """Recherche de réutilisations par nom d'organisation — étape 1 utilisateurs."""
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify({"error": "Paramètre q manquant"}), 400
    try:
        r = requests.get(
            "https://www.data.gouv.fr/api/1/reuses/",
            params={"q": q, "page_size": 20},
            headers=HEADERS,
            timeout=10,
        )
        r.raise_for_status()
        data = r.json()
        results = [
            {
                "id": reuse["id"],
                "title": reuse.get("title", ""),
                "organization_name": (reuse.get("organization") or {}).get("name", "")
                                     or reuse.get("owner", {}).get("fullname", ""),
                "organization_id": (reuse.get("organization") or {}).get("id", ""),
                "organization_class": (reuse.get("organization") or {}).get("class", ""),
                "nb_datasets": len(reuse.get("datasets", [])),
                "description": (reuse.get("description") or "")[:120],
            }
            for reuse in data.get("data", [])
            # Filtrer uniquement les organisations (pas les particuliers)
            if (reuse.get("organization") or {}).get("class") == "Organization"
        ]
        return jsonify({"results": results, "total": len(results)})
    except requests.exceptions.Timeout:
        return jsonify({"error": "Délai dépassé."}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/reuse-datasets")
def reuse_datasets():
    """Datasets associés à une réutilisation — étape 2 utilisateurs."""
    reuse_id = request.args.get("id", "").strip()
    if not reuse_id:
        return jsonify({"error": "id manquant"}), 400
    try:
        r = requests.get(
            f"https://www.data.gouv.fr/api/1/reuses/{reuse_id}/",
            headers=HEADERS,
            timeout=10,
        )
        if r.status_code == 404:
            return jsonify({"error": "Réutilisation introuvable."}), 404
        r.raise_for_status()
        d = r.json()
        datasets = [
            {
                "id": ds.get("id", ""),
                "title": ds.get("title", ""),
                "last_update": ds.get("last_modified", ""),
                "organization": (ds.get("organization") or {}).get("name", ""),
            }
            for ds in d.get("datasets", [])
        ]
        return jsonify({
            "reuse_title": d.get("title", ""),
            "organization": (d.get("organization") or {}).get("name", ""),
            "datasets": datasets,
            "total": len(datasets),
        })
    except requests.exceptions.Timeout:
        return jsonify({"error": "Délai dépassé."}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True)

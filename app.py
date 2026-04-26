import requests
from flask import Flask, jsonify, render_template, request

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
        return jsonify(
            {
                "total": data.get("meta", {}).get("total", 0),
                "rows": data.get("data", [])[:5],
            }
        )
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
            tops = [
                {"value": v, "count": c}
                for v, c in sorted(counts.items(), key=lambda x: -x[1])[:15]
            ]
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
            {
                "id": res["id"],
                "title": res.get("title", res["id"]),
                "format": res.get("format", "").lower(),
            }
            for res in data.get("resources", [])
            if res.get("format", "").lower() in tabular_formats
        ]
        if not resources:
            return jsonify(
                {"error": "Aucune ressource tabulaire (CSV, XLSX, Parquet) trouvée."}
            ), 404
        return jsonify({"resources": resources})
    except requests.exceptions.Timeout:
        return jsonify({"error": "Délai dépassé. Réessayez."}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True)

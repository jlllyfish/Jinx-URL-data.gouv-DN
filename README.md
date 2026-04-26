# Générateur d'URL — API data.gouv.fr × demarches-simplifiees

Outil Flask + DSFR pour générer facilement les URLs à configurer dans le champ **Référentiel avancé** de demarches-simplifiees.fr, à partir de n'importe quel dataset de data.gouv.fr.

## Fonctionnalités

- Chargement automatique des colonnes depuis l'API tabulaire data.gouv.fr
- Support URL complète du dataset ou rid direct
- Sélection multiple de ressources si le dataset en contient plusieurs
- Mode autosuggestion (`__contains`) ou correspondance exacte (`__exact`)
- Ajout de filtres fixes combinés (exact, contains, in, differs, isnull, isnotnull)
- Visualisation colorée de l'URL générée avec le placeholder `{id}`
- Interface DSFR (Système de Design de l'État)

## Installation

```bash
pip install -r requirements.txt
python app.py
```

L'application est accessible sur `http://localhost:5000`.

## Structure

```
app/
├── app.py                  # Routes Flask + proxy API
├── requirements.txt
├── templates/
│   └── index.html          # Template DSFR
└── static/
    ├── css/
    │   └── app.css         # Styles complémentaires
    └── js/
        ├── api.js          # Appels backend (fetch /api/profile, /api/dataset)
        ├── filters.js      # Gestion des filtres fixes
        ├── url-builder.js  # Construction de l'URL finale
        └── ui.js           # Contrôleur UI, navigation, état
```

## Architecture

Le backend Flask agit comme **proxy** vers les APIs data.gouv.fr, évitant les problèmes CORS côté navigateur.

- `GET /api/profile?rid=<rid>` → retourne la liste des colonnes
- `GET /api/dataset?slug=<slug>` → retourne les ressources tabulaires du dataset

## Opérateurs disponibles

| Opérateur    | Usage                        |
|-------------|------------------------------|
| `__exact`   | Valeur exacte                |
| `__contains`| Contient (partiel)           |
| `__in`      | Dans une liste (val1,val2)   |
| `__differs` | Différent de                 |
| `__isnull`  | Valeur vide                  |
| `__isnotnull`| Valeur non vide             |

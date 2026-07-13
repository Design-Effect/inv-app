# Healthy Sounna — Stock (PWA)

Gestionnaire d'inventaire hors-ligne pour Healthy Sounna. Offert par **Fervia**.

## 🚀 Déploiement sur GitHub Pages (5 minutes)

1. Sur github.com → **New repository** → nom : `inv-app` (neutre volontairement — ne pas mettre « Healthy Sounna » dans le nom ni la description du repo) → **Public** → Create.
2. **Add file → Upload files** → glisser TOUS les fichiers de ce dossier → Commit.
3. **Settings → Pages** → Source : `Deploy from a branch` → Branch : `main` / `/ (root)` → Save.
4. Attendre ~2 min. L'URL sera : `https://TON-PSEUDO.github.io/inv-app/`

## 📲 Installation sur le téléphone de Younes

1. Ouvrir l'URL dans **Chrome** (Android).
2. Menu ⋮ → **« Installer l'application »** (ou « Ajouter à l'écran d'accueil »).
3. L'icône HS Stock apparaît comme une vraie app. Fonctionne ensuite **hors-ligne**.

## 📦 Contenu préchargé

- 110 références · 922 articles · 13 227,90 € (inventaire consolidé du 13/07/2026, doublons fusionnés)
- 8 doublons marqués « À vérifier » (badge vert)

## 🛡️ Sauvegarde (IMPORTANT)

Les données vivent dans le navigateur du téléphone. Menu ☰ → **Sauvegarde JSON**
une fois par semaine, fichier à garder dans Drive/WhatsApp. En cas de changement
de téléphone : Menu ☰ → **Restaurer une sauvegarde**.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Interface (charte noir #1A1A1A / crème #FAF6EC / lime #A1BC2E) |
| `app.js` | Logique : recherche, +/−, alertes, export/import |
| `data.js` | Les 123 produits préchargés |
| `sw.js` + `manifest.webmanifest` | Mode hors-ligne + installation PWA |
| `icon-*.png` | Icônes de l'application |

## 🔒 Discrétion

- `robots.txt` + balise `noindex` inclus : le site ne sera pas indexé par Google.
- Ne partager l'URL qu'avec Younes. Ne pas la poster publiquement.
- Les prix d'achat et toutes les modifications restent sur le téléphone (stockage local),
  rien ne remonte jamais vers GitHub.

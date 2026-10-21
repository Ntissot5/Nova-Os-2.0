# Système de design — Nova OS

> Statut : v0.3 « Calme » (D-033), qui remplace la matière verre sur fond coloré (D-018). Source unique des valeurs : `design/tokens.json` (Phase 0). Ce document en est la lecture humaine.

## 1. Principes

1. **Soustraction.** Avant d'ajouter, enlever. Si un élément peut disparaître sans perte de sens, il disparaît.
2. **Un écran = une intention.** Un écran répond à une seule question.
3. **Le fond se tait.** Un gris très clair (noir en sombre), à peine éclairé par l'accent en haut. Deux matières seulement : des cartes pleines et une barre latérale translucide. Jamais de carte dans une carte : dans une carte, les éléments sont des lignes séparées par un filet. La hiérarchie vient de la taille, de la graisse et de l'espace.
11. **Chaque chose a un symbole, pas une lettre.** Un agent ou un département se reconnaît à son symbole sur une pastille arrondie de sa couleur, choisi d'après son nom.
4. **Le texte est l'interface.** Des phrases complètes et humaines plutôt que des tableaux bruts.
5. **Zéro paramètre exposé aux employés.** Le dirigeant construit l'entreprise dans l'Atelier, en phrases (D-031) ; l'installation pose la base dans `company.nix`. Un employé ne règle rien : il travaille.
6. **Accessible d'abord.** Contraste AA minimum, clavier complet, lecteur d'écran, mouvement réduit respecté.
7. **Rien d'invisible.** Tout ce qu'un agent fait se voit, en direct, en phrases ; chaque action répond à « Pourquoi ? ».
8. **Une seule liste de choses à faire.** Validations, dossiers reçus, envois sur le point de partir : tout ce qui attend la personne est au même endroit, et rien d'autre n'y est (D-032).
9. **Tout au clavier.** ⌘K va n'importe où et fait n'importe quoi ; une phrase qui ne correspond à rien devient une question. On n'apprend pas de menus.
10. **Le rare se range.** Ce qu'on règle de temps en temps (connecteurs, coûts, flotte, mesure) vit dans Réglages, pas sur l'écran de travail.

## 2. Tokens

### 2.1 Espacement — grille de 8 px

| Token | Valeur | Usage |
|---|---|---|
| `space-0.5` | 4 px | Seule exception à la grille : icône ↔ texte |
| `space-1` | 8 px | Éléments liés |
| `space-2` | 16 px | Intérieur des composants |
| `space-3` | 24 px | Entre éléments d'un même bloc |
| `space-4` | 32 px | Marge de page (mobile) |
| `space-6` | 48 px | Entre blocs |
| `space-8` | 64 px | Marge de page (bureau), haut d'écran |

Largeur de lecture maximale : 720 px. Tout s'aligne à gauche.

### 2.2 Typographie — la police du système

`-apple-system` / SF Pro sur Mac, Segoe sur Windows, Inter ailleurs (embarquée). Les grands chiffres en version arrondie (`ui-rounded`).

| Token | Taille / interligne | Graisse | Usage |
|---|---|---|---|
| `text-display` | 32 / 38 | 700 | Une fois par écran : le salut ou le titre |
| `text-title` | 20 / 25 | 600 | Nom d'un agent ou d'un département dans sa carte, titre de dialogue |
| `text-headline` | 17 / 22 | 600 | Titre d'une carte |
| `text-body` | 15 / 21 | 400 | Phrases, contenu |
| `text-body-strong` | 15 / 21 | 600 | Le nom ou le chiffre dans une phrase |
| `text-footnote` | 13 / 18 | 400 | Le détail sous une phrase : qui, quand, combien (`text-muted`) |
| `text-caption` | 12 / 16 | 500 | Étiquettes, pastilles, raccourcis |

Interlettrage légèrement resserré sur les grandes tailles (−0,022 em au titre). Chiffres tabulaires pour tout montant ou durée. Interdits : majuscules forcées, italique.

### 2.3 Formes

| Token | Valeur | Usage |
|---|---|---|
| `radius` | 10 px | Champs, lignes choisies, documents |
| `radius-tile` | 18 px | Cartes |
| `radius-panel` | 24 px | Barre latérale ; dialogues à 22 px |
| `radius-full` | 999 px | Boutons, pastilles |
| symbole | 26 % du côté | Pastille arrondie d'un agent ou d'un département (24, 34, 44 ou 64 px) |

### 2.4 Matières et fond

| Token | Clair | Sombre | Usage |
|---|---|---|---|
| `glass-strong` | `#FFFFFF` | `#1C1C1E` | Les cartes et les dialogues : pleins, pour un contraste qui ne dépend de rien |
| `glass-sidebar` | `#FAFAFC` 72 % | `#242426` 70 % | La barre latérale, translucide et floutée (`blur(40px) saturate(180%)`) |
| `glass-shadow` | ombre en trois couches très douces | plus dense | Pose la carte sur le fond, sans bord |
| `separator` | gris 13 % | gris 55 % | Le filet entre deux lignes d'une carte |
| `fill`, `fill-strong` | gris 12 % / 20 % | gris 24 % / 36 % | Boutons secondaires, champ de recherche, piste du contrôle segmenté |
| `backdrop-base` | `#F2F2F5` | `#000000` | Le fond, éclairé en haut par 7 % d'accent |

- **Une carte = un sujet.** Dans une carte : des lignes, un filet entre elles, jamais une deuxième carte. Une sous-carte cliquable (modèle, connecteur) n'a qu'un contour d'un filet.
- **Le fond est le même partout** : fond d'écran du bureau et fond de Nova Home.

### 2.5 Couleur

Neutres fixes, **une seule couleur d'accent par entreprise** (`nova.brand.accent` dans `company.nix`).

| Token | Clair | Sombre |
|---|---|---|
| `bg` | `#FFFFFF` | `#1C1C1E` |
| `surface` | `#F5F5F7` | `#000000` |
| `text` | `#1D1D1F` | `#F5F5F7` |
| `text-muted` | `#6E6E73` | `#98989F` |
| `accent` | défini par l'entreprise | variante éclaircie calculée |
| `positive` | `#1A7F37` | `#30D158` |
| `attention` | `#B35900` | `#FF9F0A` |
| `critical` | `#D70015` | `#FF6961` |
| `badge` | `#D70015` | `#D70015` |

- **L'accent sert à agir et à situer** : le bouton principal, le bouton texte, l'endroit où l'on est dans la barre latérale. Un texte coloré mélange l'accent à la couleur du texte (84 % en clair, 58 % en sombre) pour garder l'AA, quelle que soit la couleur du département.
- Les couleurs d'état sont toujours doublées d'un mot (« en retard », « validé »), jamais seules.
- **Garde-fou au build** : si l'accent choisi n'atteint pas un contraste de 4,5:1 sur `bg` (clair et sombre), la construction de la machine échoue avec un message clair et une proposition de teinte corrigée.

### 2.6 Mouvement

| Token | Valeur | Usage |
|---|---|---|
| `motion-fast` | 140 ms | Survol, appui |
| `motion-base` | 320 ms | Apparition d'une feuille, d'une ligne, changement d'état |
| `ease` | `cubic-bezier(.32, .72, 0, 1)` | La courbe des feuilles d'iOS : part vite, se pose sans rebond |

Un bouton s'enfonce à 96 % quand on appuie. Un dialogue monte de 12 px en grandissant de 97 % à 100 %. Une animation explique un changement d'état, sinon elle n'existe pas. `prefers-reduced-motion` → 0 ms.

### 2.7 Focus et clavier

- Anneau de focus : 3 px d'accent à 55 %, décalé d'1 px, toujours visible au clavier.
- `⌘K` ouvre la palette, `/` ouvre Demander, `Entrée` valide, `Échap` ferme.
- Une action de ligne (« Envoyer à… ») n'apparaît qu'au survol avec une souris ; au clavier et au doigt, elle est toujours là.
- Ordre de tabulation = ordre de lecture. Aucun piège à focus hors dialogue.

## 3. Composants

Quinze composants pour le MVP : quatre pour le cadre, onze pour les contenus. Un besoin non couvert se résout d'abord en composant ceux-là.

| Composant | Rôle | Variantes |
|---|---|---|
| **Barre du haut** | Nom de l'entreprise, champ `/`, compteur de validations, état du poste | — |
| **Dock** | La boîte : Entreprise · apps · agents, groupes séparés par l'espace ; verre flouté | — |
| **Barre latérale** | Dans Nova Home, comme une app du Mac : le nom de l'entreprise, « Aller à… ⌘K », Accueil et Demander, les départements (symbole, nom, compte de ce qui attend, point vert quand un agent travaille), puis Atelier et Réglages. Sur mobile, une barre d'onglets flottante | — |
| **Symbole** | Un agent ou un département : son symbole (jeu dessiné maison, trait de 1,7) en blanc sur une pastille arrondie de sa couleur ; anneau qui respire quand il travaille, pastille rouge chiffrée (validations en attente), cercle creux en pause | plein, doux (modèle) |
| **Phrase** | Une information = une phrase humaine, avec un élément en `text-body-strong` | normale, état (positive/attention/critical) |
| **Carte** | Un sujet dans une carte pleine, titre en `text-headline`, contenu en lignes séparées par un filet | — |
| **Bouton** | Une action, en pilule de 32 px | `principal` (accent, un par carte), `secondaire` (gris), `discret` (texte à l'accent : « Pourquoi ? », « Voir »), icône |
| **Validation** | Demande d'approbation : phrase + aperçu + `Valider` / `Refuser` | — |
| **Chiffre** | Montant ou durée mis en avant, avec sa phrase de contexte | — |
| **Champ** | Saisie, dont la recherche en langage naturel | — |
| **Fil en direct** | Les étapes d'un agent qui apparaissent une à une, en phrases, à côté du document en cours | en cours, terminé, rejoué |
| **Autonomie** | Le choix du niveau d'un agent en trois positions (*Je valide tout* · *l'important* · *Autonome*), avec la phrase qui explique ce qui change. Contrôle segmenté quand il y a la place, liste à coche sinon | — |
| **Annulation** | Compte à rebours d'un envoi : « Envoi dans 1:42 · Annuler » | — |
| **Dialogue** | Une feuille pleine qui se pose sur un voile sombre à 28 % | normal, large |

Exclus volontairement : onglets, tableaux de données, graphiques décoratifs, menus hamburger, toasts. Un compte ne s'affiche que pour ce qui attend la personne.

## 4. Écriture

- Phrases complètes, voix active, tutoiement ou vouvoiement fixé par `company.nix`.
- Le chiffre d'abord : « **3 locataires** en retard, relance prête. »
- Toujours dire ce qui va se passer : « Valider envoie 3 e-mails. »
- Pas de jargon technique visible : jamais « MCP » ni « token ». Les agents portent le nom de leur métier (« Compta », « Relances »).
- Montants en CHF, format suisse : `1'240.50 CHF`. Dates relatives quand elles ont moins de 7 jours (« hier, 16 h 05 »).

## 5. Exemple — espace Entreprise, vue dirigeant (cible Phase 2, gabarit dès Phase 0)

```
Bonjour Noa.                                                  ← text-display

Ce qui s'est passé                                            ← text-title
  12 demandes de locataires triées, 2 transmises au concierge.
  Les loyers d'octobre sont rapprochés : 3 retards.

En ce moment                                                  ← text-title
  Locataires lit le mail de Mme Rossi (fuite, 3e étage)…      ← Fil en direct
  [ Regarder ]

En attente de toi                                             ← text-title
  Relance prête pour 3 locataires (4'860 CHF au total).
  [ Valider ]  [ Voir ]                                       ← Validation

Ce que ça t'a fait gagner                                     ← text-title
  6 h de travail administratif cette semaine.
```

Mis en œuvre en tuiles de verre : *En ce moment* (mise en avant), *En attente de toi*, une tuile par agent, *Ce que ça t'a fait gagner* (avec les 7 derniers jours), *Ce qui s'est passé*.

## 6. Mise en œuvre

- `design/tokens.json` (format W3C Design Tokens) → génère au build Nix les variables CSS de `nova-home` et la feuille de style de `nova-shell` (barre, dock, pastilles).
- Une page `nova-home/#/design` affiche tous les tokens et composants en clair et en sombre : c'est la référence vivante et la base des tests visuels.

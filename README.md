# Dashboard FiveM (ex-GTASUN Staff Manager)

Dashboard **multi-serveurs** de gestion de serveurs FiveM : staff, grades, avertissements, activité (vocal Discord + temps de jeu), bilan IA hebdomadaire.
Un **serveur** du panel = un serveur Discord + (optionnellement) un serveur FiveM. Toutes les données sont rangées par serveur.

Trois dossiers indépendants :

| Dossier | Rôle | Hébergement |
|---|---|---|
| [`site/`](site) | Panel web (Next.js) + base libSQL (Turso en prod). Il possède **toutes les données**, rangées par serveur. | Vercel / un serveur Node |
| [`bot/`](bot) | **Un seul** bot Discord pour tous les serveurs. Il surveille les serveurs Discord enregistrés sur le site et **envoie tout au site par API**. Aucune base de données. | N'importe où (VPS, conteneur…), il suffit qu'il joigne le site |
| [`fivem/`](fivem) | Ressource FiveM qui envoie les sessions de jeu au site (`/api/fivem`), avec le **token propre à son serveur**. | Chaque serveur FiveM |

## Comment ils se parlent
```
Discord (N serveurs) ──► bot ──(HTTPS, Bearer BOT_API_TOKEN, guildId dans chaque message)──► site ──► base
FiveM (1 par serveur) ──(HTTPS, Bearer <token du serveur>)────────────────────────────────► site
```
- Le bot demande au site la liste des serveurs Discord à surveiller (`POST /api/bot/servers`, toutes les 5 min) et ignore les autres.
- Chaque message du bot (`sync`, `member`, `voice`, `playtime`) indique son `guildId` ; le site le range dans le bon serveur. `heartbeat` liste les serveurs où le bot est présent, ce qui permet au panel d'afficher « bot absent » serveur par serveur.
- `tick` (10 min) : nettoyage des sessions FiveM, puis bilan IA du dimanche **de chaque serveur, dans son propre fuseau horaire**.
- Le token d'un agent FiveM désigne son serveur : un agent ne peut jamais écrire dans un autre serveur.

## Qui voit quoi
- **N'importe qui** se connecte avec Discord et **ajoute son serveur** : seulement un serveur Discord où il est propriétaire, administrateur ou a « Gérer le serveur » (limite `MAX_SERVERS_PER_USER`, 5 par défaut). Il en devient propriétaire et la page Configuration le guide (bot, rôles, équipe, FiveM).
- **Administrateurs de la plateforme** (`PANEL_OWNER_IDS` dans `site/.env`, facultatif) : tous les serveurs, tous les droits, sans limite, ajout manuel de n'importe quel serveur Discord.
- **Propriétaires d'un serveur** (le créateur, puis ceux qu'il ajoute) : tous les droits sur ce serveur, ses pages « Configuration » et « Accès & rôles », et peuvent le supprimer (avec toutes ses données).
- **Accès & permissions** (personnes ou rôles Discord) : définis séparément pour chaque serveur.

## Migration depuis la version mono-serveur
Automatique au premier démarrage (migration `013_multi_server`) : toutes les données existantes passent dans le serveur `default`, relié au `DISCORD_GUILD_ID` de l'ancien `.env`. L'ancien `FIVEM_AGENT_TOKEN`, `GRADE_ROLE_MAPPING_JSON` et `DISCORD_STAFF_ROLE_IDS` continuent de fonctionner, **pour ce serveur uniquement**.
Le site et le bot doivent être mis à jour **ensemble** (le format des messages du bot a changé).

## Mise en route locale
```bash
cd site && npm install && npm run dev      # http://localhost:3000
cd bot  && npm install && npm start        # dans un second terminal
```
Voir `site/README.md` et `bot/README.md` pour la configuration détaillée.

## Si le site est arrêté
Le bot réessaie (3 tentatives par message). Les événements vocaux perdus sont rattrapés par la synchronisation complète suivante (au maximum 30 min d'écart), et au redémarrage du bot tout est resynchronisé.

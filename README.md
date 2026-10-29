# Dashboard FiveM (ex-GTASUN Staff Manager)

Dashboard **multi-serveurs** de gestion de serveurs FiveM : staff, grades, avertissements, activité (vocal Discord + temps de jeu), bilan IA hebdomadaire.
Un **serveur** du panel = un serveur Discord + (optionnellement) un serveur FiveM. Toutes les données sont rangées par serveur.

Trois dossiers indépendants :

| Dossier | Rôle | Hébergement |
|---|---|---|
| [`site/`](site) | Panel web (Next.js) + base libSQL (Turso en prod). Il possède **toutes les données**, rangées par serveur. | Vercel / un serveur Node |
| [`bot/`](bot) | **Un seul** bot Discord pour tous les serveurs. Il surveille les serveurs Discord enregistrés sur le site et **envoie tout au site par API**. Aucune base de données. | N'importe où (VPS, conteneur…), il suffit qu'il joigne le site |
| [`fivem/`](fivem) | Ressource `fiverax_agent` : relie chaque serveur FiveM au site (`/api/fivem/agent`) avec le **token propre à son serveur**. Joueurs en direct, carte & vocal, kick, messages, annonces, ressources, console, **anticheat** et **bans**. | Chaque serveur FiveM |

## Comment ils se parlent
```
Discord (N serveurs) ──► bot ──(HTTPS, Bearer BOT_API_TOKEN, guildId dans chaque message)──► site ──► base
FiveM (1 par serveur) ──(HTTPS, Bearer <token du serveur>)────────────────────────────────► site
```
- Le bot demande au site la liste des serveurs Discord à surveiller (`POST /api/bot/servers`, toutes les 5 min) et ignore les autres.
- Chaque message du bot (`sync`, `member`, `voice`, `playtime`) indique son `guildId` ; le site le range dans le bon serveur. `heartbeat` liste les serveurs où le bot est présent, ce qui permet au panel d'afficher « bot absent » serveur par serveur.
- `tick` (10 min) : nettoyage des sessions FiveM, puis bilan IA du dimanche **de chaque serveur, dans son propre fuseau horaire**.
- Le token d'un agent FiveM désigne son serveur : un agent ne peut jamais écrire dans un autre serveur.
- L'agent FiveM **interroge** le site (toutes les 2 s quand quelqu'un regarde les pages « En direct », 8 s sinon) : il envoie connexions, déconnexions, console et résultats, et reçoit les actions en attente. Aucun port à ouvrir, compatible Vercel. Une action non récupérée en 2 min est abandonnée (jamais exécutée en retard). L'ancien endpoint `/api/fivem` (agent 1.x) marche toujours.
- `server.cfg` : `set fiverax_url "https://…"`, `set fiverax_token "fvm_…"`, `add_ace resource.fiverax_agent command allow`, `ensure fiverax_agent` (les lignes exactes sont données dans Configuration). `set fiverax_console 0` refuse la console depuis le panel.
- `add_ace group.admin fiverax.bypass allow` : le staff n'est jamais contrôlé par l'anticheat. `ensure screenshot-basic` (facultatif) : captures d'écran analysées par l'IA. Un script qui téléporte un joueur peut appeler `exports.fiverax_agent:allowTeleport(source, secondes)`.

## Sécurité
- **Anticheat** (agent FiveM, réglé dans Sécurité > Anticheat) : protection des événements (pièges + anti-spam), contrôle des événements du jeu (entités, explosions, armes données/retirées, éjections, particules, projectiles, dégâts), contrôle des joueurs toutes les 2 s (godmode, vie/armure, super saut, invisibilité, multiplicateurs de dégâts, armes et skins interdits, vitesse, téléportation), module client (heartbeat, ressources injectées, spectate, vision). Chaque détection : désactivée / signalée / kick / ban, avec capture d'écran en option.
- **Captures IA** : `screenshot-basic` + le modèle de vision de `AI_BASE_URL` / `AI_API_KEY` (`AI_VISION_MODEL`, par défaut `meta-llama/llama-4-scout-17b-16e-instruct` sur Groq). Gardées 30 jours. Le ban automatique sur l'avis de l'IA seule est désactivé par défaut.
- **Bans** : sur la license, les comptes liés et les identifiants matériels ; appliqués par l'agent à la connexion (liste gardée en cache sur le serveur FiveM si le panel est injoignable).
- **Carte & vocal** : positions toutes les 2 s, qui parle, radio et appels (pma-voice). Fond de carte : `MAP_IMAGE_URL` (atlas GTA V 8192 px), sinon une grille avec les lieux principaux. Aucun audio n'est capté.
- **Anti-raid Discord** (bot, Sécurité > Anti-raid, désactivé par défaut) : lit le journal d'audit en temps réel ; au-delà de ce qu'une règle tolère, annule tout (rôle recréé et redonné à ses membres, salon recréé, rôles remis, membres débannis, webhooks et bots supprimés…) et sanctionne l'auteur (derank / kick / ban ; rôles rendables depuis le panel). Raids de comptes : verrouillage temporaire. Le bot doit être **Administrateur**, avec son rôle **tout en haut**.

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

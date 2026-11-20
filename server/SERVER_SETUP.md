# Server setup (Fabric 1.20.1)

Everything here goes into the **server's** `mods/` folder through the hosting panel (Файлы / Моды or SFTP).
None of these mods go into the launcher's modpack.

> Stop the server before adding or removing mods, then start it again.

## 0. Fabric loader

The server runs Fabric Loader **0.20.1**, the same as the launcher (`pack/pack.config.json`). Nothing to do.
If you ever change one of them, change the other too.

## 1. EasyAuth: passwords for offline accounts

File: `easyauth-mc1.20-3.5.1.jar` (server-only, works on 1.20–1.20.1). Requires Fabric API, which the server already has.

Right now the server is in offline mode with no password plugin, so **anyone can join as any admin**. Do this step first.

### Install

1. Stop the server, put the jar into the server's `mods/`, start it. Its config appears in `config/EasyAuth/`.
2. From now on every player must type `/register <password> <password>` on their first visit and `/login <password>` after that.
   Until they do, they can't move, run commands or see their inventory. The launcher shows these commands on its nickname screen.

### Set up the admins (when the admins are other people)

A nickname belongs to whoever registers it first. So reserve the admins' nicknames yourself, from the panel's console, before anyone else can.
In the panel console, type commands **without** the leading `/`:

1. Register each admin with a temporary password:
   ```
   auth register <AdminNick> <temporary-password>
   ```
   Use the exact nickname with the same capital letters. EasyAuth rejects a different case.
2. Give them operator rights (if they don't have them already):
   ```
   op <AdminNick>
   ```
3. Send each admin their temporary password privately (not in the server chat).
4. The admin joins with the launcher, logs in with `/login <temporary-password>`, then sets their own password:
   ```
   /account changePassword <temporary-password> <new-password>
   ```

Being op doesn't help anyone who isn't logged in: until `/login`, EasyAuth blocks all commands. So a stranger using an admin's nickname gets nothing as long as that nickname is registered.

### Admin commands for later

All of them work from the console (without `/`) or in game for ops (with `/`):

| Command | What it does |
| --- | --- |
| `auth register <nick> <password>` | Register a nickname for someone (reserve it) |
| `auth update <nick> <new-password>` | Reset a player's forgotten password |
| `auth remove <nick>` | Delete a player's registration, so the nickname can be registered again |
| `auth list` | List registered players |
| `auth reload` | Reload the EasyAuth config after editing it |
| `auth setSpawn` | Set where players wait until they log in (stand there in game first) |

Players can use `/account changePassword <old> <new>` themselves.

### Regular players

Regular players' nicknames can also be taken by whoever registers them first. To prevent that during the switch, either:
- turn the whitelist on for a few days (`whitelist on`, then `whitelist add <nick>` for each member) until everyone has registered; or
- reserve their nicknames the same way as the admins' (`auth register <nick> <temporary-password>`) and hand out the passwords.

### Config

Look through the files in `config/EasyAuth/` once. The useful options are:
   - keep premium auto-login off (the server is offline-mode, so there are no premium accounts to trust);
   - how long a player can stay without logging in before being kicked, and how many wrong passwords are allowed;
   - hiding the player's position and inventory until they log in (keep it on);
   - sessions: how long a player who just logged in can rejoin from the same IP without typing the password again.
## 2. AntiXray: hides ores from X-ray mods and X-ray resource packs

**Do not use `AntiXray-4.2.0.jar`.** It is a Paper/Bukkit plugin (`plugin.yml`, package `me.invv.antixray`) and will not load on a Fabric server.

Use the Fabric mod instead: **AntiXray by DrexHD**, version `1.4.6+1.20.1`
(https://modrinth.com/mod/anti-xray, file `antixray-fabric-1.4.6+1.20.1.jar`, SHA-1 `57a48f285530096e10185756e10c62804a8def92`).
Put it only on the server, never in the launcher pack.

It works like Paper's built-in anti-xray: the server stops sending the real position of ores that are not exposed to air,
so X-ray mods, X-ray resource packs and shader tricks only see stone or fake ores.
After the first start, open its config file in `config/` and:
- enable it for the overworld and the nether;
- the engine mode that fills hidden areas with fake ores is the strongest; the mode that only hides ores is cheaper on CPU;
- add modded ores (for example Tech Reborn ores) to the list of hidden blocks.

## 3. Ledger: see who mined or took what, and roll it back

Optional but very useful against griefing and for spotting X-rayers (a player who digs straight lines to diamonds).
Modrinth: https://modrinth.com/mod/ledger, version `1.3.18-backport` for 1.20.1.
It needs **Fabric Language Kotlin** (https://modrinth.com/mod/fabric-language-kotlin) on the server.

Useful commands: `/ledger inspect` (click blocks to see their history), `/ledger search action:block-break object:diamond_ore`, `/ledger rollback ...`.

## 4. JourneyMap

Cave mapping and the mob/player radar are left on for everyone (owner's decision).
If that ever needs to change: as an op, open JourneyMap in game → Options → **Server Admin**, and turn them off for regular players.

## 5. Launcher-only joining (later)

The launcher removes unknown mods before every start. A player can still skip the launcher and start the game some other way (for example, with TLauncher and their own mods).
To close that gap, a small companion mod will be added to both the server and the pack. The launcher gives the game a one-time token, the mod sends it when joining, and the server kicks anyone who can't show a valid token.
This is planned as the next step and is not installed yet.

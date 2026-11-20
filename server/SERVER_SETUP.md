# Server setup (Fabric 1.20.1)

Everything here goes into the **server's** `mods/` folder through the hosting panel (Файлы / Моды or SFTP).
None of these mods go into the launcher's modpack.

> Stop the server before adding or removing mods, then start it again.

## 0. Fabric loader

The server runs Fabric Loader **0.20.1**, the same as the launcher (`pack/pack.config.json`). Nothing to do.
If you ever change one of them, change the other too.

## 1. EasyAuth: passwords for offline accounts

File: `easyauth-mc1.20-3.4.4.jar` (https://modrinth.com/mod/easyauth/version/3.4.4, server-only, works on 1.20–1.20.1). Requires Fabric API, which the server already has.

> **Use 3.4.4, not 3.5.1.** EasyAuth 3.5.1 for 1.20 is compiled for Java 25 (its mixin config asks for `JAVA_25`), so on the server's Java 21 it crashes at startup with a Mixin error. 3.4.4 needs only Java 21 and has the same commands.

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

## 5. Vasya Family Guard: only the launcher may join

The launcher removes unknown mods before every start, but a player could skip it and start the game some other way
(for example TLauncher with their own mods). The **Vasya Family Guard** mod closes that gap.
It is our own mod (source in `guard-mod/`), file `vasyafamily-guard-1.0.0.jar`. The same jar goes on the server and into the launcher pack.

How it works: every time the launcher starts the game it passes a one-time proof, signed with a secret that only the launcher build and the server know.
It covers the nickname, the launch time and the exact list of mod jars the launcher installed.
When someone joins, the server asks the game for that proof and also checks that every loaded mod jar is in the current pack.
Anyone who can't answer is disconnected with a message, in English, Ukrainian and Russian, that tells them to use the launcher:
- no guard mod or no proof (vanilla, TLauncher, another launcher): "Please join through the Vasya Family launcher";
- mods were added, removed or are outdated: "Your mods don't match the server's modpack...";
- the game was started more than `maxSessionHours` ago, or the PC clock is far off: "Your game session has expired...".

> **Limits.** This stops casual bypassing, not a determined cheater. The secret is inside every copy of the launcher,
> so someone who unpacks the launcher, or rewrites this mod to lie about its mod list, can get past it.
> EasyAuth, AntiXray and Ledger are still needed.

### Install

Do it in this order, or every player gets kicked:

1. Stop the server, put `vasyafamily-guard-1.0.0.jar` into the server's `mods/`, and start it.
   It creates `config/vasyafamily-guard.properties` with **`enabled=false`** and a random `secret=`.
2. Copy the `secret` value. On the PC that builds the launcher, save it in a file named `guard.secret` next to `package.json`
   (the file is git-ignored; never commit it or post it in chat). Another option is to set the `VF_GUARD_SECRET` environment variable.
3. Make sure the guard jar is in the launcher pack (`pack/mods`, then `npm run pack:build`; see the README) and release a new launcher version.
   The build prints a `[guard]` warning if it can't find the secret.
4. When players have the new launcher (it updates itself), set `enabled=true` in the config and run `vfguard reload` in the console.

If you ever change the secret, you have to release a new launcher with the same value.

### Config: `config/vasyafamily-guard.properties`

| Setting | Meaning |
| --- | --- |
| `enabled` | `true` turns the check on. With `false`, everyone can join as before. |
| `secret` | Shared secret; must match the launcher build exactly. |
| `bypass` | Nicknames that may join without the launcher, comma-separated, case doesn't matter. Use it for admins who play from another launcher. EasyAuth still asks them for their password, so a stranger can't use a bypassed nickname. |
| `maxSessionHours` | How long one launch may keep joining (default 12). Reconnecting, or going from singleplayer to the server, reuses the same launch. |
| `checkMods` | `true` (default): every loaded jar must be in the current pack, and no required pack mod may be missing. Optional mods (Sodium, Iris...) may be on or off. |
| `manifestUrls` | Where the pack list is read from (the same `pack/manifest.json` the launcher uses). It is re-read every `manifestRefreshMinutes`. The last good copy is cached in `config/vasyafamily-guard-manifest.json`. |
| `manifestFile` | A local manifest file to use instead of the URLs. |
| `launcherUrl` | Download link shown in the kick message. |

If the pack list can't be downloaded and there is no cached copy, the server still checks the launcher proof but not the mod list, and writes a warning in the log.

### Commands (console without `/`, or ops with `/`)

| Command | What it does |
| --- | --- |
| `vfguard status` | Shows whether the check is on, the pack version it knows, and the bypass list |
| `vfguard reload` | Re-reads the config and the pack list after you edit them |

Every join is logged, for example `Steve passed the launcher check (pack 20261120T..., 38 mods)`
or `Kicked Steve: loaded mods differ from what the launcher installed`, so you can see why someone couldn't join.

### When the pack changes

Nothing to do on the server. Push the new `pack/manifest.json`, and within `manifestRefreshMinutes` the server starts asking for the new pack.
Players who are still in a game started before the update are asked to restart through the launcher the next time they join.
Players who are online stay online.

If the guard mod itself changes, put the new jar on the server too.

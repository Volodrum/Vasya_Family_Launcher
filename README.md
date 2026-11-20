# Vasya Family Launcher

Launcher for the Vasya Family Minecraft server (Fabric 1.20.1).

- Installs Java 17, Minecraft and Fabric automatically. Players don't need to install anything else.
- Keeps the modpack in sync. Before every start the `mods` folder is made to match the pack exactly: new mods are downloaded, changed ones are re-downloaded, and any unknown jars are deleted.
- Optional client-side mods (Sodium, Iris, sounds, animations...) can be switched on and off in Settings.
- Nickname login for offline accounts. Passwords are handled on the server by EasyAuth (`/register`, `/login`).
- Launcher-only joining: with the Vasya Family Guard mod on the server, a game started some other way (TLauncher with its own mods, an outdated pack) is turned away. See [below](#launcher-only-joining-vasya-family-guard).
- English / Українська / Русский.
- Updates itself from GitHub Releases.

## Development

```powershell
npm install
npm run dev
```

`npm run typecheck` checks types. `npm run build` builds into `out/`.

Environment variables for development (ignored in the installed app):

| Variable | Effect |
| --- | --- |
| `VF_MANIFEST_FILE` | Use a local manifest file instead of the one on GitHub, e.g. `pack/manifest.json`. |
| `VF_DATA_DIR` | Keep settings and game files in this folder instead of `%APPDATA%\.vasyafamily`. |
| `VF_AUTOPLAY=1` | Start the install and launch as soon as the window opens, and log progress to the console. |
| `VF_AUTOPLAY=server` | The same, but join the first server in the manifest. Use only with a test `VF_MANIFEST_FILE` whose server list points at a local server. |
| `VF_GUARD_SECRET` | Shared secret for the guard mod, read **at build time** (also by `npm run dev`). See below. |

## Updating the modpack

1. Put the exact client mod jars into `pack/mods/` (this folder is not committed). Leave out server-only mods.
2. Run `npm run pack:build`. The tool:
   - reads every jar's `fabric.mod.json`;
   - finds each file on Modrinth by its SHA-1 and uses Modrinth's CDN link;
   - marks client-only mods as optional (on by default) and records dependencies between them (Iris needs Sodium);
   - lists the mods that are not on Modrinth.
3. If some mods are not on Modrinth, run `npm run pack:build -- --upload`. They are uploaded (named by SHA-1) to the `pack-files` pre-release of this repo with the `gh` CLI.
   To use another source instead (a CurseForge CDN link, your own website), add it in `pack/pack.config.json`:
   ```json
   "overrides": { "ftblibrary": { "downloads": ["https://example.com/ftb-library-fabric-2001.2.13.jar"] } }
   ```
   `downloads` replaces the automatic source, and `extraDownloads` adds fallbacks.

   **Getting a CurseForge link:** open the mod's **Files** tab on curseforge.com, filter by 1.20.1 / Fabric, and click the row whose file name matches yours exactly.
   The details box shows a **FILE ID**, e.g. `9544819`. The direct link is
   `https://mediafilez.forgecdn.net/files/<first 4 digits>/<the rest, without leading zeros>/<file name>`,
   so `9544819` + `cultivaria-1.20.1-fabric-3.1.1-1.20.1.jar` → `https://mediafilez.forgecdn.net/files/9544/819/cultivaria-1.20.1-fabric-3.1.1-1.20.1.jar`.
   A wrong link can't slip through: `pack:build` doesn't download it, but every launcher rejects a file whose SHA-1 doesn't match. The launcher tries the links in order and always checks the SHA-1, whatever the source.
4. Commit and push `pack/manifest.json`. Every launcher picks it up the next time someone presses Play.

`pack/pack.config.json` also holds the Minecraft / Fabric versions, the server addresses shown in the launcher, and per-mod overrides (`optional`, `default`, `name`).

## Releasing a new launcher version

1. Bump `version` in `package.json`. Make sure `guard.secret` is present (see below), or the build warns that it can't join a guarded server.
2. Publish it. If the `gh` CLI is logged in, it can supply the token:
   ```powershell
   $env:GH_TOKEN = (gh auth token); npm run release
   ```
   (Or use a GitHub token with `repo` access instead of `(gh auth token)`.)
   This builds `dist/VasyaFamilyLauncher-Setup-<version>.exe` and publishes it with `latest.yml` to GitHub Releases.

**How players get updates:** the launcher checks GitHub Releases at start-up and every 2 hours, downloads a newer
version in the background, and shows a toast with a Restart button. If the player ignores it, the update installs the
next time the launcher closes. Only full releases count; the `pack-files` pre-release is ignored.
Each release needs a higher `version` than the last one, or installed launchers won't see it.

Modpack changes don't need a launcher release: pushing `pack/manifest.json` is enough.

`npm run dist` builds the installer without publishing.

## Launcher-only joining (Vasya Family Guard)

`guard-mod/` is a small Fabric mod (client and server in one jar) that lets only games started by this launcher join the server.

1. On every start the launcher signs the nickname, the launch time and the SHA-1 list of the mod jars it installed, using a shared secret,
   and passes the result to the game as `-Dvasyafamily.guard=...` (`src/main/guard.ts`). Only a key derived from the secret reaches the game, not the secret itself.
2. When a player joins, the server sends a random challenge over the login channel. The mod answers with the signed data and the SHA-1s of the jars it actually loaded.
3. The server checks the signature for that nickname, the age of the launch, that the loaded jars are the ones the launcher signed, and that they all belong to the current `pack/manifest.json`.
   Otherwise it disconnects the player with a message in English, Ukrainian and Russian.

**The secret.** The launcher reads it at build time from `VF_GUARD_SECRET` or from the file `guard.secret` next to `package.json`. The file is git-ignored; never commit it.
It must equal `secret` in the server's `config/vasyafamily-guard.properties`, which the server generates on first start.
Without a secret the launcher still works, but a server with the guard turned on refuses it.

**Limits.** This blocks casual bypassing only. Anyone can unpack the launcher and find the secret, or rebuild the mod to report a fake mod list.

**Building the mod** (needs JDK 17 or newer; the Gradle wrapper downloads everything else):

```powershell
cd guard-mod; .gradlew.bat build
```

The jar is `guard-mod/build/libs/vasyafamily-guard-<version>.jar`. The build is reproducible: the same source gives the same SHA-1.
Copy it into `pack/mods/` and run `npm run pack:build`. It isn't on Modrinth, so it needs `npm run pack:build -- --upload` to put it on the `pack-files` release.
Put the same jar on the server. Server setup and the rollout order are in [server/SERVER_SETUP.md](server/SERVER_SETUP.md#5-vasya-family-guard-only-the-launcher-may-join).

## Where things live on a player's PC

| Path | Contents |
| --- | --- |
| `%APPDATA%\.vasyafamily\instance` | Game folder: mods, config, saves, resource packs, shader packs, screenshots, logs |
| `%APPDATA%\.vasyafamily\minecraft` | Minecraft versions, libraries, assets |
| `%APPDATA%\.vasyafamily\java` | Java runtime |
| `%APPDATA%\Vasya Family Launcher\settings.json` | Launcher settings |

## Server

See [server/SERVER_SETUP.md](server/SERVER_SETUP.md) for EasyAuth, AntiXray, Ledger, JourneyMap and the Vasya Family Guard mod.

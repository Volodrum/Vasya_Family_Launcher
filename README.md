# Vasya Family Launcher

Launcher for the Vasya Family Minecraft server (Fabric 1.20.1).

- Installs Java 17, Minecraft and Fabric automatically. Players don't need to install anything else.
- Keeps the modpack in sync. Before every start the `mods` folder is made to match the pack exactly: new mods are downloaded, changed ones are re-downloaded, and any unknown jars are deleted.
- Optional client-side mods (Sodium, Iris, sounds, animations...) can be switched on and off in Settings.
- Nickname login for offline accounts. Passwords are handled on the server by EasyAuth (`/register`, `/login`).
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

1. Bump `version` in `package.json`.
2. Create a GitHub token with `repo` access and run:
   ```powershell
   $env:GH_TOKEN = "<token>"; npm run release
   ```
   This builds `dist/VasyaFamilyLauncher-Setup-<version>.exe` and publishes it with `latest.yml` to GitHub Releases. Installed launchers download it in the background and offer to restart.

`npm run dist` builds the installer without publishing.

## Where things live on a player's PC

| Path | Contents |
| --- | --- |
| `%APPDATA%\.vasyafamily\instance` | Game folder: mods, config, saves, resource packs, shader packs, screenshots, logs |
| `%APPDATA%\.vasyafamily\minecraft` | Minecraft versions, libraries, assets |
| `%APPDATA%\.vasyafamily\java` | Java runtime |
| `%APPDATA%\Vasya Family Launcher\settings.json` | Launcher settings |

## Server

See [server/SERVER_SETUP.md](server/SERVER_SETUP.md) for EasyAuth, AntiXray, Ledger and JourneyMap.

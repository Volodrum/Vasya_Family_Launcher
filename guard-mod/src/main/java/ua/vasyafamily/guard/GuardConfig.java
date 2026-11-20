package ua.vasyafamily.guard;

import java.io.IOException;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Properties;
import java.util.Set;
import java.util.TreeSet;

/** Server settings in config/vasyafamily-guard.properties. Created with a fresh random secret on first start. */
public final class GuardConfig {
    public static final String FILE_NAME = "vasyafamily-guard.properties";

    public final boolean enabled;
    public final String secret;
    /** Lower-case nicknames that may join without the launcher (admins on other launchers). */
    public final Set<String> bypass;
    public final long maxSessionSeconds;
    public final boolean checkMods;
    public final List<String> manifestUrls;
    public final String manifestFile;
    public final int manifestRefreshMinutes;
    public final String launcherUrl;

    private GuardConfig(Properties p) {
        enabled = Boolean.parseBoolean(p.getProperty("enabled", "false").trim());
        secret = p.getProperty("secret", "").trim();
        bypass = new TreeSet<>();
        for (String s : p.getProperty("bypass", "").split("[,\\s]+")) if (!s.isBlank()) bypass.add(s.trim().toLowerCase(Locale.ROOT));
        maxSessionSeconds = Math.round(parseDouble(p.getProperty("maxSessionHours"), 12) * 3600);
        checkMods = Boolean.parseBoolean(p.getProperty("checkMods", "true").trim());
        manifestUrls = new ArrayList<>();
        for (String s : p.getProperty("manifestUrls", "").split("[,\\s]+")) if (!s.isBlank()) manifestUrls.add(s.trim());
        manifestFile = p.getProperty("manifestFile", "").trim();
        manifestRefreshMinutes = (int) Math.max(1, parseDouble(p.getProperty("manifestRefreshMinutes"), 10));
        launcherUrl = p.getProperty("launcherUrl", "").trim();
    }

    private static double parseDouble(String s, double def) {
        try {
            return s == null ? def : Double.parseDouble(s.trim());
        } catch (NumberFormatException e) {
            return def;
        }
    }

    public boolean isBypassed(String nickname) {
        return nickname != null && bypass.contains(nickname.toLowerCase(Locale.ROOT));
    }

    public static GuardConfig load(Path configDir) throws IOException {
        Path file = configDir.resolve(FILE_NAME);
        if (!Files.exists(file)) {
            Files.createDirectories(configDir);
            Files.writeString(file, template(), StandardCharsets.UTF_8);
        }
        Properties p = new Properties();
        try (Reader r = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            p.load(r);
        }
        return new GuardConfig(p);
    }

    private static String template() {
        byte[] secret = new byte[32];
        new SecureRandom().nextBytes(secret);
        return """
                # Vasya Family Guard: only players who started the game with the Vasya Family launcher may join.
                # After editing this file run `vfguard reload` in the console (or /vfguard reload as an op).
                #
                # This blocks casual bypassing (TLauncher with extra mods, a copied mods folder, an outdated pack).
                # It is not unbreakable: the secret is inside every copy of the launcher.

                # Turn the check on only after the launcher build that knows the secret below is released
                # and this mod is in the launcher pack, otherwise everyone is kicked.
                enabled=false

                # Shared secret. The launcher must be built with exactly the same value
                # (environment variable VF_GUARD_SECRET or the file guard.secret next to package.json).
                # Generated randomly on first start. Keep it private; changing it needs a new launcher release.
                secret=%s

                # Nicknames that may join without the launcher, e.g. admins using another launcher.
                # Comma-separated, not case-sensitive. EasyAuth still asks them for their password.
                bypass=

                # How long a game started by the launcher may keep (re)joining, in hours.
                # Reconnecting or going from singleplayer to the server reuses the same launch.
                maxSessionHours=12

                # Check that every loaded mod jar is in the current launcher pack and none of the required ones is missing.
                checkMods=true

                # Where to read the pack list (the same manifest the launcher uses). Tried in order.
                manifestUrls=https://raw.githubusercontent.com/Volodrum/Vasya_Family_Launcher/main/pack/manifest.json,https://cdn.jsdelivr.net/gh/Volodrum/Vasya_Family_Launcher@main/pack/manifest.json
                # A local manifest file instead of the URLs (path relative to the server folder). Leave empty to use the URLs.
                manifestFile=
                manifestRefreshMinutes=10

                # Shown to kicked players.
                launcherUrl=https://github.com/Volodrum/Vasya_Family_Launcher/releases/latest
                """.formatted(HexFormat.of().formatHex(secret));
    }
}

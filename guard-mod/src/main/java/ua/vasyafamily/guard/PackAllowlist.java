package ua.vasyafamily.guard;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * The mod jars the current launcher pack allows, read from the same pack/manifest.json the launcher uses.
 * Every mod in it is allowed; mods that are not optional are required.
 */
public final class PackAllowlist {
    private static final Logger LOG = LoggerFactory.getLogger("VasyaFamilyGuard");

    /** sha1 -> display name for every allowed jar, and the subset that is required. */
    public record Snapshot(String packVersion, String source, Map<String, String> allowed, Set<String> required) {}

    private final Path cacheFile;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.NORMAL).build();
    private volatile Snapshot current;

    public PackAllowlist(Path configDir) {
        this.cacheFile = configDir.resolve("vasyafamily-guard-manifest.json");
    }

    public Snapshot current() {
        return current;
    }

    /** Reloads the manifest; keeps the previous list (or the cached copy) if every source fails. Blocking. */
    public synchronized void refresh(GuardConfig config) {
        StringBuilder errors = new StringBuilder();
        if (!config.manifestFile.isEmpty()) {
            try {
                set(parse(Files.readString(Path.of(config.manifestFile), StandardCharsets.UTF_8), config.manifestFile));
                return;
            } catch (Exception e) {
                errors.append(config.manifestFile).append(": ").append(e.getMessage()).append("; ");
            }
        } else {
            for (String url : config.manifestUrls) {
                try {
                    HttpRequest req = HttpRequest.newBuilder(URI.create(url + (url.contains("?") ? "&" : "?") + "t=" + System.currentTimeMillis()))
                            .timeout(Duration.ofSeconds(20)).header("User-Agent", "VasyaFamilyGuard").GET().build();
                    HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
                    if (res.statusCode() != 200) throw new IllegalStateException("HTTP " + res.statusCode());
                    Snapshot s = parse(res.body(), url);
                    set(s);
                    try {
                        Files.writeString(cacheFile, res.body(), StandardCharsets.UTF_8);
                    } catch (Exception e) {
                        LOG.warn("Could not cache the pack manifest: {}", e.getMessage());
                    }
                    return;
                } catch (Exception e) {
                    errors.append(URI.create(url).getHost()).append(": ").append(e.getMessage()).append("; ");
                }
            }
        }
        if (current == null && Files.exists(cacheFile)) {
            try {
                set(parse(Files.readString(cacheFile, StandardCharsets.UTF_8), "cached copy " + cacheFile.getFileName()));
            } catch (Exception e) {
                errors.append("cache: ").append(e.getMessage());
            }
        }
        LOG.warn("Could not load the pack manifest ({}){}", errors,
                current == null ? ". Mod lists are NOT checked until it loads (launcher tokens still are)." : ", keeping pack " + current.packVersion());
    }

    private void set(Snapshot s) {
        Snapshot old = current;
        current = s;
        if (old == null || !old.packVersion().equals(s.packVersion())) {
            LOG.info("Pack {} from {}: {} mods allowed, {} required", s.packVersion(), s.source(), s.allowed().size(), s.required().size());
        }
    }

    static Snapshot parse(String json, String source) {
        JsonObject root = JsonParser.parseString(json).getAsJsonObject();
        Map<String, String> allowed = new HashMap<>();
        Set<String> required = new java.util.HashSet<>();
        for (JsonElement el : root.getAsJsonArray("mods")) {
            JsonObject m = el.getAsJsonObject();
            String sha1 = m.get("sha1").getAsString().toLowerCase();
            if (!sha1.matches("[0-9a-f]{40}")) throw new IllegalArgumentException("bad sha1 in manifest");
            allowed.put(sha1, m.has("file") ? m.get("file").getAsString() : sha1);
            if (!(m.has("optional") && m.get("optional").getAsBoolean())) required.add(sha1);
        }
        if (allowed.isEmpty()) throw new IllegalArgumentException("manifest lists no mods");
        String version = root.has("packVersion") ? root.get("packVersion").getAsString() : "?";
        return new Snapshot(version, source, Map.copyOf(allowed), Set.copyOf(required));
    }
}

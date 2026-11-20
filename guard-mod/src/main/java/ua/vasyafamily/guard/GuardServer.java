package ua.vasyafamily.guard;

import static net.minecraft.server.command.CommandManager.literal;

import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import net.fabricmc.api.DedicatedServerModInitializer;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.networking.v1.PacketByteBufs;
import net.fabricmc.fabric.api.networking.v1.ServerLoginConnectionEvents;
import net.fabricmc.fabric.api.networking.v1.ServerLoginNetworking;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.network.PacketByteBuf;
import net.minecraft.server.network.ServerLoginNetworkHandler;
import net.minecraft.server.command.ServerCommandSource;
import net.minecraft.text.Text;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import ua.vasyafamily.guard.mixin.ServerLoginNetworkHandlerAccessor;

/**
 * Dedicated server side: asks every joining player for the launcher's proof and kicks those who can't show one.
 * Not active in singleplayer or on LAN worlds.
 */
public final class GuardServer implements DedicatedServerModInitializer {
    private static final Logger LOG = LoggerFactory.getLogger("VasyaFamilyGuard");
    /** A launch time this far in the future is accepted, to tolerate PC clocks that are a bit off. */
    private static final long CLOCK_SKEW_SECONDS = 10 * 60;

    private final SecureRandom random = new SecureRandom();
    private final Path configDir = FabricLoader.getInstance().getConfigDir();
    private final PackAllowlist pack = new PackAllowlist(configDir);
    private volatile GuardConfig config;
    private ScheduledExecutorService scheduler;
    private volatile long lastRefresh;
    /** Players whose answer we are waiting for. */
    private final Map<ServerLoginNetworkHandler, Pending> pending = new ConcurrentHashMap<>();

    private record Pending(GuardConfig config, String name, byte[] nonce) {}

    @Override
    public void onInitializeServer() {
        loadConfig();

        ServerLifecycleEvents.SERVER_STARTED.register(server -> {
            scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
                Thread t = new Thread(r, "VasyaFamilyGuard manifest");
                t.setDaemon(true);
                return t;
            });
            scheduler.scheduleWithFixedDelay(this::refreshIfDue, 0, 1, TimeUnit.MINUTES);
        });
        ServerLifecycleEvents.SERVER_STOPPING.register(server -> {
            if (scheduler != null) scheduler.shutdownNow();
        });

        ServerLoginConnectionEvents.QUERY_START.register((handler, server, sender, synchronizer) -> {
            GuardConfig cfg = config;
            if (!cfg.enabled) return;
            String name = nickname(handler);
            if (cfg.secret.isEmpty()) {
                LOG.error("enabled=true but secret is empty in {}; letting {} in unchecked", GuardConfig.FILE_NAME, name);
                return;
            }
            if (cfg.isBypassed(name)) {
                LOG.info("{} is on the bypass list, not checking the launcher", name);
                return;
            }
            byte[] nonce = new byte[GuardProtocol.NONCE_BYTES];
            random.nextBytes(nonce);
            pending.put(handler, new Pending(cfg, name, nonce));
            PacketByteBuf buf = PacketByteBufs.create();
            buf.writeVarInt(GuardProtocol.PROTOCOL);
            buf.writeByteArray(nonce);
            sender.sendPacket(GuardProtocol.CHANNEL, buf);
        });

        // Fabric API 0.92 (1.20.1) only routes login answers to global receivers, so the per-connection
        // state lives in the pending map instead of a per-connection receiver.
        ServerLoginNetworking.registerGlobalReceiver(GuardProtocol.CHANNEL, (srv, handler, understood, buf, sync, responseSender) -> {
            Pending p = pending.remove(handler);
            if (p == null) return;
            Verdict v;
            try {
                v = understood ? verify(p.config, p.name, p.nonce, buf)
                        : Verdict.reject(Messages.Kind.USE_LAUNCHER, "no Vasya Family Guard mod (vanilla or another launcher)");
            } catch (RuntimeException e) {
                v = Verdict.reject(Messages.Kind.USE_LAUNCHER, "malformed answer: " + e);
            }
            if (v.kind == null) {
                LOG.info("{} passed the launcher check ({})", p.name, v.detail);
            } else {
                LOG.warn("Kicked {}: {}", p.name, v.detail);
                handler.disconnect(Messages.kick(v.kind, p.config.launcherUrl));
            }
        });
        ServerLoginConnectionEvents.DISCONNECT.register((handler, server) -> pending.remove(handler));

        CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) -> dispatcher.register(
                literal("vfguard").requires(src -> src.hasPermissionLevel(3))
                        .then(literal("status").executes(ctx -> {
                            status(ctx.getSource());
                            return 1;
                        }))
                        .then(literal("reload").executes(ctx -> {
                            loadConfig();
                            lastRefresh = 0;
                            if (scheduler != null) scheduler.execute(this::refreshIfDue);
                            ctx.getSource().sendFeedback(() -> Text.literal("Vasya Family Guard: config reloaded, re-reading the pack manifest."), true);
                            return 1;
                        }))));
    }

    private void loadConfig() {
        try {
            config = GuardConfig.load(configDir);
        } catch (Exception e) {
            if (config == null) throw new IllegalStateException("Could not read config/" + GuardConfig.FILE_NAME, e);
            LOG.error("Could not reload config/{}, keeping the old settings: {}", GuardConfig.FILE_NAME, e.toString());
            return;
        }
        LOG.info("Launcher check is {}{}", config.enabled ? "ON" : "OFF (enabled=false in config/" + GuardConfig.FILE_NAME + ")",
                config.bypass.isEmpty() ? "" : ", bypass: " + String.join(", ", config.bypass));
    }

    private void refreshIfDue() {
        GuardConfig cfg = config;
        if (!cfg.enabled || !cfg.checkMods) return;
        long now = System.currentTimeMillis();
        if (now - lastRefresh < cfg.manifestRefreshMinutes * 60_000L) return;
        lastRefresh = now;
        try {
            pack.refresh(cfg);
        } catch (RuntimeException e) {
            LOG.warn("Pack manifest refresh failed: {}", e.toString());
        }
    }

    private void status(ServerCommandSource src) {
        GuardConfig cfg = config;
        PackAllowlist.Snapshot s = pack.current();
        src.sendFeedback(() -> Text.literal("Vasya Family Guard: " + (cfg.enabled ? "ON" : "OFF")
                + (cfg.secret.isEmpty() ? ", NO SECRET SET" : "")
                + ", sessions up to " + cfg.maxSessionSeconds / 3600.0 + " h"
                + ", mod check " + (!cfg.checkMods ? "off" : s == null ? "waiting for the manifest" : "pack " + s.packVersion() + " (" + s.allowed().size() + " mods)")
                + ", bypass: " + (cfg.bypass.isEmpty() ? "nobody" : String.join(", ", cfg.bypass))), false);
    }

    private static String nickname(ServerLoginNetworkHandler handler) {
        var profile = ((ServerLoginNetworkHandlerAccessor) handler).vfguard$getProfile();
        return profile != null ? profile.getName() : "?";
    }

    private record Verdict(Messages.Kind kind, String detail) {
        static Verdict ok(String detail) {
            return new Verdict(null, detail);
        }

        static Verdict reject(Messages.Kind kind, String detail) {
            return new Verdict(kind, detail);
        }
    }

    private Verdict verify(GuardConfig cfg, String name, byte[] nonce, PacketByteBuf buf) {
        int protocol = buf.readVarInt();
        if (protocol != GuardProtocol.PROTOCOL) {
            return Verdict.reject(Messages.Kind.USE_LAUNCHER, "guard protocol " + protocol + ", server expects " + GuardProtocol.PROTOCOL);
        }
        String modVersion = buf.readString(64);
        boolean hasToken = buf.readBoolean();
        long launchTime = 0;
        String signedHash = null;
        byte[] proof = null;
        if (hasToken) {
            launchTime = buf.readLong();
            signedHash = buf.readString(64);
            proof = buf.readByteArray(64);
        }
        int count = buf.readVarInt();
        if (count < 0 || count > GuardProtocol.MAX_MODS) return Verdict.reject(Messages.Kind.WRONG_MODS, "mod count " + count);
        List<String> mods = new ArrayList<>(count);
        for (int i = 0; i < count; i++) mods.add(buf.readString(128).toLowerCase());

        if (!hasToken) return Verdict.reject(Messages.Kind.USE_LAUNCHER, "has the guard mod " + modVersion + " but no launcher token (game not started by the launcher)");

        byte[] expected = GuardProtocol.proof(GuardProtocol.sessionKey(cfg.secret, name, launchTime, signedHash), nonce);
        if (!MessageDigest.isEqual(expected, proof)) {
            return Verdict.reject(Messages.Kind.USE_LAUNCHER, "launcher token does not verify (other nickname, other secret or forged)");
        }
        long now = System.currentTimeMillis() / 1000;
        if (launchTime > now + CLOCK_SKEW_SECONDS) {
            return Verdict.reject(Messages.Kind.SESSION_EXPIRED, "launch time is " + (launchTime - now) / 60 + " min in the future (PC clock?)");
        }
        if (now - launchTime > cfg.maxSessionSeconds) {
            return Verdict.reject(Messages.Kind.SESSION_EXPIRED, "game was launched " + (now - launchTime) / 3600.0 + " h ago");
        }
        if (!GuardProtocol.modsHash(mods).equals(signedHash)) {
            return Verdict.reject(Messages.Kind.WRONG_MODS, "loaded mods differ from what the launcher installed (" + mods.size() + " jars)");
        }

        if (!cfg.checkMods) return Verdict.ok("token ok, mod check off");
        PackAllowlist.Snapshot pack = this.pack.current();
        if (pack == null) return Verdict.ok("token ok, pack manifest not loaded so mods not checked");
        List<String> unknown = new ArrayList<>();
        for (String m : mods) if (!pack.allowed().containsKey(m)) unknown.add(m.length() > 12 ? m.substring(0, 12) : m);
        List<String> missing = new ArrayList<>();
        for (String r : pack.required()) if (!mods.contains(r)) missing.add(pack.allowed().get(r));
        if (!unknown.isEmpty() || !missing.isEmpty()) {
            return Verdict.reject(Messages.Kind.WRONG_MODS, "not pack " + pack.packVersion()
                    + (unknown.isEmpty() ? "" : "; unknown jars " + unknown)
                    + (missing.isEmpty() ? "" : "; missing " + missing));
        }
        return Verdict.ok("pack " + pack.packVersion() + ", " + mods.size() + " mods");
    }
}

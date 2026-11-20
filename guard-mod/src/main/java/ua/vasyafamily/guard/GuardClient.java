package ua.vasyafamily.guard;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.TreeSet;
import java.util.concurrent.CompletableFuture;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.networking.v1.ClientLoginNetworking;
import net.fabricmc.fabric.api.networking.v1.PacketByteBufs;
import net.fabricmc.loader.api.FabricLoader;
import net.fabricmc.loader.api.ModContainer;
import net.fabricmc.loader.api.metadata.ModOrigin;
import net.minecraft.network.PacketByteBuf;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Client side: answers the server's login question with the launcher's proof and the loaded mod list. */
public final class GuardClient implements ClientModInitializer {
    private static final Logger LOG = LoggerFactory.getLogger("VasyaFamilyGuard");

    /** Launch proof from the launcher, or null when the game was started some other way. */
    private record Token(long launchTime, String modsHash, byte[] sessionKey) {}

    private Token token;
    /** Mod ids of the hashed jars, only for the log. */
    private static final List<String> hashedIds = new java.util.concurrent.CopyOnWriteArrayList<>();
    private CompletableFuture<List<String>> loadedMods;

    @Override
    public void onInitializeClient() {
        token = readToken();
        // Hash the jars in the background while the game loads; the answer waits for it if needed.
        loadedMods = CompletableFuture.supplyAsync(GuardClient::hashLoadedMods);
        loadedMods.thenAccept(mods -> LOG.info("Launcher token: {}, {} mod jars: {}", token != null ? "present" : "missing", mods.size(), String.join(", ", hashedIds)));

        ClientLoginNetworking.registerGlobalReceiver(GuardProtocol.CHANNEL, (client, handler, buf, listeners) -> {
            int protocol = buf.readVarInt();
            byte[] nonce = buf.readByteArray(64);
            if (protocol != GuardProtocol.PROTOCOL) LOG.warn("Server uses guard protocol {}, this mod {}", protocol, GuardProtocol.PROTOCOL);
            return loadedMods.thenApply(mods -> answer(nonce, mods));
        });
    }

    private PacketByteBuf answer(byte[] nonce, List<String> mods) {
        PacketByteBuf out = PacketByteBufs.create();
        out.writeVarInt(GuardProtocol.PROTOCOL);
        out.writeString(FabricLoader.getInstance().getModContainer(GuardProtocol.MOD_ID)
                .map(m -> m.getMetadata().getVersion().getFriendlyString()).orElse("?"), 64);
        out.writeBoolean(token != null);
        if (token != null) {
            out.writeLong(token.launchTime());
            out.writeString(token.modsHash(), 64);
            out.writeByteArray(GuardProtocol.proof(token.sessionKey(), nonce));
        }
        out.writeVarInt(mods.size());
        for (String m : mods) out.writeString(m, 128);
        return out;
    }

    private static Token readToken() {
        String raw = System.getProperty(GuardProtocol.PROPERTY);
        if (raw == null || raw.isBlank()) return null;
        // Don't keep the key where other mods could read it with System.getProperties().
        System.clearProperty(GuardProtocol.PROPERTY);
        String[] parts = raw.trim().split(":");
        try {
            if (parts.length != 4 || !parts[0].equals("v1")) throw new IllegalArgumentException("unknown format");
            if (!parts[2].matches("[0-9a-f]{64}")) throw new IllegalArgumentException("bad mods hash");
            return new Token(Long.parseLong(parts[1]), parts[2], HexFormat.of().parseHex(parts[3]));
        } catch (RuntimeException e) {
            LOG.warn("Ignoring a malformed launcher token: {}", e.getMessage());
            return null;
        }
    }

    /**
     * SHA-1 of every top-level mod jar Fabric loaded (wherever it came from: the mods folder,
     * -Dfabric.addMods, ...). Minecraft, Java, Fabric Loader and jar-in-jar libraries
     * are skipped; the launcher's manifest lists exactly the top-level jars.
     */
    static List<String> hashLoadedMods() {
        TreeSet<String> out = new TreeSet<>();
        for (ModContainer mod : FabricLoader.getInstance().getAllMods()) {
            if (mod.getContainingMod().isPresent()) continue;
            String id = mod.getMetadata().getId();
            // Minecraft, Java and the loader come with the launch, not from the pack.
            if ("builtin".equals(mod.getMetadata().getType()) || id.equals("fabricloader")) continue;
            ModOrigin origin = mod.getOrigin();
            if (origin.getKind() != ModOrigin.Kind.PATH) {
                out.add("unknown:" + id);
                continue;
            }
            for (Path p : origin.getPaths()) {
                // A folder is a development build; it is never part of the pack.
                out.add(Files.isRegularFile(p) ? sha1(p) : "dir:" + id);
                hashedIds.add(id);
            }
        }
        return new ArrayList<>(out);
    }

    private static String sha1(Path file) {
        try (InputStream in = Files.newInputStream(file)) {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            byte[] buf = new byte[1 << 16];
            for (int n; (n = in.read(buf)) > 0; ) md.update(buf, 0, n);
            return HexFormat.of().formatHex(md.digest());
        } catch (IOException | NoSuchAlgorithmException e) {
            return "unreadable:" + file.getFileName();
        }
    }
}

package ua.vasyafamily.guard;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.Collection;
import java.util.HexFormat;
import java.util.TreeSet;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import net.minecraft.util.Identifier;

/**
 * The "launcher-only join" handshake shared by the client and the server.
 *
 * <p>How it works:
 * <ol>
 *   <li>The launcher knows a shared secret (baked into the launcher build, never committed).
 *       Before starting the game it computes
 *       {@code sessionKey = HMAC-SHA256(secret, "vfguard1|" + nickname + "|" + launchTime + "|" + modsHash)}
 *       where {@code modsHash} is {@link #modsHash} of the SHA-1s of the mod jars it just put into the
 *       mods folder, and passes {@code v1:<launchTime>:<modsHash>:<sessionKey hex>} to the game in the
 *       {@value #PROPERTY} system property. The secret itself never reaches the game.</li>
 *   <li>When a player joins, the server sends a random nonce over the login channel {@link #CHANNEL}.</li>
 *   <li>This mod on the client answers with launchTime, modsHash, {@code HMAC-SHA256(sessionKey, nonce)}
 *       and the SHA-1s of the mod jars that are actually loaded.</li>
 *   <li>The server derives the same sessionKey from its copy of the secret and the player's nickname,
 *       checks the answer, the age of the launch, that the loaded mods are the ones the launcher signed,
 *       and that they all belong to the current pack.</li>
 * </ol>
 *
 * <p><b>Honest limits:</b> this stops casual bypassing (TLauncher or another launcher with extra mods,
 * a copied mods folder, forgetting to update). It is not real anti-cheat: the secret is inside every copy
 * of the launcher, and a determined person can extract it or patch this mod to report a fake mod list.
 * Server-side protection (EasyAuth, AntiXray, Ledger) still matters.
 */
public final class GuardProtocol {
    public static final String MOD_ID = "vasyafamily_guard";
    public static final Identifier CHANNEL = new Identifier("vasyafamily", "guard");
    /** Version of the login packets. Bump when their layout changes. */
    public static final int PROTOCOL = 1;
    /** JVM system property the launcher sets: {@code -Dvasyafamily.guard=v1:<ts>:<modsHash>:<sessionKeyHex>}. */
    public static final String PROPERTY = "vasyafamily.guard";
    public static final int NONCE_BYTES = 16;
    public static final int MAX_MODS = 1024;

    private GuardProtocol() {}

    public static byte[] hmac(byte[] key, byte[] data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal(data);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HmacSHA256 is not available", e);
        }
    }

    /** Must match {@code sessionKey()} in the launcher's src/main/guard.ts. */
    public static byte[] sessionKey(String secret, String nickname, long launchTime, String modsHash) {
        String message = "vfguard1|" + nickname + "|" + launchTime + "|" + modsHash;
        return hmac(secret.getBytes(StandardCharsets.UTF_8), message.getBytes(StandardCharsets.UTF_8));
    }

    public static byte[] proof(byte[] sessionKey, byte[] nonce) {
        return hmac(sessionKey, nonce);
    }

    /** SHA-256 (hex) of the sorted, de-duplicated, lower-case SHA-1s joined with '\n'. Same as the launcher. */
    public static String modsHash(Collection<String> sha1s) {
        TreeSet<String> sorted = new TreeSet<>();
        for (String s : sha1s) sorted.add(s.toLowerCase());
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(String.join("\n", sorted).getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }
}

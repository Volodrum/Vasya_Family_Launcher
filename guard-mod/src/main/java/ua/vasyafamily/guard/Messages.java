package ua.vasyafamily.guard;

import net.minecraft.text.MutableText;
import net.minecraft.text.Text;
import net.minecraft.util.Formatting;

/**
 * Kick messages. The server can't know the player's language during login, so every message is
 * shown in English, Ukrainian and Russian.
 */
public final class Messages {
    private Messages() {}

    public enum Kind {
        /** No guard mod, no launcher token, or a token that doesn't verify. */
        USE_LAUNCHER(
                "Please join through the Vasya Family launcher.",
                "Заходь на сервер через лаунчер Vasya Family.",
                "Заходи на сервер через лаунчер Vasya Family."),
        /** The launch is too old, or the PC clock is far off. */
        SESSION_EXPIRED(
                "Your game session has expired. Close the game and press Play in the launcher again. Also check that your PC clock is correct.",
                "Сесія гри застаріла. Закрий гру й знову натисни «Грати» в лаунчері. Також перевір, чи правильний час на комп'ютері.",
                "Сессия игры устарела. Закрой игру и снова нажми «Играть» в лаунчере. Также проверь, правильное ли время на компьютере."),
        /** Mods differ from what the launcher installed, or from the current pack. */
        WRONG_MODS(
                "Your mods don't match the server's modpack. Close the game and press Play in the launcher to update.",
                "Твої моди не збігаються зі збіркою сервера. Закрий гру й натисни «Грати» в лаунчері, щоб оновитися.",
                "Твои моды не совпадают со сборкой сервера. Закрой игру и нажми «Играть» в лаунчере, чтобы обновиться.");

        final String en, uk, ru;

        Kind(String en, String uk, String ru) {
            this.en = en;
            this.uk = uk;
            this.ru = ru;
        }
    }

    public static Text kick(Kind kind, String launcherUrl) {
        MutableText t = Text.literal("Vasya Family\n\n").formatted(Formatting.GOLD, Formatting.BOLD);
        t.append(Text.literal(kind.en + "\n\n").formatted(Formatting.WHITE).styled(s -> s.withBold(false)));
        t.append(Text.literal(kind.uk + "\n\n").formatted(Formatting.WHITE).styled(s -> s.withBold(false)));
        t.append(Text.literal(kind.ru).formatted(Formatting.WHITE).styled(s -> s.withBold(false)));
        if (launcherUrl != null && !launcherUrl.isEmpty()) {
            t.append(Text.literal("\n\n" + launcherUrl).formatted(Formatting.GRAY).styled(s -> s.withBold(false)));
        }
        return t;
    }
}

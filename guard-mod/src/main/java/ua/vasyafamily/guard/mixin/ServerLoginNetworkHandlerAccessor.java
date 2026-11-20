package ua.vasyafamily.guard.mixin;

import com.mojang.authlib.GameProfile;
import net.minecraft.server.network.ServerLoginNetworkHandler;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

/** The nickname the player sent in the login hello packet. */
@Mixin(ServerLoginNetworkHandler.class)
public interface ServerLoginNetworkHandlerAccessor {
    @Accessor("profile")
    GameProfile vfguard$getProfile();
}

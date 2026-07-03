import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { ConnectionProvider, TenantContext } from "@crm/contracts";
import { createHash, randomBytes } from "node:crypto";
import { TokenCipherService } from "../common/token-cipher.service";

interface OAuthState {
  tenantId: string;
  userId: string;
  provider: ConnectionProvider;
  verifier: string;
  expiresAt: number;
}

@Injectable()
export class OAuthStateService {
  constructor(private readonly cipher: TokenCipherService) {}

  create(context: TenantContext, provider: ConnectionProvider) {
    const verifier = randomBytes(48).toString("base64url");
    const codeChallenge = createHash("sha256").update(verifier).digest("base64url");
    const state = this.cipher.encrypt(
      JSON.stringify({
        tenantId: context.tenantId,
        userId: context.userId,
        provider,
        verifier,
        expiresAt: Date.now() + 10 * 60_000,
      } satisfies OAuthState),
    );
    return { state, codeChallenge };
  }

  consume(value: string): OAuthState {
    try {
      const state = JSON.parse(this.cipher.decrypt(value)) as OAuthState;
      if (state.expiresAt < Date.now()) throw new Error("expired");
      return state;
    } catch {
      throw new UnauthorizedException("OAuth state is invalid or expired");
    }
  }
}

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { ConnectionProvider, TenantContext } from "@crm/contracts";
import { db, Prisma, Provider } from "@crm/database";
import { QueueService } from "../common/queue.service";
import { TokenCipherService } from "../common/token-cipher.service";
import { ProviderRegistry } from "../providers/provider.registry";
import { OAuthStateService } from "./oauth-state.service";

@Injectable()
export class ConnectionsService {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly state: OAuthStateService,
    private readonly cipher: TokenCipherService,
    private readonly queues: QueueService,
  ) {}

  async list(context: TenantContext) {
    return db.channelConnection.findMany({
      where: { tenantId: context.tenantId },
      select: {
        id: true,
        provider: true,
        status: true,
        displayName: true,
        externalAccountId: true,
        lastSyncedAt: true,
        lastError: true,
        metadata: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async authorize(context: TenantContext, provider: ConnectionProvider) {
    this.requireAdmin(context);
    const family = provider === "GMAIL" ? "GMAIL" : provider;
    const { state, codeChallenge } = this.state.create(context, family);
    const url = await this.registry.get(family).getAuthorizationUrl(state, codeChallenge);
    return { url };
  }

  async completeOAuth(expectedFamily: "GMAIL" | "WHATSAPP", code: string, encodedState: string) {
    if (!code || !encodedState) throw new BadRequestException("OAuth code and state are required");
    const state = this.state.consume(encodedState);
    if ((state.provider === "GMAIL" ? "GMAIL" : "WHATSAPP") !== expectedFamily) {
      throw new BadRequestException("OAuth provider does not match state");
    }
    const adapter = this.registry.get(state.provider);
    const token = await adapter.exchangeAuthorizationCode(code, state.verifier);
    if (expectedFamily === "GMAIL") {
      const accessToken = String(token.access_token ?? "");
      const profileResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      if (!profileResponse.ok) throw new BadRequestException("Unable to read the connected Gmail profile");
      const profile = (await profileResponse.json()) as { emailAddress: string; historyId?: string };
      const connection = await db.channelConnection.upsert({
        where: {
          tenantId_provider_externalAccountId: {
            tenantId: state.tenantId,
            provider: Provider.GMAIL,
            externalAccountId: profile.emailAddress,
          },
        },
        update: {
          status: "CONNECTED",
          encryptedAccessToken: this.cipher.encrypt(accessToken),
          encryptedRefreshToken: token.refresh_token
            ? this.cipher.encrypt(String(token.refresh_token))
            : undefined,
          tokenExpiresAt: new Date(Date.now() + Number(token.expires_in ?? 3600) * 1000),
          metadata: { emailAddress: profile.emailAddress },
          lastError: null,
        },
        create: {
          tenantId: state.tenantId,
          provider: Provider.GMAIL,
          status: "CONNECTED",
          displayName: profile.emailAddress,
          externalAccountId: profile.emailAddress,
          encryptedAccessToken: this.cipher.encrypt(accessToken),
          encryptedRefreshToken: token.refresh_token
            ? this.cipher.encrypt(String(token.refresh_token))
            : undefined,
          tokenExpiresAt: new Date(Date.now() + Number(token.expires_in ?? 3600) * 1000),
          metadata: { emailAddress: profile.emailAddress },
        },
      });
      await db.syncCursor.upsert({
        where: { connectionId_resource: { connectionId: connection.id, resource: "gmail-history" } },
        update: { cursor: profile.historyId },
        create: {
          tenantId: state.tenantId,
          connectionId: connection.id,
          resource: "gmail-history",
          cursor: profile.historyId,
        },
      });
      if (process.env.GOOGLE_PUBSUB_TOPIC) {
        await fetch("https://gmail.googleapis.com/gmail/v1/users/me/watch", {
          method: "POST",
          headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
          body: JSON.stringify({ topicName: process.env.GOOGLE_PUBSUB_TOPIC }),
        });
      }
      return connection;
    }

    const accessToken = String(token.access_token ?? "");
    const meResponse = await fetch(
      `https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? "v25.0"}/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`,
    );
    if (!meResponse.ok) throw new BadRequestException("Unable to read the connected Meta account");
    const me = (await meResponse.json()) as { id: string; name?: string };
    return db.channelConnection.create({
      data: {
        tenantId: state.tenantId,
        provider: Provider.WHATSAPP,
        status: "PENDING",
        displayName: `${me.name ?? "Meta"} — choose assets`,
        externalAccountId: `meta-user-${me.id}-${crypto.randomUUID()}`,
        encryptedAccessToken: this.cipher.encrypt(accessToken),
        tokenExpiresAt: token.expires_in
          ? new Date(Date.now() + Number(token.expires_in) * 1000)
          : undefined,
        metadata: { metaUserId: me.id, requiresAssetSelection: true },
      },
    });
  }

  async registerMetaAsset(
    context: TenantContext,
    input: {
      provider: Exclude<ConnectionProvider, "GMAIL">;
      externalAccountId: string;
      displayName: string;
      accessToken: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    this.requireAdmin(context);
    if (!Object.values(Provider).includes(input.provider as Provider)) {
      throw new BadRequestException("Unsupported Meta provider");
    }
    return db.channelConnection.upsert({
      where: {
        tenantId_provider_externalAccountId: {
          tenantId: context.tenantId,
          provider: input.provider as Provider,
          externalAccountId: input.externalAccountId,
        },
      },
      update: {
        status: "CONNECTED",
        displayName: input.displayName,
        encryptedAccessToken: this.cipher.encrypt(input.accessToken),
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        lastError: null,
      },
      create: {
        tenantId: context.tenantId,
        provider: input.provider as Provider,
        status: "CONNECTED",
        displayName: input.displayName,
        externalAccountId: input.externalAccountId,
        encryptedAccessToken: this.cipher.encrypt(input.accessToken),
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async startImport(context: TenantContext, id: string) {
    const connection = await this.connectionForTenant(context.tenantId, id);
    await this.queues.imports.add(
      "backfill",
      { tenantId: context.tenantId, connectionId: id },
      { jobId: `backfill-${id}`, attempts: 5, backoff: { type: "exponential", delay: 5_000 } },
    );
    return { accepted: true, connectionId: connection.id };
  }

  async disconnect(context: TenantContext, id: string) {
    this.requireAdmin(context);
    const connection = await this.connectionForTenant(context.tenantId, id);
    await this.registry.get(connection.provider as ConnectionProvider).disconnect(id);
    await db.auditLog.create({
      data: {
        tenantId: context.tenantId,
        actorId: context.userId,
        action: "connection.disconnected",
        entityType: "ChannelConnection",
        entityId: id,
      },
    });
    return { disconnected: true };
  }

  private async connectionForTenant(tenantId: string, id: string) {
    const connection = await db.channelConnection.findFirst({ where: { id, tenantId } });
    if (!connection) throw new NotFoundException("Connection not found");
    return connection;
  }

  private requireAdmin(context: TenantContext) {
    if (context.role !== "ADMIN") throw new ForbiddenException("Admin role required");
  }
}

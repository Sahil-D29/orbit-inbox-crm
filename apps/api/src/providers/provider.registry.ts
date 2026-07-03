import { Injectable } from "@nestjs/common";
import type { ConnectionProvider, ProviderAdapter } from "@crm/contracts";
import { GmailAdapter } from "./gmail.adapter";
import { MetaAdapter } from "./meta.adapter";

@Injectable()
export class ProviderRegistry {
  constructor(
    private readonly gmail: GmailAdapter,
    private readonly meta: MetaAdapter,
  ) {}

  get(provider: ConnectionProvider): ProviderAdapter {
    return provider === "GMAIL" ? this.gmail : this.meta.forProvider(provider);
  }
}

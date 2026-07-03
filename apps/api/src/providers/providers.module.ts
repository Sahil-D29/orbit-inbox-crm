import { Module } from "@nestjs/common";
import { GmailAdapter } from "./gmail.adapter";
import { MetaAdapter } from "./meta.adapter";
import { ProviderRegistry } from "./provider.registry";

@Module({
  providers: [GmailAdapter, MetaAdapter, ProviderRegistry],
  exports: [GmailAdapter, MetaAdapter, ProviderRegistry],
})
export class ProvidersModule {}

import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import type { TenantContext } from "@crm/contracts";
import { CurrentTenant } from "../auth/tenant-context.decorator";
import { ContactsService } from "./contacts.service";

@Controller("contacts")
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  list(@CurrentTenant() context: TenantContext, @Query("q") q?: string) {
    return this.contacts.list(context, q);
  }

  @Get("suggestions")
  suggestions(@CurrentTenant() context: TenantContext) {
    return this.contacts.suggestions(context);
  }

  @Get(":id")
  detail(@CurrentTenant() context: TenantContext, @Param("id") id: string) {
    return this.contacts.detail(context, id);
  }

  @Post(":id/notes")
  addNote(
    @CurrentTenant() context: TenantContext,
    @Param("id") id: string,
    @Body() body: { body: string },
  ) {
    return this.contacts.addNote(context, id, body.body);
  }

  @Post("merge")
  merge(
    @CurrentTenant() context: TenantContext,
    @Body() body: { sourceContactId: string; targetContactId: string },
  ) {
    return this.contacts.merge(context, body.sourceContactId, body.targetContactId);
  }

  @Post("merges/:id/undo")
  undoMerge(@CurrentTenant() context: TenantContext, @Param("id") id: string) {
    return this.contacts.undoMerge(context, id);
  }
}

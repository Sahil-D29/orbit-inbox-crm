import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { db } from "@crm/database";
import type { Request } from "express";
import { IS_PUBLIC } from "./public.decorator";

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])) {
      return true;
    }
    const request = context.switchToHttp().getRequest<
      Request & { tenantContext?: { tenantId: string; userId: string; role: "ADMIN" | "AGENT" } }
    >();
    const tenantId = request.header("x-tenant-id") ?? process.env.DEV_TENANT_ID;
    const userId = request.header("x-user-id") ?? process.env.DEV_USER_ID;
    if (!tenantId || !userId) throw new UnauthorizedException("A verified tenant session is required");
    if (process.env.NODE_ENV === "production" && !request.headers.authorization) {
      throw new UnauthorizedException("Development identity headers are disabled in production");
    }
    const membership = await db.membership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    if (!membership) throw new ForbiddenException("User does not belong to this tenant");
    request.tenantContext = { tenantId, userId, role: membership.role };
    return true;
  }
}

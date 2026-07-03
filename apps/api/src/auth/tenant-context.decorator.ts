import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { TenantContext } from "@crm/contracts";

export const CurrentTenant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TenantContext => {
    return context.switchToHttp().getRequest<{ tenantContext: TenantContext }>().tenantContext;
  },
);

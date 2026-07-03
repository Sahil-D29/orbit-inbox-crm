import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  RawBodyRequest,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { Public } from "../auth/public.decorator";
import { WebhooksService } from "./webhooks.service";

@Public()
@Controller("webhooks")
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get("meta")
  verifyMeta(
    @Query("hub.mode") mode: string,
    @Query("hub.verify_token") token: string,
    @Query("hub.challenge") challenge: string,
  ) {
    if (
      mode !== "subscribe" ||
      !process.env.META_WEBHOOK_VERIFY_TOKEN ||
      token !== process.env.META_WEBHOOK_VERIFY_TOKEN
    ) {
      throw new BadRequestException("Webhook verification failed");
    }
    return challenge;
  }

  @Post("meta")
  @HttpCode(200)
  async meta(
    @Req() request: RawBodyRequest<Request>,
    @Headers("x-hub-signature-256") signature: string | undefined,
    @Body() payload: unknown,
  ) {
    await this.webhooks.acceptMeta(payload, request.rawBody, signature);
    return { received: true };
  }

  @Post("gmail")
  @HttpCode(200)
  async gmail(
    @Headers("authorization") authorization: string | undefined,
    @Body()
    body: {
      message?: { data?: string; messageId?: string; publishTime?: string };
      subscription?: string;
    },
  ) {
    await this.webhooks.acceptGmail(body, authorization);
    return { received: true };
  }
}

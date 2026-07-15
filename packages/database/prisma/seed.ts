import {
  CommentStatus,
  ConnectionStatus,
  ConversationStatus,
  DeliveryStatus,
  MessageDirection,
  PrismaClient,
  Provider,
  Role,
} from "@prisma/client";
import { hash } from "bcrypt";

const prisma = new PrismaClient();
const tenantId = "11111111-1111-4111-8111-111111111111";
const adminId = "22222222-2222-4222-8222-222222222222";
const agentId = "33333333-3333-4333-8333-333333333333";

async function main() {
  await prisma.tenant.upsert({
    where: { id: tenantId },
    update: {},
    create: { id: tenantId, name: "Sadhana Studio", slug: "sadhana-studio" },
  });
  const passwordHash = await hash(process.env.SEED_PASSWORD ?? "orbit123", 10);
  const admin = await prisma.user.upsert({
    where: { email: "sahil@example.com" },
    update: { passwordHash },
    create: { id: adminId, email: "sahil@example.com", name: "Sahil", passwordHash },
  });
  const agent = await prisma.user.upsert({
    where: { email: "ananya@example.com" },
    update: { passwordHash },
    create: { id: agentId, email: "ananya@example.com", name: "Ananya Rao", passwordHash },
  });
  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId, userId: admin.id } },
    update: { role: Role.ADMIN },
    create: { tenantId, userId: admin.id, role: Role.ADMIN },
  });
  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId, userId: agent.id } },
    update: { role: Role.AGENT },
    create: { tenantId, userId: agent.id, role: Role.AGENT },
  });

  const connectionSpecs = [
    [Provider.GMAIL, "support@sadhana.example", "gmail-demo"],
    [Provider.WHATSAPP, "Sadhana WhatsApp", "wa-demo"],
    [Provider.INSTAGRAM_DM, "@sadhana", "ig-demo"],
    [Provider.INSTAGRAM_COMMENTS, "@sadhana comments", "ig-comments-demo"],
    [Provider.FACEBOOK_MESSENGER, "Sadhana Page", "fb-demo"],
  ] as const;
  const connections = new Map<Provider, string>();
  for (const [provider, displayName, externalAccountId] of connectionSpecs) {
    const connection = await prisma.channelConnection.upsert({
      where: {
        tenantId_provider_externalAccountId: { tenantId, provider, externalAccountId },
      },
      update: {},
      create: {
        tenantId,
        provider,
        displayName,
        externalAccountId,
        status: ConnectionStatus.CONNECTED,
        lastSyncedAt: new Date(),
      },
    });
    connections.set(provider, connection.id);
  }

  const vip = await prisma.label.upsert({
    where: { tenantId_name: { tenantId, name: "VIP" } },
    update: {},
    create: { tenantId, name: "VIP", color: "#8b5cf6" },
  });
  const sales = await prisma.label.upsert({
    where: { tenantId_name: { tenantId, name: "Sales lead" } },
    update: {},
    create: { tenantId, name: "Sales lead", color: "#f59e0b" },
  });

  const examples = [
    {
      contactId: "44444444-4444-4444-8444-444444444441",
      provider: Provider.WHATSAPP,
      externalId: "wa-thread-1",
      name: "Aarav Mehta",
      address: "919810001001",
      preview: "Yes, please reserve one for me.",
      subject: "Order enquiry",
      minutesAgo: 3,
      unread: 2,
      labelId: sales.id,
    },
    {
      contactId: "44444444-4444-4444-8444-444444444442",
      provider: Provider.GMAIL,
      externalId: "gmail-thread-1",
      name: "Maya Kapoor",
      address: "maya@example.com",
      preview: "Could you share the invoice for my last order?",
      subject: "Invoice request",
      minutesAgo: 18,
      unread: 1,
      labelId: vip.id,
    },
    {
      contactId: "44444444-4444-4444-8444-444444444443",
      provider: Provider.INSTAGRAM_DM,
      externalId: "ig-thread-1",
      name: "Riya Sharma",
      address: "riya.sharma",
      preview: "Is international shipping available?",
      subject: "Instagram conversation",
      minutesAgo: 47,
      unread: 0,
      labelId: sales.id,
    },
    {
      contactId: "44444444-4444-4444-8444-444444444444",
      provider: Provider.FACEBOOK_MESSENGER,
      externalId: "fb-thread-1",
      name: "Kabir Singh",
      address: "fb_102001",
      preview: "Thank you, that solved it!",
      subject: "Facebook conversation",
      minutesAgo: 96,
      unread: 0,
      labelId: vip.id,
    },
  ];

  for (const item of examples) {
    const contact = await prisma.contact.upsert({
      where: { id: item.contactId },
      update: {},
      create: {
        id: item.contactId,
        tenantId,
        displayName: item.name,
        primaryEmail: item.provider === Provider.GMAIL ? item.address : undefined,
        primaryPhone: item.provider === Provider.WHATSAPP ? `+${item.address}` : undefined,
      },
    });
    await prisma.externalIdentity.upsert({
      where: {
        tenantId_provider_externalId: {
          tenantId,
          provider: item.provider,
          externalId: item.address,
        },
      },
      update: { contactId: contact.id },
      create: {
        tenantId,
        connectionId: connections.get(item.provider),
        contactId: contact.id,
        provider: item.provider,
        externalId: item.address,
        address: item.address,
        displayName: item.name,
        verified: true,
      },
    });
    const sentAt = new Date(Date.now() - item.minutesAgo * 60_000);
    const conversation = await prisma.conversation.upsert({
      where: {
        tenantId_connectionId_externalId: {
          tenantId,
          connectionId: connections.get(item.provider)!,
          externalId: item.externalId,
        },
      },
      update: {},
      create: {
        tenantId,
        connectionId: connections.get(item.provider)!,
        contactId: contact.id,
        externalId: item.externalId,
        channel: item.provider,
        subject: item.subject,
        status: ConversationStatus.OPEN,
        assigneeId: item.provider === Provider.GMAIL ? agent.id : admin.id,
        unreadCount: item.unread,
        lastMessageAt: sentAt,
        lastInboundAt: sentAt,
        serviceWindowExpiresAt:
          item.provider === Provider.WHATSAPP
            ? new Date(sentAt.getTime() + 24 * 60 * 60_000)
            : undefined,
      },
    });
    await prisma.conversationLabel.upsert({
      where: { conversationId_labelId: { conversationId: conversation.id, labelId: item.labelId } },
      update: {},
      create: { tenantId, conversationId: conversation.id, labelId: item.labelId },
    });
    await prisma.message.upsert({
      where: {
        tenantId_conversationId_externalId: {
          tenantId,
          conversationId: conversation.id,
          externalId: `${item.externalId}-message-1`,
        },
      },
      update: {},
      create: {
        tenantId,
        conversationId: conversation.id,
        externalId: `${item.externalId}-message-1`,
        direction: MessageDirection.INBOUND,
        deliveryStatus: DeliveryStatus.DELIVERED,
        senderExternalId: item.address,
        subject: item.subject,
        text: item.preview,
        sentAt,
      },
    });
  }

  const igContact = await prisma.contact.upsert({
    where: { id: "44444444-4444-4444-8444-444444444445" },
    update: {},
    create: { id: "44444444-4444-4444-8444-444444444445", tenantId, displayName: "Devika Nair" },
  });
  const post = await prisma.instagramPost.upsert({
    where: {
      tenantId_connectionId_externalId: {
        tenantId,
        connectionId: connections.get(Provider.INSTAGRAM_COMMENTS)!,
        externalId: "ig-post-demo-1",
      },
    },
    update: {},
    create: {
      tenantId,
      connectionId: connections.get(Provider.INSTAGRAM_COMMENTS)!,
      externalId: "ig-post-demo-1",
      caption: "A quiet morning practice changes the whole day.",
      permalink: "https://instagram.com/",
      publishedAt: new Date(Date.now() - 86_400_000),
    },
  });
  await prisma.instagramComment.upsert({
    where: {
      tenantId_externalId: { tenantId, externalId: "ig-comment-demo-1" },
    },
    update: {},
    create: {
      tenantId,
      postId: post.id,
      contactId: igContact.id,
      externalId: "ig-comment-demo-1",
      authorExternalId: "devika.nair",
      authorName: "Devika Nair",
      text: "Where can I learn more about this practice?",
      status: CommentStatus.OPEN,
      commentedAt: new Date(Date.now() - 12 * 60_000),
    },
  });

  await prisma.savedView.upsert({
    where: { tenantId_name: { tenantId, name: "Needs a reply" } },
    update: {},
    create: { tenantId, name: "Needs a reply", query: { status: "OPEN", unread: true } },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

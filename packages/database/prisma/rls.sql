-- Apply after Prisma migration in production. The API transaction must execute:
-- SET LOCAL app.tenant_id = '<verified tenant UUID>';
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'ChannelConnection', 'Contact', 'ExternalIdentity', 'Conversation',
    'Message', 'Attachment', 'InstagramPost', 'InstagramComment', 'Label',
    'Note', 'SavedView', 'SyncCursor', 'WebhookEvent', 'OutboundJob',
    'AuditLog', 'ContactMerge', 'Membership', 'ConversationLabel', 'ContactLabel'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_%I ON %I USING ("tenantId" = current_setting(''app.tenant_id'', true)::uuid) WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true)::uuid)',
      table_name,
      table_name
    );
  END LOOP;
END $$;

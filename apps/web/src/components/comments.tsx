"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { relativeTime, cleanApiError } from "@/lib/data";
import type { CommentItem } from "@/lib/types";
import { Avatar, PageHeader, Icons } from "./ui";

export function Comments() {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [selected, setSelected] = useState<CommentItem>();
  const [reply, setReply] = useState(""); const [error, setError] = useState<string>();
  const [previewMode, setPreviewMode] = useState(false); const [mobileDetail, setMobileDetail] = useState(false);
  const load = useCallback(async () => {
    try { const data = await api<CommentItem[]>("/comments?status=OPEN"); setComments(data); setPreviewMode(false); setSelected((c) => c && data.some((i) => i.id === c.id) ? c : data[0]); setError(undefined); }
    catch { const preview: CommentItem = { id: "preview-comment", text: "Where can I learn more about this morning practice?", status: "OPEN", isHidden: false, authorName: "Devika Nair", commentedAt: new Date(Date.now() - 12 * 60_000).toISOString(), post: { caption: "A quiet morning practice changes the whole day." }, contact: { displayName: "Devika Nair" } }; setComments([preview]); setSelected(preview); setPreviewMode(true); setError(undefined); }
  }, []);
  useEffect(() => void load(), [load]);
  async function update(hidden?: boolean, status?: string) {
    if (!selected) return;
    if (previewMode) { const u = { ...selected, isHidden: hidden ?? selected.isHidden, status: hidden ? "HIDDEN" : status ?? selected.status }; setSelected(u); setComments((c) => c.map((i) => i.id === u.id ? u : i)); setError(hidden ? "Comment hidden in preview." : "Comment resolved in preview."); return; }
    try { await api(`/comments/${selected.id}`, { method: "PATCH", body: JSON.stringify({ hidden, status }) }); await load(); } catch (err) { setError(cleanApiError(err instanceof Error ? err.message : "Moderation failed")); }
  }
  return (
    <section className="wide-page">
      <PageHeader eyebrow="Community" title="Instagram comments" subtitle="Moderate public conversations without losing customer context." />
      <div className="moderation-grid">
        <div className="comment-queue panel">
          <div className="panel-toolbar"><div className="search-box"><Icons.search /><input placeholder="Search comments" /></div><button className="secondary"><Icons.filter /> Open</button></div>
          {error && <div className={error.includes("failed") || error.includes("rejected") ? "error-notice page-error" : "success-notice page-error"}>{error}</div>}
          {comments.map((comment) => (
            <button key={comment.id} className={selected?.id === comment.id ? "comment-row selected" : "comment-row"} onClick={() => { setSelected(comment); setMobileDetail(true); }}>
              <Avatar name={comment.authorName ?? "Instagram user"} />
              <div><strong>{comment.authorName ?? "Instagram user"}</strong><p>{comment.text}</p><span>{relativeTime(comment.commentedAt)} · Instagram</span></div>
              <Icons.chevron />
            </button>
          ))}
        </div>
        <div className={`comment-detail panel ${mobileDetail ? "mobile-open" : ""}`}>
          {selected ? <>
            <button className="comment-mobile-back" onClick={() => setMobileDetail(false)}>← Back to comments</button>
            <div className="post-context"><span>Comment on your post</span><p>{selected.post.caption ?? "Instagram post"}</p></div>
            <div className="featured-comment"><Avatar name={selected.authorName ?? "Instagram user"} /><div><strong>{selected.authorName}</strong><p>{selected.text}</p><time>{relativeTime(selected.commentedAt)}</time></div></div>
            <div className="moderation-actions"><button onClick={() => void update(!selected.isHidden)}><Icons.eyeOff /> {selected.isHidden ? "Unhide" : "Hide"}</button><button onClick={() => void update(undefined, "RESOLVED")}><Icons.check /> Resolve</button><button onClick={() => setError("Open this customer from the inbox to continue privately.")}><Icons.message /> Continue in DM</button></div>
            <div className="comment-reply"><textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder={`Reply to ${selected.authorName ?? "this comment"}…`} /><button disabled={!reply.trim()} onClick={async () => {
              if (previewMode) { setReply(""); setError("Public reply added in preview."); setComments((c) => c.filter((i) => i.id !== selected.id)); setSelected(undefined); return; }
              try { await api(`/comments/${selected.id}/reply`, { method: "POST", body: JSON.stringify({ text: reply }) }); setReply(""); await load(); } catch (err) { setError(cleanApiError(err instanceof Error ? err.message : "Reply failed")); }
            }}>Reply publicly <Icons.send /></button></div>
          </> : <div className="empty-state"><Icons.message /><strong>Select a comment</strong></div>}
        </div>
        <aside className="comment-context panel">
          <span className="section-label">Customer context</span>
          {selected && <><Avatar name={selected.contact?.displayName ?? selected.authorName ?? "User"} large /><h3>{selected.contact?.displayName ?? selected.authorName}</h3><p>Instagram contact</p><hr /><span className="section-label">Post</span><div className="post-preview"><div className="post-art">ॐ</div><p>{selected.post.caption}</p></div></>}
        </aside>
      </div>
    </section>
  );
}

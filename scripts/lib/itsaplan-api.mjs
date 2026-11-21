// REST client for itsaplan (https://github.com/croffasia/itsaplan). Auth: header x-api-key.
// Environment: ITSAPLAN_URL (API base), ITSAPLAN_API_KEY (key of a dedicated bot account), ITSAPLAN_WEB_URL (links, optional).
// Comments of the bot account never count as answers or approvals.
export function itsaplanClient({
  url = process.env.ITSAPLAN_URL,
  key = process.env.ITSAPLAN_API_KEY,
  fetchImpl = fetch,
} = {}) {
  async function request(path, options = {}) {
    if (!url || !key) throw new Error("ITSAPLAN_URL and ITSAPLAN_API_KEY must be set.");
    const response = await fetchImpl(`${url.replace(/\/$/, "")}${path}`, {
      ...options,
      headers: { "content-type": "application/json", "x-api-key": key, ...options.headers },
    });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
    if (response.status >= 400) {
      const message = String(data.error ?? response.statusText).split(key).join("[redacted]");
      const error = new Error(`itsaplan API ${response.status}: ${message}`);
      error.status = response.status;
      throw error;
    }
    return data;
  }
  const id = encodeURIComponent;
  return {
    project: (projectKey) => request(`/projects/${id(projectKey)}`),
    async issues(projectKey) {
      const list = [];
      let cursor;
      do {
        const q = new URLSearchParams({ limit: "500", includeArchived: "true" });
        if (cursor) q.set("cursor", cursor);
        const data = await request(`/projects/${id(projectKey)}/issues?${q}`);
        const page = data.items ?? data.issues ?? data;
        list.push(...page);
        cursor = data.nextCursor;
        if (!cursor && page.length === 500) throw new Error("More than 500 issues and no cursor, cannot page");
      } while (cursor);
      return Promise.all(list.map(async (i) => ({ ...i, ...(await request(`/issues/${id(i.id)}`)) })));
    },
    createIssue: (projectKey, body) => request(`/projects/${id(projectKey)}/issues`, { method: "POST", body: JSON.stringify(body) }),
    updateIssue: (issueId, fields) => request(`/issues/${id(issueId)}`, { method: "PATCH", body: JSON.stringify(fields) }),
    comment: (issueId, body) => request(`/issues/${id(issueId)}/comments`, { method: "POST", body: JSON.stringify({ body }) }),
    async comments(issueId) {
      const all = [];
      let cursor;
      do {
        const q = new URLSearchParams({ filter: "comments", limit: "100", order: "asc" });
        if (cursor) q.set("cursor", cursor);
        const data = await request(`/issues/${id(issueId)}/feed?${q}`);
        all.push(...(data.items ?? []));
        cursor = data.nextCursor;
      } while (cursor);
      return all;
    },
    checklists: (issueId) => request(`/issues/${id(issueId)}/checklists`),
    createChecklist: (issueId, title) => request(`/issues/${id(issueId)}/checklists`, { method: "POST", body: JSON.stringify({ title }) }),
    addChecklistItems: (checklistId, contents) =>
      request(`/checklists/${id(checklistId)}/items/batch`, { method: "POST", body: JSON.stringify({ items: contents.map((content) => ({ content })) }) }),
    async me() {
      const data = await request("/me");
      return data.user?.id;
    },
  };
}

export function webLink(identifier, projectKey, base = process.env.ITSAPLAN_WEB_URL) {
  if (!base) return null;
  const n = String(identifier ?? "").match(/-(\d+)$/)?.[1];
  return n ? `${base.replace(/\/$/, "")}/projects/${projectKey}/issues/${n}` : null;
}

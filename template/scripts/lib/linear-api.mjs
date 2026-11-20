// Minimal Linear GraphQL client (comments and viewer) used by the dispatcher check and the comment script.
// Environment: LINEAR_API_KEY (personal API key of a dedicated bot user).
export function linearClient({ key = process.env.LINEAR_API_KEY, fetchImpl = fetch } = {}) {
  async function gql(query, variables) {
    if (!key) throw new Error("LINEAR_API_KEY must be set.");
    const res = await fetchImpl("https://api.linear.app/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: key },
      body: JSON.stringify({ query, variables }),
    });
    const json = await res.json();
    if (json.errors) throw new Error(json.errors.map((e) => String(e.message).split(key).join("[redacted]")).join("; "));
    return json.data;
  }
  return {
    gql,
    async me() {
      return (await gql("query{viewer{id}}", {})).viewer.id;
    },
    async issue(identifier) {
      const d = await gql("query($id:String!){issue(id:$id){id identifier}}", { id: identifier });
      return d.issue;
    },
    async comments(identifier) {
      const d = await gql(
        "query($id:String!){issue(id:$id){comments(first:100){nodes{id body createdAt user{id}}}}}",
        { id: identifier },
      );
      return (d.issue?.comments.nodes ?? []).map((c) => ({
        id: c.id, kind: "comment", body: c.body, createdAt: c.createdAt, actorUserId: c.user?.id,
      }));
    },
    async comment(identifier, body) {
      const issue = await this.issue(identifier);
      if (!issue) throw new Error(`Linear issue ${identifier} not found`);
      await gql("mutation($i:CommentCreateInput!){commentCreate(input:$i){success}}", { i: { issueId: issue.id, body } });
    },
  };
}

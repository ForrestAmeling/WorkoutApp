import { FREE_DB_REPO } from "./exercise-publishing";

/**
 * Minimal GitHub REST client for opening free-exercise-db pull requests
 * from the token owner's fork, without a git checkout (serverless-safe).
 * Needs a classic token with the public_repo scope: fine-grained tokens
 * can't open PRs on repositories their owner doesn't belong to.
 */
const API = "https://api.github.com";

export type GitFile = {
  path: string;
  content: string;
  encoding: "utf-8" | "base64";
};

async function gh(
  token: string,
  path: string,
  init?: { method?: string; body?: unknown; raw?: boolean }
): Promise<{ status: number; data: unknown; text: string }> {
  const res = await fetch(`${API}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Accept: init?.raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "reps-exercise-publisher",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  let data: unknown = null;
  if (!init?.raw && text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  return { status: res.status, data, text };
}

async function must<T>(
  call: Promise<{ status: number; data: unknown }>,
  what: string
): Promise<T> {
  const { status, data } = await call;
  if (status >= 300) {
    const message =
      data && typeof data === "object" && "message" in data
        ? String((data as { message: unknown }).message)
        : "";
    throw new Error(`GitHub ${what} failed (${status})${message ? `: ${message}` : ""}`);
  }
  return data as T;
}

/** The token owner's login; throws if GitHub rejects the token (e.g. expired). */
export async function githubLogin(token: string): Promise<string> {
  const me = await must<{ login: string }>(gh(token, "/user"), "token check");
  return me.login;
}

/**
 * Commit `files` (plus an edited dist/exercises.json) to a new branch on
 * the fork and open a PR upstream. Returns `pending` the first time, when
 * the fork has only just been requested — GitHub creates forks
 * asynchronously, so the next scheduled run opens the PR.
 */
export async function openFreeDbPr(
  token: string,
  opts: {
    branch: string;
    title: string;
    body: string;
    files: GitFile[];
    editDist: (distText: string) => string;
  }
): Promise<{ number: number; url: string } | { pending: string }> {
  const login = await githubLogin(token);
  const fork = `${login}/${FREE_DB_REPO.split("/")[1]}`;

  if ((await gh(token, `/repos/${fork}`)).status === 404) {
    await must(
      gh(token, `/repos/${FREE_DB_REPO}/forks`, {
        method: "POST",
        body: { default_branch_only: true },
      }),
      "fork"
    );
    return { pending: `Created fork ${fork}; the PR opens on the next run.` };
  }

  // Bring the fork's main level with upstream so the PR carries only our
  // files. A failure here (e.g. fork already current) isn't fatal.
  await gh(token, `/repos/${fork}/merge-upstream`, {
    method: "POST",
    body: { branch: "main" },
  });

  const ref = await must<{ object: { sha: string } }>(
    gh(token, `/repos/${fork}/git/ref/heads/main`),
    "read main"
  );
  const baseSha = ref.object.sha;
  const baseCommit = await must<{ tree: { sha: string } }>(
    gh(token, `/repos/${fork}/git/commits/${baseSha}`),
    "read base commit"
  );
  const dist = await gh(
    token,
    `/repos/${fork}/contents/dist/exercises.json?ref=${baseSha}`,
    { raw: true }
  );
  if (dist.status >= 300) {
    throw new Error(`GitHub read dist/exercises.json failed (${dist.status})`);
  }

  const files: GitFile[] = [
    ...opts.files,
    { path: "dist/exercises.json", content: opts.editDist(dist.text), encoding: "utf-8" },
  ];
  const tree = await Promise.all(
    files.map(async (f) => {
      if (f.encoding === "utf-8") {
        return { path: f.path, mode: "100644", type: "blob", content: f.content };
      }
      const blob = await must<{ sha: string }>(
        gh(token, `/repos/${fork}/git/blobs`, {
          method: "POST",
          body: { content: f.content, encoding: "base64" },
        }),
        "upload photo"
      );
      return { path: f.path, mode: "100644", type: "blob", sha: blob.sha };
    })
  );

  const newTree = await must<{ sha: string }>(
    gh(token, `/repos/${fork}/git/trees`, {
      method: "POST",
      body: { base_tree: baseCommit.tree.sha, tree },
    }),
    "build tree"
  );
  const commit = await must<{ sha: string }>(
    gh(token, `/repos/${fork}/git/commits`, {
      method: "POST",
      body: { message: opts.title, tree: newTree.sha, parents: [baseSha] },
    }),
    "commit"
  );
  await must(
    gh(token, `/repos/${fork}/git/refs`, {
      method: "POST",
      body: { ref: `refs/heads/${opts.branch}`, sha: commit.sha },
    }),
    "create branch"
  );
  const pr = await must<{ number: number; html_url: string }>(
    gh(token, `/repos/${FREE_DB_REPO}/pulls`, {
      method: "POST",
      body: {
        title: opts.title,
        body: opts.body,
        head: `${login}:${opts.branch}`,
        base: "main",
        maintainer_can_modify: true,
      },
    }),
    "open PR"
  );
  return { number: pr.number, url: pr.html_url };
}

export async function freeDbPrState(
  token: string,
  number: number
): Promise<"open" | "merged" | "closed"> {
  const pr = await must<{ state: string; merged_at: string | null }>(
    gh(token, `/repos/${FREE_DB_REPO}/pulls/${number}`),
    "read PR"
  );
  if (pr.merged_at) return "merged";
  return pr.state === "closed" ? "closed" : "open";
}

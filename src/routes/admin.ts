import { Context, Hono } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { html, raw } from "hono/html";
import { z } from "zod";
import {
  Env,
  FeedConfig,
  FeedList,
  FeedMetadata,
  EmailMetadata,
  EmailData,
  FeedListItem,
} from "../types";
import { generateFeedId } from "../utils/id-generator";
import { designSystem } from "../styles/index";
import { interactiveScripts } from "../scripts/index";

/**
 * Admin routes handler for Email-to-RSS
 * Provides a secure interface for managing RSS feeds and viewing emails
 *
 * Security:
 * - All routes except /login are protected by server-side cookie authentication
 * - Uses HttpOnly cookies to prevent XSS attacks
 * - Implements SameSite=Strict to prevent CSRF attacks
 */
const app = new Hono();

// Export for testing
export default app;

const ADMIN_COOKIE_NAME = "admin_auth";
const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 1 week

function waitUntilSafe(c: Context, promise: Promise<unknown>) {
  // Hono throws when ExecutionContext isn't present (ex: Node unit tests).
  try {
    c.executionCtx.waitUntil(promise);
  } catch {
    // ignore
  }
}

function parseAllowedSenders(rawAllowedSenders: string): string[] {
  return rawAllowedSenders
    .split(/[\n,]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function clampText(value: string, maxLen: number): string {
  const raw = `${value || ""}`;
  if (raw.length <= maxLen) {
    return raw.trim();
  }
  if (maxLen <= 3) {
    return raw.slice(0, maxLen).trim();
  }
  return `${raw.slice(0, maxLen - 3).trimEnd()}...`;
}

// Prevent accidental caching of admin pages and redirects.
app.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store, max-age=0");
  await next();
});

// Authentication middleware for admin routes
async function authMiddleware(c: Context, next: () => Promise<void>) {
  const env = c.env as unknown as Env;
  const path = new URL(c.req.url).pathname;

  // Skip auth check for login page - note that path includes /admin prefix
  if (path === "/admin/login") {
    return next();
  }

  const authCookie = await getSignedCookie(
    c,
    env.ADMIN_PASSWORD,
    ADMIN_COOKIE_NAME,
  );
  if (authCookie !== "1") {
    return c.redirect("/admin/login");
  }

  await next();
}

// Apply auth middleware to all admin routes
app.use("*", authMiddleware);

// Schema for feed creation
const createFeedSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  language: z.string().optional().default("en"),
  allowedSenders: z.array(z.string()).optional().default([]),
});

// Schema for feed updates
const updateFeedSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  language: z.string().optional().default("en"),
  allowedSenders: z.array(z.string()).optional().default([]),
});

// Authentication schema
const authSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

// Base HTML layout with design system
const layout = (title: string, content: any) => {
  return html`<!DOCTYPE html>
    <html>
      <head>
        <title>${title} - Email to RSS Admin</title>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="color-scheme" content="light dark" />
        <style>
          ${raw(designSystem)}
        </style>
        <script>
          ${raw(interactiveScripts)};
        </script>
      </head>
      <body class="page">
        ${content}
      </body>
    </html>`;
};

// Login page
app.get("/login", (c) => {
  const error = c.req.query("error");
  const errorMessage =
    error === "invalid" ? "Invalid password. Please try again." : "";

  return c.html(
    layout(
      "Login",
      html`
        <div class="auth-container fade-in">
          <div class="auth-card">
            <div class="auth-logo">
              <svg
                width="64"
                height="64"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect
                  width="24"
                  height="24"
                  rx="12"
                  fill="var(--color-primary)"
                />
                <path
                  d="M17 9C17 7.89543 16.1046 7 15 7H9C7.89543 7 7 7.89543 7 9V15C7 16.1046 7.89543 17 9 17H15C16.1046 17 17 16.1046 17 15V9Z"
                  stroke="white"
                  stroke-width="1.5"
                />
                <path
                  d="M7 9L12 13L17 9"
                  stroke="white"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </div>
            <h1 class="auth-title">Email to RSS Admin</h1>
            ${errorMessage
              ? html`<div class="auth-error">${errorMessage}</div>`
              : ""}
            <form class="auth-form" action="/admin/login" method="post">
              <div class="form-group">
                <label for="password">Password</label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  required
                  autofocus
                />
              </div>
              <button type="submit" class="button auth-button">Log In</button>
            </form>
          </div>
        </div>
      `,
    ),
  );
});

// Handle login
app.post("/login", async (c) => {
  const env = c.env as unknown as Env;

  try {
    const formData = await c.req.formData();
    const password = formData.get("password")?.toString() || "";

    // Validate password
    authSchema.parse({ password });

    // Check password against environment variable
    if (password === env.ADMIN_PASSWORD) {
      await setSignedCookie(c, ADMIN_COOKIE_NAME, "1", env.ADMIN_PASSWORD, {
        path: "/",
        httpOnly: true,
        sameSite: "Strict",
        secure: true,
        maxAge: ADMIN_COOKIE_MAX_AGE,
      });
      return c.redirect("/admin");
    }

    // Incorrect password - redirect back to login with an error message
    return c.redirect("/admin/login?error=invalid");
  } catch (error) {
    console.error("Login error:", error);
    return c.redirect("/admin/login?error=invalid");
  }
});

// Logout route
app.get("/logout", (c) => {
  deleteCookie(c, ADMIN_COOKIE_NAME, { path: "/" });
  return c.redirect("/admin/login");
});

// Admin dashboard route
app.get("/", async (c) => {
  // Type assertion for environment variables
  const env = c.env as unknown as Env;
  const emailStorage = env.EMAIL_STORAGE;
  const url = new URL(c.req.url);
  const view = url.searchParams.get("view") === "table" ? "table" : "list";
  const message = url.searchParams.get("message");
  const count = Number(url.searchParams.get("count") || "0");

  // List all feeds
  const feedList = await listAllFeeds(emailStorage);

  // Keep the dashboard fast: avoid N KV reads for N feeds.
  // We store title/description in `feeds:list` (description is optional for older data).
  const feedsWithConfig = feedList.map((feed) => ({
    ...feed,
    description: feed.description || "",
  }));

  const viewHref = (nextView: "list" | "table") => {
    const nextUrl = new URL(url);
    nextUrl.pathname = "/admin";
    nextUrl.searchParams.set("view", nextView);
    const qs = nextUrl.searchParams.toString();
    return `${nextUrl.pathname}${qs ? `?${qs}` : ""}`;
  };

  const viewToggle = html`
    <div class="segmented" role="tablist" aria-label="Feed view">
      <a
        class="segmented-item ${view === "list" ? "is-active" : ""}"
        href="${viewHref("list")}"
        role="tab"
        aria-selected="${view === "list" ? "true" : "false"}"
        >List</a
      >
      <a
        class="segmented-item ${view === "table" ? "is-active" : ""}"
        href="${viewHref("table")}"
        role="tab"
        aria-selected="${view === "table" ? "true" : "false"}"
        >Table</a
      >
    </div>
  `;

  return c.html(
    layout(
      "Dashboard",
      html`
        <div class="container ${view === "table" ? "container-wide" : ""} fade-in">
          <div class="header-with-actions">
            <div class="header-title">
              <h1>Email to RSS Admin</h1>
              <p>Manage your email newsletter feeds</p>
            </div>
            <div class="header-actions">
              <a href="/admin/logout" class="button button-logout">Logout</a>
            </div>
          </div>

          <div class="card">
            <h2>Create New Feed</h2>
            <form action="/admin/feeds/create" method="post">
              <div class="form-group">
                <label for="title">Feed Title</label>
                <input type="text" id="title" name="title" required />
              </div>

              <div class="form-group">
                <label for="description">Description</label>
                <textarea
                  id="description"
                  name="description"
                  rows="3"
                ></textarea>
              </div>

              <div class="form-group">
                <label for="allowed_senders"
                  >Allowed senders (optional, one email or domain per
                  line)</label
                >
                <textarea
                  id="allowed_senders"
                  name="allowed_senders"
                  rows="3"
                  placeholder="newsletter@example.com&#10;techmeme.com"
                ></textarea>
                <small
                  >When set, inbound emails are only accepted from these
                  senders/domains.</small
                >
              </div>

              <input type="hidden" id="language" name="language" value="en" />
              <input type="hidden" name="view" value="${view}" />

              <button type="submit" class="button">Create Feed</button>
            </form>
          </div>

          ${message === "bulkDeleted"
            ? html`<div class="card">
                <p>Deleted ${Number.isFinite(count) ? count : 0} feed(s).</p>
              </div>`
            : ""}
          ${message === "bulkDeleteNoop"
            ? html`<div class="card"><p>No feeds were selected.</p></div>`
            : ""}

	          <div class="toolbar">
	            <div class="toolbar-group">
	              <h2 style="margin: 0;">Your Feeds</h2>
	              <span class="pill" id="feed-total-count"
	                >${feedsWithConfig.length}</span
	              >
	            </div>
	            <div class="toolbar-group">${viewToggle}</div>
	          </div>

          ${feedsWithConfig.length === 0
            ? html`<div class="card">
                <p>You don't have any feeds yet. Create one above.</p>
              </div>`
            : view === "table"
              ? html`
	                  <div class="card">
	                    <form
	                      id="bulk-feed-delete-form"
	                      action="/admin/feeds/bulk-delete"
	                      method="post"
	                      onsubmit="return onBulkFeedDeleteSubmit(event)"
	                    >
	                      <input type="hidden" name="view" value="table" />

                      <div class="toolbar">
                        <div class="toolbar-group toolbar-group-fill">
                          <input
                            type="search"
                            id="feed-search"
                            class="search"
                            placeholder="Search title, feed id, or description"
                            oninput="scheduleFeedFilter()"
                          />
                          <span class="pill" id="feed-match-count"
                            >Showing ${feedsWithConfig.length}</span
                          >
                          <span class="pill" id="selected-feed-count"
                            >0 selected</span
                          >
                          <button
                            type="button"
                            class="button button-small button-secondary"
                            onclick="selectMatchingFeeds()"
                          >
                            Select Results
                          </button>
                          <button
                            type="button"
                            class="button button-small button-secondary"
                            onclick="clearFeedSelection()"
                          >
                            Clear Selection
                          </button>
                          <button
                            id="bulk-delete-feeds-button"
                            type="submit"
                            class="button button-small button-danger"
                            disabled
                          >
                            Delete Selected
                          </button>
                        </div>
                      </div>

                      <div class="table-wrap">
                        <table class="table table-feeds">
                          <colgroup>
                            <col data-col="select" style="width: 44px;" />
                            <col data-col="title" style="width: 340px;" />
                            <col data-col="feedId" style="width: 160px;" />
                            <col data-col="email" style="width: 220px;" />
                            <col data-col="rss" style="width: 220px;" />
                            <col data-col="actions" style="width: 200px;" />
                          </colgroup>
                          <thead>
                            <tr>
                              <th>
                                <input
                                  type="checkbox"
                                  id="select-all-feeds"
                                  onchange="toggleAllFeeds(this.checked)"
                                />
                              </th>
                              <th class="th-resizable" data-sort-key="title" aria-sort="none">
                                <button type="button" class="th-button" data-sort-key="title">
                                  Title <span class="sort-indicator" aria-hidden="true"></span>
                                </button>
                                <div class="col-resizer" data-col="title" title="Resize"></div>
                              </th>
                              <th class="th-resizable" data-sort-key="feedId" aria-sort="none">
                                <button type="button" class="th-button" data-sort-key="feedId">
                                  Feed ID <span class="sort-indicator" aria-hidden="true"></span>
                                </button>
                                <div class="col-resizer" data-col="feedId" title="Resize"></div>
                              </th>
                              <th class="th-resizable" data-sort-key="email" aria-sort="none">
                                <button type="button" class="th-button" data-sort-key="email">
                                  Email <span class="sort-indicator" aria-hidden="true"></span>
                                </button>
                                <div class="col-resizer" data-col="email" title="Resize"></div>
                              </th>
                              <th class="th-resizable" data-sort-key="rss" aria-sort="none">
                                <button type="button" class="th-button" data-sort-key="rss">
                                  RSS <span class="sort-indicator" aria-hidden="true"></span>
                                </button>
                                <div class="col-resizer" data-col="rss" title="Resize"></div>
                              </th>
                              <th class="th-resizable">
                                <span>Actions</span>
                                <div class="col-resizer" data-col="actions" title="Resize"></div>
                              </th>
                            </tr>
                          </thead>
                          <tbody id="feed-table-body">
                            ${feedsWithConfig.map((feed) => {
                              const emailAddress = `${feed.id}@${env.DOMAIN}`;
                              const rssUrl = `https://${env.DOMAIN}/rss/${feed.id}`;
                              const titleDisplay = clampText(feed.title, 160);
                              const titleHover = clampText(feed.title, 1000);
                              const sortTitle = titleHover.toLowerCase();
                              const sortFeedId = feed.id.toLowerCase();
                              const sortEmail = emailAddress.toLowerCase();
                              const sortRss = rssUrl.toLowerCase();
                              const descDisplay = clampText(feed.description || "", 220);
                              const descHover = clampText(feed.description || "", 1000);
                              const searchHaystack =
                                `${clampText(feed.title, 320)} ${feed.id} ${clampText(feed.description || "", 320)}`.toLowerCase();

                              return html`
                            <tr
                              class="feed-row"
                              data-feed-id="${feed.id}"
                              data-search="${searchHaystack}"
                              data-sort-title="${sortTitle}"
                              data-sort-feed-id="${sortFeedId}"
                              data-sort-email="${sortEmail}"
                              data-sort-rss="${sortRss}"
                            >
                                  <td>
                                    <input
                                      type="checkbox"
                                      class="feed-select"
                                      name="feedIds"
                                      value="${feed.id}"
                                      onchange="updateFeedSelectionState()"
                                    />
                                  </td>
                                  <td>
                                    <strong class="truncate" title="${titleHover}"
                                      >${titleDisplay}</strong
                                    >
                                    ${feed.description
                                      ? html`<div
                                          class="muted truncate"
                                          style="font-size: var(--font-size-sm); margin-top: 4px;"
                                          title="${descHover}"
                                        >
                                          ${descDisplay}
                                        </div>`
                                      : ""}
                                  </td>
                                  <td><code>${feed.id}</code></td>
                                  <td>
                                    <div class="copyable copyable-inline">
                                      <div class="copyable-content">
                                        <span
                                          class="copyable-value"
                                          data-copy="${emailAddress}"
                                          title="${emailAddress}"
                                          >${emailAddress}</span
                                        >
                                        <div class="copy-icon-container">
                                          <svg
                                            class="copy-icon copy-icon-original"
                                            width="16"
                                            height="16"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            stroke-width="2"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                          >
                                            <rect
                                              x="9"
                                              y="9"
                                              width="13"
                                              height="13"
                                              rx="2"
                                              ry="2"
                                            ></rect>
                                            <path
                                              d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                                            ></path>
                                          </svg>
                                          <svg
                                            class="copy-icon copy-icon-success"
                                            width="16"
                                            height="16"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            stroke-width="2"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                          >
                                            <path
                                              d="M20 6L9 17l-5-5"
                                            ></path>
                                          </svg>
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                  <td>
                                    <div class="copyable copyable-inline">
                                      <div class="copyable-content">
                                        <span
                                          class="copyable-value"
                                          data-copy="${rssUrl}"
                                          title="${rssUrl}"
                                          >${rssUrl}</span
                                        >
                                        <div class="copy-icon-container">
                                          <svg
                                            class="copy-icon copy-icon-original"
                                            width="16"
                                            height="16"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            stroke-width="2"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                          >
                                            <rect
                                              x="9"
                                              y="9"
                                              width="13"
                                              height="13"
                                              rx="2"
                                              ry="2"
                                            ></rect>
                                            <path
                                              d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                                            ></path>
                                          </svg>
                                          <svg
                                            class="copy-icon copy-icon-success"
                                            width="16"
                                            height="16"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            stroke-width="2"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                          >
                                            <path
                                              d="M20 6L9 17l-5-5"
                                            ></path>
                                          </svg>
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                  <td>
                                    <div class="row-actions">
                                      <a
                                        href="/admin/feeds/${feed.id}/edit"
                                        class="button button-small"
                                        >Edit</a
                                      >
                                      <a
                                        href="/admin/feeds/${feed.id}/emails"
                                        class="button button-small"
                                        >Emails</a
                                      >
                                      <button
                                        type="button"
                                        class="button button-small button-danger button-delete"
                                        data-delete-kind="feed"
                                        data-feed-id="${feed.id}"
                                        data-view="table"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              `;
                            })}
                          </tbody>
                        </table>
                      </div>
                    </form>
                  </div>
                `
              : html`
                  <div class="toolbar">
                    <div class="toolbar-group toolbar-group-fill">
                      <input
                        type="search"
                        id="feed-search"
                        class="search"
                        placeholder="Search title, feed id, or description"
                        oninput="scheduleFeedFilter()"
                      />
                      <span class="pill"
                        >Tip: use Table view for bulk deletion.</span
                      >
                    </div>
                  </div>

                  <ul class="feed-list">
                    ${feedsWithConfig.map((feed) => {
                      const emailAddress = `${feed.id}@${env.DOMAIN}`;
                      const rssUrl = `https://${env.DOMAIN}/rss/${feed.id}`;
                      const titleDisplay = clampText(feed.title, 140);
                      const titleHover = clampText(feed.title, 1000);
                      const descDisplay = clampText(feed.description || "", 240);
                      const descHover = clampText(feed.description || "", 1000);
                      const searchHaystack =
                        `${clampText(feed.title, 320)} ${feed.id} ${clampText(feed.description || "", 320)}`.toLowerCase();

                      return html`
                        <li
                          class="feed-item card feed-row"
                          data-feed-id="${feed.id}"
                          data-search="${searchHaystack}"
                        >
                          <div class="feed-header">
                            <h3 class="feed-title" title="${titleHover}">
                              ${titleDisplay}
                            </h3>
                            ${feed.description
                              ? html`<p class="feed-description">
                                  <span title="${descHover}">${descDisplay}</span>
                                </p>`
                              : ""}
                          </div>

                          <div style="margin-bottom: var(--spacing-md);">
                            <div class="copyable">
                              <span class="copyable-label">Email:</span>
                              <div class="copyable-content">
                                <span
                                  class="copyable-value"
                                  data-copy="${emailAddress}"
                                  title="${emailAddress}"
                                  >${emailAddress}</span
                                >
                                <div class="copy-icon-container">
                                  <svg
                                    class="copy-icon copy-icon-original"
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                  >
                                    <rect
                                      x="9"
                                      y="9"
                                      width="13"
                                      height="13"
                                      rx="2"
                                      ry="2"
                                    ></rect>
                                    <path
                                      d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                                    ></path>
                                  </svg>
                                  <svg
                                    class="copy-icon copy-icon-success"
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                  >
                                    <path d="M20 6L9 17l-5-5"></path>
                                  </svg>
                                </div>
                              </div>
                            </div>
                            <div class="copyable">
                              <span class="copyable-label">RSS Feed:</span>
                              <div class="copyable-content">
                                <span
                                  class="copyable-value"
                                  data-copy="${rssUrl}"
                                  title="${rssUrl}"
                                  >${rssUrl}</span
                                >
                                <div class="copy-icon-container">
                                  <svg
                                    class="copy-icon copy-icon-original"
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                  >
                                    <rect
                                      x="9"
                                      y="9"
                                      width="13"
                                      height="13"
                                      rx="2"
                                      ry="2"
                                    ></rect>
                                    <path
                                      d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                                    ></path>
                                  </svg>
                                  <svg
                                    class="copy-icon copy-icon-success"
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                  >
                                    <path d="M20 6L9 17l-5-5"></path>
                                  </svg>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div class="feed-buttons">
                            <div class="feed-buttons-left">
                              <a
                                href="/admin/feeds/${feed.id}/edit"
                                class="button button-small"
                                >Edit</a
                              >
                              <a
                                href="/admin/feeds/${feed.id}/emails"
                                class="button button-small"
                                >Emails</a
                              >
                            </div>
                            <div class="feed-buttons-right">
                              <button
                                type="button"
                                class="button button-small button-danger button-delete"
                                data-delete-kind="feed"
                                data-feed-id="${feed.id}"
                                data-view="list"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </li>
                      `;
                    })}
                  </ul>
                `}
        </div>

        <script>
          ${raw(`
	        let FEED_ROWS = [];
	        let FEED_CHECKBOXES = [];
	        let FEED_SELECTED_COUNT_EL = null;
	        let FEED_MATCH_COUNT_EL = null;
	        let FEED_TOTAL_COUNT_EL = null;
	        let FEED_BULK_DELETE_BUTTON_EL = null;
	        let FEED_SELECT_ALL_EL = null;
	        let FEED_FILTER_TIMER = null;
	        let FEED_BULK_DELETE_IN_PROGRESS = false;
	        let FEED_SORT_KEY = 'title';
	        let FEED_SORT_DIR = 'asc';
	        const FEED_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

	        function initFeedUI() {
	          FEED_ROWS = Array.from(document.querySelectorAll('.feed-row'));
	          FEED_CHECKBOXES = Array.from(document.querySelectorAll('.feed-select'));
	          FEED_SELECTED_COUNT_EL = document.getElementById('selected-feed-count');
	          FEED_MATCH_COUNT_EL = document.getElementById('feed-match-count');
	          FEED_TOTAL_COUNT_EL = document.getElementById('feed-total-count');
	          FEED_BULK_DELETE_BUTTON_EL = document.getElementById('bulk-delete-feeds-button');
	          FEED_SELECT_ALL_EL = document.getElementById('select-all-feeds');
	          setupFeedTableResizing();
	          setupFeedTableSorting();
	          setupFeedDeleteButtons();
          updateFeedMatchCount();
          updateFeedSelectionState();
        }

        function updateFeedMatchCount() {
          if (!FEED_MATCH_COUNT_EL) return;
          const total = FEED_ROWS.length;
          const visible = FEED_ROWS.filter((row) => !row.hidden).length;
          const query = (document.getElementById('feed-search')?.value || '').trim();
          FEED_MATCH_COUNT_EL.textContent = query ? ('Showing ' + visible + ' of ' + total) : ('Showing ' + total);
        }

        function scheduleFeedFilter() {
          if (FEED_FILTER_TIMER) {
            clearTimeout(FEED_FILTER_TIMER);
          }
          FEED_FILTER_TIMER = setTimeout(filterFeedRows, 120);
        }

        function getSortValue(row, key) {
          const prop = 'sort' + key.charAt(0).toUpperCase() + key.slice(1);
          return (row.dataset && row.dataset[prop]) ? row.dataset[prop] : '';
        }

        function updateFeedSortIndicators(table) {
          const headerCells = Array.from(table.querySelectorAll('th[data-sort-key]'));
          headerCells.forEach((th) => {
            const key = th.getAttribute('data-sort-key') || '';
            const indicator = th.querySelector('.sort-indicator');
            const active = key === FEED_SORT_KEY;

            if (indicator) {
              indicator.textContent = active ? (FEED_SORT_DIR === 'asc' ? '^' : 'v') : '';
            }
            th.setAttribute('aria-sort', active ? (FEED_SORT_DIR === 'asc' ? 'ascending' : 'descending') : 'none');
          });
        }

        function sortFeedTableBy(key) {
          const table = document.querySelector('table.table-feeds');
          const tbody = document.getElementById('feed-table-body');
          if (!table || !tbody) return;

          if (FEED_SORT_KEY === key) {
            FEED_SORT_DIR = FEED_SORT_DIR === 'asc' ? 'desc' : 'asc';
          } else {
            FEED_SORT_KEY = key;
            FEED_SORT_DIR = 'asc';
          }

          const dirMultiplier = FEED_SORT_DIR === 'asc' ? 1 : -1;
          const rows = Array.from(tbody.querySelectorAll('.feed-row'));
          rows.sort((a, b) => {
            const av = getSortValue(a, FEED_SORT_KEY);
            const bv = getSortValue(b, FEED_SORT_KEY);
            return dirMultiplier * FEED_COLLATOR.compare(av, bv);
          });

          const fragment = document.createDocumentFragment();
          rows.forEach((row) => fragment.appendChild(row));
          tbody.appendChild(fragment);

          updateFeedSortIndicators(table);
        }

        function setupFeedTableSorting() {
          const table = document.querySelector('table.table-feeds');
          if (!table) return;

          table.querySelectorAll('button.th-button[data-sort-key]').forEach((button) => {
            button.addEventListener('click', () => {
              const key = button.getAttribute('data-sort-key') || '';
              if (!key) return;
              sortFeedTableBy(key);
            });
          });

          updateFeedSortIndicators(table);
        }

        function setupFeedTableResizing() {
          const table = document.querySelector('table.table-feeds');
          if (!table) return;

          const storageKey = 'email-to-rss.admin.feedsTable.colWidths';
          const minWidths = {
            title: 220,
            feedId: 120,
            email: 160,
            rss: 160,
            actions: 160,
          };
          const defaultWidths = {
            title: 340,
            feedId: 160,
            email: 220,
            rss: 220,
            actions: 200,
          };

          const cols = Array.from(table.querySelectorAll('colgroup col'));
          const colByKey = {};
          cols.forEach((col) => {
            const key = col.getAttribute('data-col');
            if (key) colByKey[key] = col;
          });

          // Restore widths
          try {
            const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
            Object.keys(saved || {}).forEach((key) => {
              const px = Number(saved[key]);
              if (!colByKey[key] || !Number.isFinite(px)) return;
              colByKey[key].style.width = px + 'px';
            });
          } catch {
            // Ignore bad localStorage values
          }

          const persist = () => {
            try {
              const out = {};
              Object.keys(colByKey).forEach((key) => {
                if (key === 'select') return;
                const px = parseInt(colByKey[key].style.width || '0', 10);
                if (Number.isFinite(px) && px > 0) out[key] = px;
              });
              localStorage.setItem(storageKey, JSON.stringify(out));
            } catch {
              // localStorage may be unavailable in some modes; ignore
            }
          };

          let active = null;
          let rafId = 0;
          let pendingWidth = 0;

          table.querySelectorAll('.col-resizer').forEach((handle) => {
            handle.addEventListener('pointerdown', (event) => {
              event.preventDefault();
              event.stopPropagation();

              const key = handle.getAttribute('data-col');
              const col = key ? colByKey[key] : null;
              if (!key || !col) return;

              const th = handle.closest('th');
              const startWidth = th ? th.getBoundingClientRect().width : parseInt(col.style.width || '0', 10) || 120;

              active = { key, col, startX: event.clientX, startWidth };
              document.body.classList.add('is-resizing');
              handle.setPointerCapture(event.pointerId);
            });

            handle.addEventListener('pointermove', (event) => {
              if (!active) return;
              const minPx = minWidths[active.key] || 120;
              const nextWidth = Math.max(minPx, Math.round(active.startWidth + (event.clientX - active.startX)));
              pendingWidth = nextWidth;
              if (rafId) return;
              rafId = requestAnimationFrame(() => {
                active.col.style.width = pendingWidth + 'px';
                rafId = 0;
              });
            });

            const finish = () => {
              if (!active) return;
              active = null;
              document.body.classList.remove('is-resizing');
              persist();
            };
            handle.addEventListener('pointerup', finish);
            handle.addEventListener('pointercancel', finish);

            handle.addEventListener('dblclick', (event) => {
              event.preventDefault();
              event.stopPropagation();
              const key = handle.getAttribute('data-col');
              const col = key ? colByKey[key] : null;
              const px = key ? defaultWidths[key] : null;
              if (!key || !col || !px) return;
              col.style.width = px + 'px';
              persist();
            });
          });
        }

        const DELETE_CONFIRM_LABEL = 'Confirm delete';
        const DELETE_LOADING_LABEL = 'Deleting...';
        const DELETE_CONFIRM_TIMEOUT_MS = 4000;

        function getDeleteView() {
          return new URL(window.location.href).searchParams.get('view') || 'list';
        }

        function resetDeleteButton(buttonEl) {
          if (!buttonEl) return;
          buttonEl.classList.remove('is-confirming');
          buttonEl.removeAttribute('data-confirming');
          buttonEl.disabled = false;
          const original = buttonEl.dataset.originalLabel || (buttonEl.textContent || '').trim() || 'Delete';
          buttonEl.innerHTML = original;
        }

        function animateRowRemoval(row, onDone) {
          if (!row) {
            if (onDone) onDone();
            return;
          }

          const isListItem = row.tagName.toLowerCase() === 'li';
          if (isListItem) {
            row.style.maxHeight = row.getBoundingClientRect().height + 'px';
            row.style.overflow = 'hidden';
          }

          row.classList.add('is-removing');

          requestAnimationFrame(() => {
            if (isListItem) {
              row.style.maxHeight = '0px';
              row.style.marginTop = '0px';
              row.style.marginBottom = '0px';
              row.style.paddingTop = '0px';
              row.style.paddingBottom = '0px';
            }
          });

          window.setTimeout(() => {
            row.remove();
            if (onDone) onDone();
          }, 240);
        }

        async function deleteFeedRequest(feedId, view) {
          const res = await fetch('/admin/feeds/' + encodeURIComponent(feedId) + '/delete?view=' + encodeURIComponent(view), {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
            },
            credentials: 'same-origin',
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            const message = data && data.error ? String(data.error) : ('Request failed (' + res.status + ')');
            throw new Error(message);
          }
          return data;
        }

        function refreshFeedRowCache() {
          FEED_ROWS = Array.from(document.querySelectorAll('.feed-row'));
          FEED_CHECKBOXES = Array.from(document.querySelectorAll('.feed-select'));
          if (FEED_TOTAL_COUNT_EL) {
            FEED_TOTAL_COUNT_EL.textContent = String(FEED_ROWS.length);
          }
          updateFeedMatchCount();
          updateFeedSelectionState();
        }

        function setupFeedDeleteButtons() {
          const buttons = Array.from(document.querySelectorAll('button[data-delete-kind="feed"]'));
          buttons.forEach((button) => {
            if (button.dataset.deleteReady === 'true') return;
            button.dataset.deleteReady = 'true';
            const original = (button.textContent || '').trim() || 'Delete';
            button.dataset.originalLabel = original;

            let confirming = false;
            let confirmTimer = 0;
            let inFlight = false;

            const startConfirm = () => {
              confirming = true;
              button.classList.add('is-confirming');
              button.setAttribute('data-confirming', 'true');
              button.innerHTML = DELETE_CONFIRM_LABEL;
              if (confirmTimer) window.clearTimeout(confirmTimer);
              confirmTimer = window.setTimeout(() => {
                confirming = false;
                resetDeleteButton(button);
              }, DELETE_CONFIRM_TIMEOUT_MS);
            };

            button.addEventListener('click', async (event) => {
              event.preventDefault();
              if (inFlight) return;

              if (!confirming) {
                startConfirm();
                return;
              }

              if (confirmTimer) window.clearTimeout(confirmTimer);
              inFlight = true;
              setButtonLoading(button, true, DELETE_LOADING_LABEL);

              const toast = window.showToast
                ? window.showToast('Deleting feed...', { type: 'info', loading: true, duration: 0 })
                : null;

              const feedId = button.getAttribute('data-feed-id') || '';
              const view = button.getAttribute('data-view') || getDeleteView();
              const row = button.closest('.feed-row');

              try {
                await deleteFeedRequest(feedId, view);

                if (toast && toast.update) {
                  toast.update('Feed deleted.', { type: 'success', loading: false, duration: 3200 });
                } else if (window.showToast) {
                  window.showToast('Feed deleted.', { type: 'success' });
                }

                animateRowRemoval(row, () => {
                  refreshFeedRowCache();
                });
              } catch (error) {
                if (toast && toast.update) {
                  toast.update('Delete failed: ' + (error && error.message ? error.message : 'Unknown error'), { type: 'error', loading: false, duration: 6500 });
                } else if (window.showToast) {
                  window.showToast('Delete failed: ' + (error && error.message ? error.message : 'Unknown error'), { type: 'error', duration: 6500 });
                }
                setButtonLoading(button, false);
                confirming = false;
                resetDeleteButton(button);
              } finally {
                inFlight = false;
                if (!row) {
                  setButtonLoading(button, false);
                  confirming = false;
                  resetDeleteButton(button);
                }
              }
            });

            button.addEventListener('keydown', (event) => {
              if (event.key === 'Escape' && confirming && !inFlight) {
                confirming = false;
                if (confirmTimer) window.clearTimeout(confirmTimer);
                resetDeleteButton(button);
              }
            });
          });
        }

        function updateFeedSelectionState() {
          if (!FEED_CHECKBOXES.length) {
            return;
          }

          const selected = FEED_CHECKBOXES.filter((checkbox) => checkbox.checked);

          if (FEED_SELECTED_COUNT_EL) {
            FEED_SELECTED_COUNT_EL.textContent = selected.length + ' selected';
          }
          if (FEED_BULK_DELETE_BUTTON_EL) {
            FEED_BULK_DELETE_BUTTON_EL.disabled = selected.length === 0;
          }
          if (FEED_SELECT_ALL_EL) {
            const visibleCheckboxes = FEED_CHECKBOXES.filter((checkbox) => !(checkbox.closest('tr')?.hidden));
            FEED_SELECT_ALL_EL.checked = visibleCheckboxes.length > 0 && visibleCheckboxes.every((checkbox) => checkbox.checked);
          }
        }

        function toggleAllFeeds(checked) {
          FEED_CHECKBOXES.forEach((checkbox) => {
            if (!checkbox.closest('tr')?.hidden) {
              checkbox.checked = checked;
            }
          })
          updateFeedSelectionState();
        }

        function setVisibleFeedSelection(checked) {
          FEED_CHECKBOXES.forEach((checkbox) => {
            if (!checkbox.closest('tr')?.hidden) {
              checkbox.checked = checked;
            }
          })
          updateFeedSelectionState();
        }

        function selectMatchingFeeds() {
          setVisibleFeedSelection(true);
        }

        function clearFeedSelection() {
          FEED_CHECKBOXES.forEach((checkbox) => {
            checkbox.checked = false;
          })
          updateFeedSelectionState();
        }

        function filterFeedRows() {
          const query = (document.getElementById('feed-search')?.value || '').toLowerCase().trim();
          FEED_ROWS.forEach((row) => {
            const haystack = row.getAttribute('data-search') || '';
            row.hidden = !!query && !haystack.includes(query);
          });
          updateFeedMatchCount();
          updateFeedSelectionState();
        }

	        function confirmBulkFeedDelete() {
	          const selected = FEED_CHECKBOXES.filter((checkbox) => checkbox.checked).length;
	          if (selected === 0) return false;
	
	          const query = (document.getElementById('feed-search')?.value || '').trim();
	          const extra =
	            selected >= 50 && !query
	              ? '\\n\\nThis is a large delete. Tip: use Search to narrow down spam first.'
	              : '';
	          return confirm(
	            'Delete ' +
	              selected +
	              ' selected feed(s)? This will also delete all emails inside those feeds.' +
	              extra,
	          );
	        }

	        function setButtonLoading(buttonEl, loading, label) {
	          if (!buttonEl) return;
	          if (loading) {
	            if (!buttonEl.dataset.originalLabel) {
	              buttonEl.dataset.originalLabel = (buttonEl.textContent || '').trim();
	            }
	            const text = label || 'Working...';
	            buttonEl.classList.add('is-loading');
	            buttonEl.disabled = true;
	            buttonEl.innerHTML = '<span class=\"spinner\" aria-hidden=\"true\"></span>' + text;
	            return;
	          }
	
	          const original = buttonEl.dataset.originalLabel || (buttonEl.textContent || '').trim();
	          buttonEl.classList.remove('is-loading');
	          buttonEl.innerHTML = original;
	        }

	        function removeFeedRowsById(feedIds) {
	          const toRemove = new Set((feedIds || []).map((v) => String(v)));
	          if (toRemove.size === 0) return;
	
	          FEED_ROWS.forEach((row) => {
	            const checkbox = row.querySelector('input.feed-select');
	            const id = checkbox ? checkbox.value : '';
	            if (toRemove.has(id)) {
	              row.remove();
	            }
	          });
	
	          FEED_ROWS = Array.from(document.querySelectorAll('.feed-row'));
	          FEED_CHECKBOXES = Array.from(document.querySelectorAll('.feed-select'));
	
	          if (FEED_TOTAL_COUNT_EL) {
	            FEED_TOTAL_COUNT_EL.textContent = String(FEED_ROWS.length);
	          }
	        }

	        function onBulkFeedDeleteSubmit(event) {
	          if (event && event.preventDefault) event.preventDefault();
	          void bulkDeleteSelectedFeeds();
	          return false;
	        }

	        async function bulkDeleteSelectedFeeds() {
	          if (FEED_BULK_DELETE_IN_PROGRESS) return;
	          const selectedIds = FEED_CHECKBOXES.filter((checkbox) => checkbox.checked).map((checkbox) => checkbox.value);
	          if (selectedIds.length === 0) {
	            if (window.showToast) window.showToast('No feeds selected.', { type: 'info' });
	            return;
	          }
	          if (!confirmBulkFeedDelete()) {
	            return;
	          }
	
	          FEED_BULK_DELETE_IN_PROGRESS = true;
	          setButtonLoading(FEED_BULK_DELETE_BUTTON_EL, true, 'Deleting...');
	
	          const toast = window.showToast
	            ? window.showToast('Deleting ' + selectedIds.length + ' feed(s)...', { type: 'info', loading: true, duration: 0 })
	            : null;
	
	          const batchSize = 10;
	          let deletedTotal = 0;
	          const failed = [];
	
	          try {
	            for (let i = 0; i < selectedIds.length; i += batchSize) {
	              const batch = selectedIds.slice(i, i + batchSize);
	              const res = await fetch('/admin/feeds/bulk-delete', {
	                method: 'POST',
	                headers: {
	                  'Content-Type': 'application/json',
	                  'Accept': 'application/json',
	                },
	                credentials: 'same-origin',
	                body: JSON.stringify({ feedIds: batch }),
	              });
	
	              let data = {};
	              if (window.parseJsonResponseOrThrow) {
	                data = await window.parseJsonResponseOrThrow(res, { prefix: 'Bulk feed delete failed' });
	              } else {
	                data = await res.json().catch(() => ({}));
	                if (!res.ok) {
	                  const message = data && data.error ? String(data.error) : ('Bulk feed delete failed (HTTP ' + res.status + ')');
	                  throw new Error(message);
	                }
	              }
	
	              const deletedIds = Array.isArray(data.deletedFeedIds) ? data.deletedFeedIds : batch;
	              const failedIds = Array.isArray(data.failedFeedIds) ? data.failedFeedIds : [];
	
	              removeFeedRowsById(deletedIds);
	              deletedTotal += deletedIds.length;
	              failed.push(...failedIds);
	
	              if (toast && toast.update) {
	                const done = Math.min(i + batch.length, selectedIds.length);
	                toast.update('Deleting... (' + done + ' of ' + selectedIds.length + ')', { type: 'info' });
	              }
	
	              // Keep selection state consistent as rows disappear.
	              updateFeedMatchCount();
	              updateFeedSelectionState();
	            }
	
	            if (toast && toast.dismiss) toast.dismiss();
	            if (failed.length > 0) {
	              if (window.showToast) {
	                window.showToast(
	                  'Deleted ' + deletedTotal + ' feed(s). ' + failed.length + ' failed (still visible). Try again; Cloudflare limits can cause temporary failures.',
	                  { type: 'error', duration: 6500 },
	                );
	              }
	            } else {
	              if (window.showToast) window.showToast('Deleted ' + deletedTotal + ' feed(s).', { type: 'success' });
	            }
	          } catch (error) {
	            if (toast && toast.dismiss) toast.dismiss();
	            if (window.showToast) {
	              window.showToast((error && error.message) ? error.message : 'Bulk feed delete failed.', { type: 'error', duration: 7500 });
	            }
	          } finally {
	            FEED_BULK_DELETE_IN_PROGRESS = false;
	            setButtonLoading(FEED_BULK_DELETE_BUTTON_EL, false);
	            updateFeedSelectionState();
	          }
	        }

	        document.addEventListener('DOMContentLoaded', () => {
	          initFeedUI();
	        });
      `)};
        </script>
      `,
    ),
  );
});

// Create a new feed
app.post("/feeds/create", async (c) => {
  // Type assertion for environment variables
  const env = c.env as unknown as Env;
  const emailStorage = env.EMAIL_STORAGE;

  try {
    const formData = await c.req.formData();
    const title = formData.get("title")?.toString() || "";
    const description = formData.get("description")?.toString();
    const language = formData.get("language")?.toString() || "en";
    const view = formData.get("view")?.toString() === "table" ? "table" : "list";
    const allowedSenders = parseAllowedSenders(
      formData.get("allowed_senders")?.toString() || "",
    );

    // Validate inputs
    const parsedData = createFeedSchema.parse({
      title,
      description,
      language,
      allowedSenders,
    });

    // Generate a feed ID
    const feedId = generateFeedId();

    // Create feed configuration
    const feedConfig: FeedConfig = {
      title: parsedData.title,
      description: parsedData.description,
      language: parsedData.language,
      site_url: `https://${env.DOMAIN}/rss/${feedId}`,
      feed_url: `https://${env.DOMAIN}/rss/${feedId}`,
      allowed_senders: parsedData.allowedSenders,
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    // Create feed metadata
    const feedMetadata: FeedMetadata = {
      emails: [],
    };

    // Store feed configuration and metadata
    await emailStorage.put(`feed:${feedId}:config`, JSON.stringify(feedConfig));
    await emailStorage.put(
      `feed:${feedId}:metadata`,
      JSON.stringify(feedMetadata),
    );

    // Add feed to the list of all feeds
    await addFeedToList(
      emailStorage,
      feedId,
      parsedData.title,
      parsedData.description,
    );

    // Redirect back to admin page
    return c.redirect(`/admin?view=${view}`);
  } catch (error) {
    console.error("Error creating feed:", error);
    return c.text("Error creating feed. Please try again.", 400);
  }
});

// Edit feed page
app.get("/feeds/:feedId/edit", async (c) => {
  // Type assertion for environment variables
  const env = c.env as unknown as Env;
  const emailStorage = env.EMAIL_STORAGE;
  const feedId = c.req.param("feedId");

  // Get feed configuration
  const feedConfigKey = `feed:${feedId}:config`;
  const feedConfig = (await emailStorage.get(feedConfigKey, {
    type: "json",
  })) as FeedConfig | null;

  if (!feedConfig) {
    return c.text("Feed not found", 404);
  }

  return c.html(
    layout(
      "Edit Feed",
      html`
        <div class="container fade-in">
          <div class="header-with-actions">
            <div class="header-title">
              <h1>${feedConfig.title} - Edit Feed</h1>
            </div>
            <div class="header-actions">
              <a href="/admin" class="button button-secondary button-back"
                >Back to Dashboard</a
              >
            </div>
          </div>

          <div class="card">
            <form action="/admin/feeds/${feedId}/edit" method="post">
              <div class="form-group">
                <label for="title">Feed Title</label>
                <input
                  type="text"
                  id="title"
                  name="title"
                  value="${feedConfig.title}"
                  required
                />
              </div>

              <div class="form-group">
                <label for="description">Description</label>
                <textarea id="description" name="description" rows="3">
${feedConfig.description || ""}</textarea
                >
              </div>

              <div class="form-group">
                <label for="allowed_senders"
                  >Allowed senders (optional, one email or domain per
                  line)</label
                >
                <textarea
                  id="allowed_senders"
                  name="allowed_senders"
                  rows="3"
                  placeholder="newsletter@example.com&#10;techmeme.com"
                >
${(feedConfig.allowed_senders || []).join("\n")}</textarea
                >
                <small
                  >When set, inbound emails are only accepted from these
                  senders/domains.</small
                >
              </div>

              <input type="hidden" id="language" name="language" value="en" />

              <button type="submit" class="button">Update Feed</button>
            </form>
          </div>
        </div>
      `,
    ),
  );
});

// Update feed
app.post("/feeds/:feedId/edit", async (c) => {
  // Type assertion for environment variables
  const env = c.env as unknown as Env;
  const emailStorage = env.EMAIL_STORAGE;
  const feedId = c.req.param("feedId");

  try {
    const formData = await c.req.formData();
    const title = formData.get("title")?.toString() || "";
    const description = formData.get("description")?.toString();
    const language = formData.get("language")?.toString() || "en";
    const allowedSenders = parseAllowedSenders(
      formData.get("allowed_senders")?.toString() || "",
    );

    // Validate inputs
    const parsedData = updateFeedSchema.parse({
      title,
      description,
      language,
      allowedSenders,
    });

    // Get existing feed config
    const feedConfigKey = `feed:${feedId}:config`;
    const existingConfig = (await emailStorage.get(feedConfigKey, {
      type: "json",
    })) as FeedConfig | null;

    if (!existingConfig) {
      return c.text("Feed not found", 404);
    }

    // Update feed configuration
    await emailStorage.put(
      feedConfigKey,
      JSON.stringify({
        ...existingConfig,
        title: parsedData.title,
        description: parsedData.description,
        language: parsedData.language,
        allowed_senders: parsedData.allowedSenders,
        updated_at: Date.now(),
      }),
    );

    // Update feed in the list of all feeds
    await updateFeedInList(
      emailStorage,
      feedId,
      parsedData.title,
      parsedData.description,
    );

    // Redirect back to admin page
    return c.redirect("/admin");
  } catch (error) {
    console.error("Error updating feed:", error);
    return c.text("Error updating feed. Please try again.", 400);
  }
});

async function deleteKeysWithConcurrency(
  emailStorage: KVNamespace,
  keys: string[],
  concurrency: number,
): Promise<{ ok: string[]; failed: string[] }> {
  const uniqueKeys = Array.from(new Set(keys.filter(Boolean)));
  const ok: string[] = [];
  const failed: string[] = [];
  const limit = Math.max(1, Math.floor(concurrency) || 1);

  for (let i = 0; i < uniqueKeys.length; i += limit) {
    const batch = uniqueKeys.slice(i, i + limit);
    const results = await Promise.allSettled(
      batch.map((key) => emailStorage.delete(key)),
    );
    results.forEach((result, idx) => {
      const key = batch[idx];
      if (result.status === "fulfilled") {
        ok.push(key);
      } else {
        failed.push(key);
      }
    });
  }

  return { ok, failed };
}

async function deleteFeedFast(
  emailStorage: KVNamespace,
  feedId: string,
): Promise<boolean> {
  const feedConfigKey = `feed:${feedId}:config`;
  const feedMetadataKey = `feed:${feedId}:metadata`;

  const results = await Promise.allSettled([
    emailStorage.delete(feedConfigKey),
    emailStorage.delete(feedMetadataKey),
  ]);

  return results.every((r) => r.status === "fulfilled");
}

async function purgeFeedKeysStep(
  emailStorage: KVNamespace,
  feedId: string,
  options: { cursor?: string; limit?: number } = {},
): Promise<{
  deletedKeys: string[];
  failedKeys: string[];
  cursor: string;
  listComplete: boolean;
}> {
  const prefix = `feed:${feedId}:`;
  const limit = Math.min(
    1000,
    Math.max(1, Math.floor(options.limit || 250)),
  );
  const cursor = options.cursor || undefined;

  const listed = await emailStorage.list({ prefix, cursor, limit });
  const keys = (listed.keys || []).map((k) => k.name);
  const { ok, failed } = await deleteKeysWithConcurrency(emailStorage, keys, 35);

  return {
    deletedKeys: ok,
    failedKeys: failed,
    cursor: listed.cursor || "",
    listComplete: !!listed.list_complete,
  };
}

// Delete feed
app.post("/feeds/:feedId/delete", async (c) => {
  const env = c.env as unknown as Env;
  const emailStorage = env.EMAIL_STORAGE;
  const feedId = c.req.param("feedId");
  const view = c.req.query("view") === "table" ? "table" : "list";
  const wantsJson = (c.req.header("Accept") || "").includes("application/json");

  try {
    await deleteFeedFast(emailStorage, feedId);
    await removeFeedFromList(emailStorage, feedId);

    // Best-effort cleanup in the background so the request stays fast.
    // Use the UI purge endpoint for full, user-visible progress.
    waitUntilSafe(c, purgeFeedKeysStep(emailStorage, feedId));
    if (wantsJson) {
      return c.json({ ok: true, feedId });
    }
    return c.redirect(`/admin?view=${view}`);
  } catch (error) {
    console.error("Error deleting feed:", error);
    if (wantsJson) {
      return c.json({ ok: false, error: "Error deleting feed. Please try again." }, 400);
    }
    return c.text("Error deleting feed. Please try again.", 400);
  }
});

// Purge all keys for a feed in small steps (used by the admin UI after deleting feeds).
app.post("/feeds/:feedId/purge", async (c) => {
  const env = c.env as unknown as Env;
  const emailStorage = env.EMAIL_STORAGE;
  const feedId = c.req.param("feedId");

  try {
    const body = (await c.req.json().catch(() => null)) as {
      cursor?: unknown;
      limit?: unknown;
    } | null;

    const cursor = body?.cursor ? String(body.cursor) : undefined;
    const limit = Number.isFinite(Number(body?.limit))
      ? Number(body?.limit)
      : 250;

    const step = await purgeFeedKeysStep(emailStorage, feedId, {
      cursor,
      limit,
    });

    return c.json({
      ok: step.failedKeys.length === 0,
      deletedCount: step.deletedKeys.length,
      failedCount: step.failedKeys.length,
      cursor: step.cursor,
      listComplete: step.listComplete,
    });
  } catch (error) {
    console.error("Error purging feed keys:", error);
    return c.json({ ok: false, error: "Error purging feed keys" }, 500);
  }
});

// Bulk delete feeds selected in the dashboard
app.post("/feeds/bulk-delete", async (c) => {
  const env = c.env as unknown as Env;
  const emailStorage = env.EMAIL_STORAGE;
  const contentType = c.req.header("Content-Type") || "";
  const wantsJson =
    contentType.includes("application/json") ||
    (c.req.header("Accept") || "").includes("application/json");

  try {
    if (wantsJson) {
      const body = (await c.req.json().catch(() => null)) as {
        feedIds?: unknown;
      } | null;

      const rawIds = Array.isArray(body?.feedIds) ? body?.feedIds : [];
      const parsedFeedIds = Array.from(
        new Set(rawIds.map((value) => String(value)).filter(Boolean)),
      );

      if (parsedFeedIds.length === 0) {
        return c.json({ ok: false, error: "No feeds were selected." }, 400);
      }

      // The UI batches requests; cap to avoid accidental huge deletes in one request.
      if (parsedFeedIds.length > 50) {
        return c.json(
          {
            ok: false,
            error:
              "Too many feedIds for a single request. Please delete in smaller batches.",
          },
          413,
        );
      }

      const results: Array<{ feedId: string; ok: boolean }> = [];
      const concurrency = 10;

      for (let i = 0; i < parsedFeedIds.length; i += concurrency) {
        const batch = parsedFeedIds.slice(i, i + concurrency);
        const batchResults = await Promise.all(
          batch.map(async (feedId) => {
            try {
              const ok = await deleteFeedFast(emailStorage, feedId);
              return { feedId, ok };
            } catch (error) {
              console.error("Error bulk deleting feed:", feedId, error);
              return { feedId, ok: false };
            }
          }),
        );
        results.push(...batchResults);
      }

      const okIds = results.filter((r) => r.ok).map((r) => r.feedId);
      const failedFeedIds = results.filter((r) => !r.ok).map((r) => r.feedId);

      const deletedFeedIds = await removeFeedsFromListBulk(emailStorage, okIds);

      // Best-effort: kick off small purge steps in the background so storage starts clearing.
      // The UI also runs purge steps for full cleanup + progress.
      deletedFeedIds.forEach((feedId) => {
        waitUntilSafe(c, purgeFeedKeysStep(emailStorage, feedId));
      });

      return c.json({
        ok: failedFeedIds.length === 0,
        deletedFeedIds,
        failedFeedIds,
      });
    }

    const formData = await c.req.formData();
    const view = formData.get("view")?.toString() === "table" ? "table" : "list";
    const redirectBase = `/admin?view=${view}`;
    const rawIds = formData.getAll("feedIds").map((value) => value.toString());
    const parsedFeedIds = Array.from(new Set(rawIds.filter(Boolean)));

    if (parsedFeedIds.length === 0) {
      return c.redirect(`${redirectBase}&message=bulkDeleteNoop`);
    }

    const results: Array<{ feedId: string; ok: boolean }> = [];
    const concurrency = 10;

    for (let i = 0; i < parsedFeedIds.length; i += concurrency) {
      const batch = parsedFeedIds.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(async (feedId) => {
          try {
            const ok = await deleteFeedFast(emailStorage, feedId);
            return { feedId, ok };
          } catch (error) {
            console.error("Error bulk deleting feed:", feedId, error);
            return { feedId, ok: false };
          }
        }),
      );
      results.push(...batchResults);
    }

    const okIds = results.filter((r) => r.ok).map((r) => r.feedId);
    const deletedFeedIds = await removeFeedsFromListBulk(emailStorage, okIds);

    deletedFeedIds.forEach((feedId) => {
      waitUntilSafe(c, purgeFeedKeysStep(emailStorage, feedId));
    });

    return c.redirect(
      `${redirectBase}&message=bulkDeleted&count=${deletedFeedIds.length}`,
    );
  } catch (error) {
    console.error("Error bulk deleting feeds:", error);
    return wantsJson
      ? c.json(
          {
            ok: false,
            error:
              "Server error while deleting feeds. This can happen if Cloudflare is rate-limiting requests or if the Worker hit a plan quota. Please try again.",
          },
          500,
        )
      : c.text("Error bulk deleting feeds. Please try again.", 500);
  }
});

// View all emails for a feed
app.get("/feeds/:feedId/emails", async (c) => {
  // Type assertion for environment variables
  const env = c.env as unknown as Env;
  const emailStorage = env.EMAIL_STORAGE;
  const feedId = c.req.param("feedId");
  const message = c.req.query("message");
  const count = Number(c.req.query("count") || "0");

  // Get feed configuration and metadata
  const feedConfigKey = `feed:${feedId}:config`;
  const feedMetadataKey = `feed:${feedId}:metadata`;

  const feedConfig = (await emailStorage.get(feedConfigKey, {
    type: "json",
  })) as FeedConfig | null;
  const feedMetadata = (await emailStorage.get(feedMetadataKey, {
    type: "json",
  })) as FeedMetadata | null;

  if (!feedConfig || !feedMetadata) {
    return c.text("Feed not found", 404);
  }

  return c.html(
    layout(
      `${feedConfig.title} - Emails`,
      html`
        <div class="container container-wide fade-in">
          <div class="header-with-actions">
            <div class="header-title">
              <h1>${feedConfig.title} - Emails</h1>
            </div>
            <div class="header-actions">
              <a href="/admin" class="button button-secondary button-back"
                >Back to Dashboard</a
              >
            </div>
          </div>

          <div class="card">
            <h2>Feed Details</h2>
            <div>
              <div class="copyable">
                <span class="copyable-label">Email Address:</span>
                <div class="copyable-content">
                  <span
                    class="copyable-value"
                    data-copy="${feedId}@${env.DOMAIN}"
                    >${feedId}@${env.DOMAIN}</span
                  >
                  <div class="copy-icon-container">
                    <svg
                      class="copy-icon copy-icon-original"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <rect
                        x="9"
                        y="9"
                        width="13"
                        height="13"
                        rx="2"
                        ry="2"
                      ></rect>
                      <path
                        d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                      ></path>
                    </svg>
                    <svg
                      class="copy-icon copy-icon-success"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M20 6L9 17l-5-5"></path>
                    </svg>
                  </div>
                </div>
              </div>
              <div class="copyable">
                <span class="copyable-label">RSS Feed:</span>
                <div class="copyable-content">
                  <span
                    class="copyable-value"
                    data-copy="https://${env.DOMAIN}/rss/${feedId}"
                    >https://${env.DOMAIN}/rss/${feedId}</span
                  >
                  <div class="copy-icon-container">
                    <svg
                      class="copy-icon copy-icon-original"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <rect
                        x="9"
                        y="9"
                        width="13"
                        height="13"
                        rx="2"
                        ry="2"
                      ></rect>
                      <path
                        d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                      ></path>
                    </svg>
                    <svg
                      class="copy-icon copy-icon-success"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M20 6L9 17l-5-5"></path>
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>

	          <h2>
	            Emails (<span id="email-total-count">${feedMetadata.emails.length}</span>)
	          </h2>

          ${message === "bulkDeleted"
            ? html`<div class="card">
                <p>Deleted ${Number.isFinite(count) ? count : 0} email(s).</p>
              </div>`
            : ""}
          ${message === "bulkDeleteNoop"
            ? html`<div class="card"><p>No emails were selected.</p></div>`
            : ""}
          ${feedMetadata.emails.length > 0
            ? html`
	                <form
	                  action="/admin/feeds/${feedId}/emails/bulk-delete"
	                  method="post"
	                  onsubmit="return onBulkEmailDeleteSubmit(event)"
	                >
                  <div class="toolbar">
                    <div class="toolbar-group toolbar-group-fill">
                      <input
                        type="search"
                        id="email-search"
                        class="search"
                        placeholder="Search email subjects"
                        oninput="scheduleEmailFilter()"
                      />
                      <span class="pill" id="email-match-count"
                        >Showing ${feedMetadata.emails.length}</span
                      >
                      <span class="pill" id="selected-email-count"
                        >0 selected</span
                      >
                      <button
                        type="button"
                        class="button button-small button-secondary"
                        onclick="selectMatchingEmails()"
                      >
                        Select Results
                      </button>
                      <button
                        type="button"
                        class="button button-small button-secondary"
                        onclick="clearEmailSelection()"
                      >
                        Clear Selection
                      </button>
                      <button
                        id="bulk-delete-emails-button"
                        type="submit"
                        class="button button-small button-danger"
                        disabled
                      >
                        Delete Selected
                      </button>
                    </div>
                  </div>

                  <div class="table-wrap">
                    <table class="table table-emails">
                      <colgroup>
                        <col data-col="select" style="width: 44px;" />
                        <col data-col="subject" style="width: 520px;" />
                        <col data-col="receivedAt" style="width: 220px;" />
                        <col data-col="actions" style="width: 200px;" />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>
                            <input
                              type="checkbox"
                              id="select-all-emails"
                              onchange="toggleAllEmails(this.checked)"
                            />
                          </th>
                          <th class="th-resizable" data-sort-key="subject" aria-sort="none">
                            <button type="button" class="th-button" data-sort-key="subject">
                              Subject <span class="sort-indicator" aria-hidden="true"></span>
                            </button>
                            <div class="col-resizer" data-col="subject" title="Resize"></div>
                          </th>
                          <th class="th-resizable" data-sort-key="receivedAt" aria-sort="none">
                            <button type="button" class="th-button" data-sort-key="receivedAt">
                              Received <span class="sort-indicator" aria-hidden="true"></span>
                            </button>
                            <div class="col-resizer" data-col="receivedAt" title="Resize"></div>
                          </th>
                          <th class="th-resizable">
                            <span>Actions</span>
                            <div class="col-resizer" data-col="actions" title="Resize"></div>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        ${feedMetadata.emails.map((email: EmailMetadata) => {
                          const subjectDisplay = clampText(email.subject, 180);
                          const subjectHover = clampText(email.subject, 1000);
                          const sortSubject = subjectHover.toLowerCase();
                          const sortReceivedAt = String(email.receivedAt);
                          const searchHaystack = clampText(email.subject, 320).toLowerCase();

                          return html`
                            <tr
                              class="email-row"
                              data-email-key="${email.key}"
                              data-search="${searchHaystack}"
                              data-sort-subject="${sortSubject}"
                              data-sort-received-at="${sortReceivedAt}"
                            >
                              <td>
                                <input
                                  type="checkbox"
                                  class="email-select"
                                  name="emailKeys"
                                  value="${email.key}"
                                  onchange="updateEmailSelectionState()"
                                />
                              </td>
                              <td>
                                <span class="truncate" title="${subjectHover}"
                                  >${subjectDisplay}</span
                                >
                              </td>
                              <td>
                                ${new Date(email.receivedAt).toLocaleString()}
                              </td>
                              <td>
                                <div class="row-actions">
                                  <a
                                    href="/admin/emails/${email.key}"
                                    class="button button-small"
                                    >View</a
                                  >
                                  <button
                                    type="button"
                                    class="button button-small button-danger button-delete"
                                    data-delete-kind="email"
                                    data-email-key="${email.key}"
                                    data-feed-id="${feedId}"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          `;
                        })}
                      </tbody>
                    </table>
                  </div>
                </form>
              `
            : html`<div class="card">
                <p>
                  No emails received yet. Subscribe to newsletters using the
                  email address above.
                </p>
              </div>`}
        </div>

        <script>
          ${raw(`
	        const EMAIL_FEED_ID = ${JSON.stringify(feedId)};
	        let EMAIL_ROWS = [];
	        let EMAIL_CHECKBOXES = [];
	        let EMAIL_SELECTED_COUNT_EL = null;
	        let EMAIL_MATCH_COUNT_EL = null;
	        let EMAIL_TOTAL_COUNT_EL = null;
	        let EMAIL_BULK_DELETE_BUTTON_EL = null;
	        let EMAIL_SELECT_ALL_EL = null;
	        let EMAIL_FILTER_TIMER = null;
	        let EMAIL_BULK_DELETE_IN_PROGRESS = false;
	        let EMAIL_SORT_KEY = 'receivedAt';
	        let EMAIL_SORT_DIR = 'desc';
        const EMAIL_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

	        function initEmailUI() {
	          EMAIL_ROWS = Array.from(document.querySelectorAll('.email-row'));
	          EMAIL_CHECKBOXES = Array.from(document.querySelectorAll('.email-select'));
	          EMAIL_SELECTED_COUNT_EL = document.getElementById('selected-email-count');
	          EMAIL_MATCH_COUNT_EL = document.getElementById('email-match-count');
	          EMAIL_TOTAL_COUNT_EL = document.getElementById('email-total-count');
	          EMAIL_BULK_DELETE_BUTTON_EL = document.getElementById('bulk-delete-emails-button');
	          EMAIL_SELECT_ALL_EL = document.getElementById('select-all-emails');
	          setupEmailTableResizing();
	          setupEmailTableSorting();
	          setupEmailDeleteButtons();
	          updateEmailMatchCount();
	          updateEmailSelectionState();
	        }

	        function updateEmailMatchCount() {
	          if (!EMAIL_MATCH_COUNT_EL) return;
	          const total = EMAIL_ROWS.length;
	          const visible = EMAIL_ROWS.filter((row) => !row.hidden).length;
	          const query = (document.getElementById('email-search')?.value || '').trim();
	          EMAIL_MATCH_COUNT_EL.textContent = query ? ('Showing ' + visible + ' of ' + total) : ('Showing ' + total);
	        }

	        function scheduleEmailFilter() {
	          if (EMAIL_FILTER_TIMER) {
	            clearTimeout(EMAIL_FILTER_TIMER);
	          }
	          EMAIL_FILTER_TIMER = setTimeout(filterEmailRows, 120);
        }

        function getEmailSortValue(row, key) {
          const prop = 'sort' + key.charAt(0).toUpperCase() + key.slice(1);
          return (row.dataset && row.dataset[prop]) ? row.dataset[prop] : '';
        }

        function updateEmailSortIndicators(table) {
          const headerCells = Array.from(table.querySelectorAll('th[data-sort-key]'));
          headerCells.forEach((th) => {
            const key = th.getAttribute('data-sort-key') || '';
            const indicator = th.querySelector('.sort-indicator');
            const active = key === EMAIL_SORT_KEY;

            if (indicator) {
              indicator.textContent = active ? (EMAIL_SORT_DIR === 'asc' ? '^' : 'v') : '';
            }
            th.setAttribute('aria-sort', active ? (EMAIL_SORT_DIR === 'asc' ? 'ascending' : 'descending') : 'none');
          });
        }

        function sortEmailTableBy(key) {
          const table = document.querySelector('table.table-emails');
          const tbody = table ? table.querySelector('tbody') : null;
          if (!table || !tbody) return;

          if (EMAIL_SORT_KEY === key) {
            EMAIL_SORT_DIR = EMAIL_SORT_DIR === 'asc' ? 'desc' : 'asc';
          } else {
            EMAIL_SORT_KEY = key;
            // Default Received sorting to newest-first
            EMAIL_SORT_DIR = key === 'receivedAt' ? 'desc' : 'asc';
          }

          const dirMultiplier = EMAIL_SORT_DIR === 'asc' ? 1 : -1;
          const rows = Array.from(tbody.querySelectorAll('.email-row'));
          rows.sort((a, b) => {
            const av = getEmailSortValue(a, EMAIL_SORT_KEY);
            const bv = getEmailSortValue(b, EMAIL_SORT_KEY);
            return dirMultiplier * EMAIL_COLLATOR.compare(av, bv);
          });

          const fragment = document.createDocumentFragment();
          rows.forEach((row) => fragment.appendChild(row));
          tbody.appendChild(fragment);

          updateEmailSortIndicators(table);
        }

        function setupEmailTableSorting() {
          const table = document.querySelector('table.table-emails');
          if (!table) return;

          table.querySelectorAll('button.th-button[data-sort-key]').forEach((button) => {
            button.addEventListener('click', () => {
              const key = button.getAttribute('data-sort-key') || '';
              if (!key) return;
              sortEmailTableBy(key);
            });
          });

          updateEmailSortIndicators(table);
        }

        function setupEmailTableResizing() {
          const table = document.querySelector('table.table-emails');
          if (!table) return;

          const storageKey = 'email-to-rss.admin.emailsTable.colWidths';
          const minWidths = {
            subject: 240,
            receivedAt: 180,
            actions: 160,
          };
          const defaultWidths = {
            subject: 520,
            receivedAt: 220,
            actions: 200,
          };

          const cols = Array.from(table.querySelectorAll('colgroup col'));
          const colByKey = {};
          cols.forEach((col) => {
            const key = col.getAttribute('data-col');
            if (key) colByKey[key] = col;
          });

          try {
            const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
            Object.keys(saved || {}).forEach((key) => {
              const px = Number(saved[key]);
              if (!colByKey[key] || !Number.isFinite(px)) return;
              colByKey[key].style.width = px + 'px';
            });
          } catch {
            // Ignore bad localStorage values
          }

          const persist = () => {
            try {
              const out = {};
              Object.keys(colByKey).forEach((key) => {
                if (key === 'select') return;
                const px = parseInt(colByKey[key].style.width || '0', 10);
                if (Number.isFinite(px) && px > 0) out[key] = px;
              });
              localStorage.setItem(storageKey, JSON.stringify(out));
            } catch {
              // ignore
            }
          };

          let active = null;
          let rafId = 0;
          let pendingWidth = 0;

          table.querySelectorAll('.col-resizer').forEach((handle) => {
            handle.addEventListener('pointerdown', (event) => {
              event.preventDefault();
              event.stopPropagation();

              const key = handle.getAttribute('data-col');
              const col = key ? colByKey[key] : null;
              if (!key || !col) return;

              const th = handle.closest('th');
              const startWidth = th ? th.getBoundingClientRect().width : parseInt(col.style.width || '0', 10) || 200;

              active = { key, col, startX: event.clientX, startWidth };
              document.body.classList.add('is-resizing');
              handle.setPointerCapture(event.pointerId);
            });

            handle.addEventListener('pointermove', (event) => {
              if (!active) return;
              const minPx = minWidths[active.key] || 180;
              const nextWidth = Math.max(minPx, Math.round(active.startWidth + (event.clientX - active.startX)));
              pendingWidth = nextWidth;
              if (rafId) return;
              rafId = requestAnimationFrame(() => {
                active.col.style.width = pendingWidth + 'px';
                rafId = 0;
              });
            });

            const finish = () => {
              if (!active) return;
              active = null;
              document.body.classList.remove('is-resizing');
              persist();
            };
            handle.addEventListener('pointerup', finish);
            handle.addEventListener('pointercancel', finish);

            handle.addEventListener('dblclick', (event) => {
              event.preventDefault();
              event.stopPropagation();
              const key = handle.getAttribute('data-col');
              const col = key ? colByKey[key] : null;
              const px = key ? defaultWidths[key] : null;
              if (!key || !col || !px) return;
              col.style.width = px + 'px';
              persist();
            });
          });
        }

        const EMAIL_DELETE_CONFIRM_LABEL = 'Confirm delete';
        const EMAIL_DELETE_LOADING_LABEL = 'Deleting...';
        const EMAIL_DELETE_CONFIRM_TIMEOUT_MS = 4000;

        function resetEmailDeleteButton(buttonEl) {
          if (!buttonEl) return;
          buttonEl.classList.remove('is-confirming');
          buttonEl.removeAttribute('data-confirming');
          buttonEl.disabled = false;
          const original = buttonEl.dataset.originalLabel || (buttonEl.textContent || '').trim() || 'Delete';
          buttonEl.innerHTML = original;
        }

        function animateEmailRowRemoval(row, onDone) {
          if (!row) {
            if (onDone) onDone();
            return;
          }

          row.classList.add('is-removing');

          window.setTimeout(() => {
            row.remove();
            if (onDone) onDone();
          }, 240);
        }

        async function deleteEmailRequest(emailKey, feedId) {
          const res = await fetch('/admin/emails/' + encodeURIComponent(emailKey) + '/delete?feedId=' + encodeURIComponent(feedId), {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
            },
            credentials: 'same-origin',
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            const message = data && data.error ? String(data.error) : ('Request failed (' + res.status + ')');
            throw new Error(message);
          }
          return data;
        }

        function refreshEmailRowCache() {
          EMAIL_ROWS = Array.from(document.querySelectorAll('.email-row'));
          EMAIL_CHECKBOXES = Array.from(document.querySelectorAll('.email-select'));
          if (EMAIL_TOTAL_COUNT_EL) {
            EMAIL_TOTAL_COUNT_EL.textContent = String(EMAIL_ROWS.length);
          }
          updateEmailMatchCount();
          updateEmailSelectionState();
        }

        function setupEmailDeleteButtons() {
          const buttons = Array.from(document.querySelectorAll('button[data-delete-kind="email"]'));
          buttons.forEach((button) => {
            if (button.dataset.deleteReady === 'true') return;
            button.dataset.deleteReady = 'true';
            const original = (button.textContent || '').trim() || 'Delete';
            button.dataset.originalLabel = original;

            let confirming = false;
            let confirmTimer = 0;
            let inFlight = false;

            const startConfirm = () => {
              confirming = true;
              button.classList.add('is-confirming');
              button.setAttribute('data-confirming', 'true');
              button.innerHTML = EMAIL_DELETE_CONFIRM_LABEL;
              if (confirmTimer) window.clearTimeout(confirmTimer);
              confirmTimer = window.setTimeout(() => {
                confirming = false;
                resetEmailDeleteButton(button);
              }, EMAIL_DELETE_CONFIRM_TIMEOUT_MS);
            };

            button.addEventListener('click', async (event) => {
              event.preventDefault();
              if (inFlight) return;

              if (!confirming) {
                startConfirm();
                return;
              }

              if (confirmTimer) window.clearTimeout(confirmTimer);
              inFlight = true;
              setButtonLoading(button, true, EMAIL_DELETE_LOADING_LABEL);

              const toast = window.showToast
                ? window.showToast('Deleting email...', { type: 'info', loading: true, duration: 0 })
                : null;

              const emailKey = button.getAttribute('data-email-key') || '';
              const feedId = button.getAttribute('data-feed-id') || EMAIL_FEED_ID;
              const row = button.closest('.email-row');

              try {
                await deleteEmailRequest(emailKey, feedId);

                if (toast && toast.update) {
                  toast.update('Email deleted.', { type: 'success', loading: false, duration: 3200 });
                } else if (window.showToast) {
                  window.showToast('Email deleted.', { type: 'success' });
                }

                animateEmailRowRemoval(row, () => {
                  refreshEmailRowCache();
                });
              } catch (error) {
                if (toast && toast.update) {
                  toast.update('Delete failed: ' + (error && error.message ? error.message : 'Unknown error'), { type: 'error', loading: false, duration: 6500 });
                } else if (window.showToast) {
                  window.showToast('Delete failed: ' + (error && error.message ? error.message : 'Unknown error'), { type: 'error', duration: 6500 });
                }
                setButtonLoading(button, false);
                confirming = false;
                resetEmailDeleteButton(button);
              } finally {
                inFlight = false;
                if (!row) {
                  setButtonLoading(button, false);
                  confirming = false;
                  resetEmailDeleteButton(button);
                }
              }
            });

            button.addEventListener('keydown', (event) => {
              if (event.key === 'Escape' && confirming && !inFlight) {
                confirming = false;
                if (confirmTimer) window.clearTimeout(confirmTimer);
                resetEmailDeleteButton(button);
              }
            });
          });
        }

        function updateEmailSelectionState() {
          if (!EMAIL_CHECKBOXES.length) {
            return;
          }

          const selected = EMAIL_CHECKBOXES.filter((checkbox) => checkbox.checked);

          if (EMAIL_SELECTED_COUNT_EL) {
            EMAIL_SELECTED_COUNT_EL.textContent = selected.length + ' selected';
          }
          if (EMAIL_BULK_DELETE_BUTTON_EL) {
            EMAIL_BULK_DELETE_BUTTON_EL.disabled = selected.length === 0;
          }
          if (EMAIL_SELECT_ALL_EL) {
            const visibleCheckboxes = EMAIL_CHECKBOXES.filter((checkbox) => !(checkbox.closest('tr')?.hidden));
            EMAIL_SELECT_ALL_EL.checked = visibleCheckboxes.length > 0 && visibleCheckboxes.every((checkbox) => checkbox.checked);
          }
        }

        function toggleAllEmails(checked) {
          EMAIL_CHECKBOXES.forEach((checkbox) => {
            if (!checkbox.closest('tr')?.hidden) {
              checkbox.checked = checked;
            }
          })
          updateEmailSelectionState();
        }

	        function setVisibleEmailSelection(checked) {
	          EMAIL_CHECKBOXES.forEach((checkbox) => {
	            if (!checkbox.closest('tr')?.hidden) {
	              checkbox.checked = checked;
	            }
	          })
	          updateEmailSelectionState();
	        }

	        function selectMatchingEmails() {
	          setVisibleEmailSelection(true);
	        }

	        function clearEmailSelection() {
	          EMAIL_CHECKBOXES.forEach((checkbox) => {
	            checkbox.checked = false;
	          })
	          updateEmailSelectionState();
	        }

	        function filterEmailRows() {
	          const query = (document.getElementById('email-search')?.value || '').toLowerCase().trim();
	          EMAIL_ROWS.forEach((row) => {
	            const haystack = row.getAttribute('data-search') || '';
	            row.hidden = !!query && !haystack.includes(query);
	          });
	          updateEmailMatchCount();
	          updateEmailSelectionState();
	        }

	        function confirmBulkEmailDelete() {
	          const selected = EMAIL_CHECKBOXES.filter((checkbox) => checkbox.checked).length;
	          if (selected === 0) return false;
	          const query = (document.getElementById('email-search')?.value || '').trim();
	          const extra =
	            selected >= 200 && !query
	              ? '\\n\\nThis is a large delete. Tip: use Search to narrow down spam first.'
	              : '';
	          return confirm('Delete ' + selected + ' selected email(s)?' + extra);
	        }

	        function setButtonLoading(buttonEl, loading, label) {
	          if (!buttonEl) return;
	          if (loading) {
	            if (!buttonEl.dataset.originalLabel) {
	              buttonEl.dataset.originalLabel = (buttonEl.textContent || '').trim();
	            }
	            const text = label || 'Working...';
	            buttonEl.classList.add('is-loading');
	            buttonEl.disabled = true;
	            buttonEl.innerHTML = '<span class=\"spinner\" aria-hidden=\"true\"></span>' + text;
	            return;
	          }

	          const original = buttonEl.dataset.originalLabel || (buttonEl.textContent || '').trim();
	          buttonEl.classList.remove('is-loading');
	          buttonEl.innerHTML = original;
	        }

	        function removeEmailRowsByKey(emailKeys) {
	          const toRemove = new Set((emailKeys || []).map((v) => String(v)));
	          if (toRemove.size === 0) return;

	          EMAIL_ROWS.forEach((row) => {
	            const checkbox = row.querySelector('input.email-select');
	            const key = checkbox ? checkbox.value : '';
	            if (toRemove.has(key)) {
	              row.remove();
	            }
	          });

	          EMAIL_ROWS = Array.from(document.querySelectorAll('.email-row'));
	          EMAIL_CHECKBOXES = Array.from(document.querySelectorAll('.email-select'));

	          if (EMAIL_TOTAL_COUNT_EL) {
	            EMAIL_TOTAL_COUNT_EL.textContent = String(EMAIL_ROWS.length);
	          }
	        }

	        function onBulkEmailDeleteSubmit(event) {
	          if (event && event.preventDefault) event.preventDefault();
	          void bulkDeleteSelectedEmails();
	          return false;
	        }

	        async function bulkDeleteSelectedEmails() {
	          if (EMAIL_BULK_DELETE_IN_PROGRESS) return;
	          const selectedKeys = EMAIL_CHECKBOXES.filter((checkbox) => checkbox.checked).map((checkbox) => checkbox.value);
	          if (selectedKeys.length === 0) {
	            if (window.showToast) window.showToast('No emails selected.', { type: 'info' });
	            return;
	          }
	          if (!confirmBulkEmailDelete()) {
	            return;
	          }

	          EMAIL_BULK_DELETE_IN_PROGRESS = true;
	          setButtonLoading(EMAIL_BULK_DELETE_BUTTON_EL, true, 'Deleting...');

	          const toast = window.showToast
	            ? window.showToast('Deleting ' + selectedKeys.length + ' email(s)...', { type: 'info', loading: true, duration: 0 })
	            : null;

	          const batchSize = 50;
	          let deletedTotal = 0;
	          const failed = [];

	          try {
	            const url = '/admin/feeds/' + encodeURIComponent(EMAIL_FEED_ID) + '/emails/bulk-delete';
	            for (let i = 0; i < selectedKeys.length; i += batchSize) {
	              const batch = selectedKeys.slice(i, i + batchSize);
	              const res = await fetch(url, {
	                method: 'POST',
	                headers: {
	                  'Content-Type': 'application/json',
	                  'Accept': 'application/json',
	                },
	                credentials: 'same-origin',
	                body: JSON.stringify({ emailKeys: batch }),
	              });

	              let data = {};
	              if (window.parseJsonResponseOrThrow) {
	                data = await window.parseJsonResponseOrThrow(res, { prefix: 'Bulk email delete failed' });
	              } else {
	                data = await res.json().catch(() => ({}));
	                if (!res.ok) {
	                  const message = data && data.error ? String(data.error) : ('Bulk email delete failed (HTTP ' + res.status + ')');
	                  throw new Error(message);
	                }
	              }

	              const deletedKeys = Array.isArray(data.deletedEmailKeys) ? data.deletedEmailKeys : batch;
	              const failedKeys = Array.isArray(data.failedEmailKeys) ? data.failedEmailKeys : [];

	              removeEmailRowsByKey(deletedKeys);
	              deletedTotal += deletedKeys.length;
	              failed.push(...failedKeys);

	              if (toast && toast.update) {
	                const done = Math.min(i + batch.length, selectedKeys.length);
	                toast.update('Deleting... (' + done + ' of ' + selectedKeys.length + ')', { type: 'info' });
	              }

	              updateEmailMatchCount();
	              updateEmailSelectionState();
	            }

	            if (toast && toast.dismiss) toast.dismiss();
	            if (failed.length > 0) {
	              if (window.showToast) {
	                window.showToast(
	                  'Deleted ' + deletedTotal + ' email(s). ' + failed.length + ' failed (still visible). Try again; Cloudflare limits can cause temporary failures.',
	                  { type: 'error', duration: 6500 },
	                );
	              }
	            } else {
	              if (window.showToast) window.showToast('Deleted ' + deletedTotal + ' email(s).', { type: 'success' });
	            }
	          } catch (error) {
	            if (toast && toast.dismiss) toast.dismiss();
	            if (window.showToast) {
	              window.showToast((error && error.message) ? error.message : 'Bulk email delete failed.', { type: 'error', duration: 7500 });
	            }
	          } finally {
	            EMAIL_BULK_DELETE_IN_PROGRESS = false;
	            setButtonLoading(EMAIL_BULK_DELETE_BUTTON_EL, false);
	            updateEmailSelectionState();
	          }
	        }

	        document.addEventListener('DOMContentLoaded', () => {
	          initEmailUI();
	        });
      `)};
        </script>
      `,
    ),
  );
});

// View email content
app.get("/emails/:emailKey", async (c) => {
  // Type assertion for environment variables
  const env = c.env as unknown as Env;
  const emailStorage = env.EMAIL_STORAGE;
  const emailKey = c.req.param("emailKey");

  // Get email data
  const emailData = (await emailStorage.get(emailKey, {
    type: "json",
  })) as EmailData | null;

  if (!emailData) {
    return c.text("Email not found", 404);
  }

  // Extract feed ID from the key format (feed:ID:emails:timestamp)
  const keyParts = emailKey.split(":");
  const feedId = keyParts[1];

  // Create a sanitized HTML content with CSS for the iframe
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.5;
            padding: 16px;
            margin: 0;
            color: #333;
            box-sizing: border-box;
          }
          img {
            max-width: 100%;
            height: auto;
          }
          a {
            color: #0070f3;
          }
          
          /* Dark mode support within iframe */
          @media (prefers-color-scheme: dark) {
            body {
              background-color: #1c1c1e;
              color: #ffffff;
            }
            a {
              color: #0a84ff;
            }
          }
        </style>
      </head>
      <body>
        ${emailData.content}
      </body>
    </html>
  `;

  // Properly encode the HTML content to handle Unicode characters
  const encodedHtmlContent = (() => {
    // Convert the string to UTF-8
    const encoder = new TextEncoder();
    const bytes = encoder.encode(htmlContent);
    // Convert bytes to base64
    return btoa(String.fromCharCode(...new Uint8Array(bytes)));
  })();

  return c.html(
    layout(
      `Email: ${emailData.subject}`,
      html`
        <div class="container fade-in">
          <div class="header-with-actions">
            <div class="header-title">
              <h1>Email Content</h1>
            </div>
            <div class="header-actions">
              <a
                href="/admin/feeds/${feedId}/emails"
                class="button button-secondary button-back"
                >Back to Emails</a
              >
            </div>
          </div>

          <div class="card">
            <div class="email-meta">
              <div class="email-metadata-grid">
                <div class="copyable">
                  <span class="copyable-label">Subject:</span>
                  <div class="copyable-content">
                    <span
                      class="copyable-value"
                      data-copy="${emailData.subject}"
                      >${emailData.subject}</span
                    >
                    <div class="copy-icon-container">
                      <svg
                        class="copy-icon copy-icon-original"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <rect
                          x="9"
                          y="9"
                          width="13"
                          height="13"
                          rx="2"
                          ry="2"
                        ></rect>
                        <path
                          d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                        ></path>
                      </svg>
                      <svg
                        class="copy-icon copy-icon-success"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M20 6L9 17l-5-5"></path>
                      </svg>
                    </div>
                  </div>
                </div>
                <div class="copyable">
                  <span class="copyable-label">Received:</span>
                  <div class="copyable-content">
                    <span
                      class="copyable-value"
                      data-copy="${new Date(
                        emailData.receivedAt,
                      ).toLocaleString()}"
                      >${new Date(emailData.receivedAt).toLocaleString()}</span
                    >
                    <div class="copy-icon-container">
                      <svg
                        class="copy-icon copy-icon-original"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <rect
                          x="9"
                          y="9"
                          width="13"
                          height="13"
                          rx="2"
                          ry="2"
                        ></rect>
                        <path
                          d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                        ></path>
                      </svg>
                      <svg
                        class="copy-icon copy-icon-success"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M20 6L9 17l-5-5"></path>
                      </svg>
                    </div>
                  </div>
                </div>
                <div class="copyable">
                  <span class="copyable-label">From:</span>
                  <div class="copyable-content">
                    <span class="copyable-value" data-copy="${emailData.from}"
                      >${emailData.from}</span
                    >
                    <div class="copy-icon-container">
                      <svg
                        class="copy-icon copy-icon-original"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <rect
                          x="9"
                          y="9"
                          width="13"
                          height="13"
                          rx="2"
                          ry="2"
                        ></rect>
                        <path
                          d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                        ></path>
                      </svg>
                      <svg
                        class="copy-icon copy-icon-success"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M20 6L9 17l-5-5"></path>
                      </svg>
                    </div>
                  </div>
                </div>
                <div class="copyable">
                  <span class="copyable-label">To:</span>
                  <div class="copyable-content">
                    <span
                      class="copyable-value"
                      data-copy="${feedId}@${env.DOMAIN}"
                      >${feedId}@${env.DOMAIN}</span
                    >
                    <div class="copy-icon-container">
                      <svg
                        class="copy-icon copy-icon-original"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <rect
                          x="9"
                          y="9"
                          width="13"
                          height="13"
                          rx="2"
                          ry="2"
                        ></rect>
                        <path
                          d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                        ></path>
                      </svg>
                      <svg
                        class="copy-icon copy-icon-success"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M20 6L9 17l-5-5"></path>
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="toggle-view">
              <button
                id="rendered-button"
                class="toggle-button active"
                onclick="showRendered()"
              >
                Rendered View
              </button>
              <button id="raw-button" class="toggle-button" onclick="showRaw()">
                Raw HTML
              </button>
            </div>

            <div class="email-content">
              <div id="rendered-view" class="email-iframe-container">
                <iframe
                  class="email-iframe"
                  src="data:text/html;base64,${encodedHtmlContent}"
                ></iframe>
              </div>
              <div id="raw-view" class="email-raw" style="display: none;">
                <pre>
${emailData.content.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre
                >
              </div>
            </div>
          </div>
        </div>

        <script>
          ${raw(`
        function showRendered() {
          document.getElementById('rendered-view').style.display = 'block';
          document.getElementById('raw-view').style.display = 'none';
          document.getElementById('rendered-button').classList.add('active');
          document.getElementById('raw-button').classList.remove('active');
        }
        
        function showRaw() {
          document.getElementById('rendered-view').style.display = 'none';
          document.getElementById('raw-view').style.display = 'block';
          document.getElementById('rendered-button').classList.remove('active');
          document.getElementById('raw-button').classList.add('active');
        }
        
        // Adjust iframe height based on content
        window.addEventListener('load', function() {
          const iframe = document.querySelector('.email-iframe');
          if (iframe) {
            // Start with a reasonable default height
            iframe.style.height = '500px';
            
            try {
              // Try to adjust height based on content if possible
              iframe.onload = function() {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                if (iframeDoc) {
                  const newHeight = Math.min(800, Math.max(500, iframeDoc.body.scrollHeight));
                  iframe.style.height = newHeight + 'px';
                }
              };
            } catch (e) {
              console.error('Error adjusting iframe height:', e);
            }
          }
        });
      `)};
        </script>
      `,
    ),
  );
});

// Delete email
app.post("/emails/:emailKey/delete", async (c) => {
  // Type assertion for environment variables
  const env = c.env as unknown as Env;
  const emailStorage = env.EMAIL_STORAGE;
  const emailKey = c.req.param("emailKey");
  const wantsJson = (c.req.header("Accept") || "").includes("application/json");

  try {
    // Get feedId from query parameters instead of form data
    const feedId = c.req.query("feedId");

    if (!feedId) {
      if (wantsJson) {
        return c.json({ ok: false, error: "Feed ID is required" }, 400);
      }
      return c.text("Feed ID is required", 400);
    }

    // Delete the email
    await emailStorage.delete(emailKey);

    // Remove the email from the feed metadata
    const feedMetadataKey = `feed:${feedId}:metadata`;
    const feedMetadata = (await emailStorage.get(feedMetadataKey, {
      type: "json",
    })) as FeedMetadata | null;

    if (feedMetadata) {
      // Filter out the deleted email
      feedMetadata.emails = feedMetadata.emails.filter(
        (email) => email.key !== emailKey,
      );

      // Update feed metadata
      await emailStorage.put(feedMetadataKey, JSON.stringify(feedMetadata));
    }

    if (wantsJson) {
      return c.json({ ok: true, emailKey, feedId });
    }
    // Redirect back to the feed emails page
    return c.redirect(`/admin/feeds/${feedId}/emails`);
  } catch (error) {
    console.error("Error deleting email:", error);
    if (wantsJson) {
      return c.json({ ok: false, error: "Error deleting email. Please try again." }, 400);
    }
    return c.text("Error deleting email. Please try again.", 400);
  }
});

// Bulk delete selected emails from a feed
app.post("/feeds/:feedId/emails/bulk-delete", async (c) => {
  const env = c.env as unknown as Env;
  const emailStorage = env.EMAIL_STORAGE;
  const feedId = c.req.param("feedId");
  const contentType = c.req.header("Content-Type") || "";
  const wantsJson =
    contentType.includes("application/json") ||
    (c.req.header("Accept") || "").includes("application/json");

  try {
    const feedMetadataKey = `feed:${feedId}:metadata`;
    const feedMetadata = (await emailStorage.get(feedMetadataKey, {
      type: "json",
    })) as FeedMetadata | null;
    if (!feedMetadata) {
      return wantsJson
        ? c.json({ ok: false, error: "Feed not found" }, 404)
        : c.text("Feed not found", 404);
    }

    const allowedKeys = new Set(feedMetadata.emails.map((email) => email.key));

    if (wantsJson) {
      const body = (await c.req.json().catch(() => null)) as {
        emailKeys?: unknown;
      } | null;

      const rawEmailKeys = Array.isArray(body?.emailKeys) ? body?.emailKeys : [];
      const emailKeys = Array.from(
        new Set(rawEmailKeys.map((value) => String(value)).filter(Boolean)),
      );

      if (emailKeys.length === 0) {
        return c.json({ ok: false, error: "No emails were selected." }, 400);
      }

      // The UI batches requests; cap to avoid accidental huge deletes in one request.
      if (emailKeys.length > 250) {
        return c.json(
          {
            ok: false,
            error:
              "Too many emailKeys for a single request. Please delete in smaller batches.",
          },
          413,
        );
      }

      const candidates = emailKeys.filter((key) => allowedKeys.has(key));
      const { ok: deletedOk, failed: failedEmailKeys } =
        await deleteKeysWithConcurrency(emailStorage, candidates, 35);

      const deletedSet = new Set(deletedOk);
      feedMetadata.emails = feedMetadata.emails.filter(
        (email) => !deletedSet.has(email.key),
      );
      await emailStorage.put(feedMetadataKey, JSON.stringify(feedMetadata));

      return c.json({
        ok: failedEmailKeys.length === 0,
        deletedEmailKeys: deletedOk,
        failedEmailKeys,
      });
    }

    const formData = await c.req.formData();
    const rawEmailKeys = formData
      .getAll("emailKeys")
      .map((value) => value.toString());
    const emailKeys = Array.from(new Set(rawEmailKeys.filter(Boolean)));

    if (emailKeys.length === 0) {
      return c.redirect(`/admin/feeds/${feedId}/emails?message=bulkDeleteNoop`);
    }

    const candidates = emailKeys.filter((key) => allowedKeys.has(key));
    const { ok: deletedOk } = await deleteKeysWithConcurrency(
      emailStorage,
      candidates,
      35,
    );

    const deletedSet = new Set(deletedOk);
    feedMetadata.emails = feedMetadata.emails.filter(
      (email) => !deletedSet.has(email.key),
    );
    await emailStorage.put(feedMetadataKey, JSON.stringify(feedMetadata));

    return c.redirect(
      `/admin/feeds/${feedId}/emails?message=bulkDeleted&count=${deletedOk.length}`,
    );
  } catch (error) {
    console.error("Error bulk deleting emails:", error);
    return wantsJson
      ? c.json(
          {
            ok: false,
            error:
              "Server error while deleting emails. This can happen if Cloudflare is rate-limiting requests or if the Worker hit a plan quota. Please try again.",
          },
          500,
        )
      : c.text("Error bulk deleting emails. Please try again.", 500);
  }
});

// Helper function to list all feeds
async function listAllFeeds(
  emailStorage: KVNamespace,
): Promise<FeedListItem[]> {
  try {
    const feedListKey = "feeds:list";
    const feedList = (await emailStorage.get(feedListKey, {
      type: "json",
    })) as FeedList | null;
    return feedList?.feeds || [];
  } catch (error) {
    console.error("Error listing feeds:", error);
    return [];
  }
}

// Helper function to add a feed to the list of all feeds
async function addFeedToList(
  emailStorage: KVNamespace,
  feedId: string,
  title: string,
  description?: string,
): Promise<void> {
  try {
    const feedListKey = "feeds:list";
    const feedList = ((await emailStorage.get(feedListKey, {
      type: "json",
    })) as FeedList | null) || { feeds: [] };

    // Add new feed to the list
    feedList.feeds.push({
      id: feedId,
      title,
      description,
    });

    // Store updated list
    await emailStorage.put(feedListKey, JSON.stringify(feedList));
  } catch (error) {
    console.error("Error adding feed to list:", error);
  }
}

// Helper function to update a feed in the list of all feeds
async function updateFeedInList(
  emailStorage: KVNamespace,
  feedId: string,
  title: string,
  description?: string,
): Promise<void> {
  try {
    const feedListKey = "feeds:list";
    const feedList = ((await emailStorage.get(feedListKey, {
      type: "json",
    })) as FeedList | null) || { feeds: [] };

    // Find and update the feed in the list
    const feedIndex = feedList.feeds.findIndex((feed) => feed.id === feedId);
    if (feedIndex !== -1) {
      feedList.feeds[feedIndex].title = title;
      feedList.feeds[feedIndex].description = description;

      // Store updated list
      await emailStorage.put(feedListKey, JSON.stringify(feedList));
    }
  } catch (error) {
    console.error("Error updating feed in list:", error);
  }
}

async function removeFeedsFromListBulk(
  emailStorage: KVNamespace,
  feedIds: string[],
): Promise<string[]> {
  try {
    const feedListKey = "feeds:list";
    const feedList = ((await emailStorage.get(feedListKey, {
      type: "json",
    })) as FeedList | null) || { feeds: [] };

    const toRemove = new Set(feedIds.filter(Boolean));
    if (toRemove.size === 0) {
      return [];
    }

    const removed: string[] = [];
    const nextFeeds: FeedListItem[] = [];

    for (const feed of feedList.feeds) {
      if (toRemove.has(feed.id)) {
        removed.push(feed.id);
        continue;
      }
      nextFeeds.push(feed);
    }

    if (removed.length === 0) {
      return [];
    }

    feedList.feeds = nextFeeds;

    // Store updated list
    await emailStorage.put(feedListKey, JSON.stringify(feedList));
    return removed;
  } catch (error) {
    console.error("Error removing feed from list:", error);
    return [];
  }
}

// Helper function to remove a feed from the list of all feeds
async function removeFeedFromList(
  emailStorage: KVNamespace,
  feedId: string,
): Promise<boolean> {
  const removed = await removeFeedsFromListBulk(emailStorage, [feedId]);
  return removed.includes(feedId);
}

// Update feed via API (for in-place editing)
app.post("/api/feeds/:feedId/update", async (c) => {
  // Type assertion for environment variables
  const env = c.env as unknown as Env;
  const emailStorage = env.EMAIL_STORAGE;
  const feedId = c.req.param("feedId");

  try {
    // Parse JSON data from request
    const data = await c.req.json();
    const { title, description } = data;

    // Validate inputs
    const parsedData = updateFeedSchema.parse({
      title,
      description,
      language: "en", // We're defaulting to English
    });

    // Get existing feed config
    const feedConfigKey = `feed:${feedId}:config`;
    const existingConfig = (await emailStorage.get(feedConfigKey, {
      type: "json",
    })) as FeedConfig | null;

    if (!existingConfig) {
      return c.json({ error: "Feed not found" }, 404);
    }

    // Update feed configuration
    await emailStorage.put(
      feedConfigKey,
      JSON.stringify({
        ...existingConfig,
        title: parsedData.title,
        description: parsedData.description,
        updated_at: Date.now(),
      }),
    );

    // Update feed in the list of all feeds
    await updateFeedInList(
      emailStorage,
      feedId,
      parsedData.title,
      parsedData.description,
    );

    // Return success response
    return c.json({ success: true });
  } catch (error) {
    console.error("Error updating feed via API:", error);
    return c.json({ error: "Error updating feed" }, 400);
  }
});

// Export the Hono app
export const handle = app;

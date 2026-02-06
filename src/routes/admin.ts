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
              <span class="pill">${feedsWithConfig.length}</span>
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
                    <div class="toolbar">
                      <div class="toolbar-group toolbar-group-fill">
                        <input
                          type="search"
                          id="feed-search"
                          class="search"
                          placeholder="Search title, feed id, or description"
                          oninput="scheduleFeedFilter()"
                        />
                        <button
                          type="button"
                          class="button button-small"
                          onclick="setVisibleFeedSelection(true)"
                        >
                          Select Visible
                        </button>
                        <button
                          type="button"
                          class="button button-small"
                          onclick="setVisibleFeedSelection(false)"
                        >
                          Clear Visible
                        </button>
                        <span class="pill" id="selected-feed-count"
                          >0 selected</span
                        >
                      </div>
                    </div>

                    <form
                      id="bulk-feed-delete-form"
                      action="/admin/feeds/bulk-delete"
                      method="post"
                      onsubmit="return confirmBulkFeedDelete()"
                    >
                      <input type="hidden" name="view" value="table" />

                      <div class="table-wrap">
                        <table class="table table-feeds">
                          <thead>
                            <tr>
                              <th>
                                <input
                                  type="checkbox"
                                  id="select-all-feeds"
                                  onchange="toggleAllFeeds(this.checked)"
                                />
                              </th>
                              <th>Title</th>
                              <th>Feed ID</th>
                              <th>Email</th>
                              <th>RSS</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody id="feed-table-body">
                            ${feedsWithConfig.map((feed) => {
                              const emailAddress = `${feed.id}@${env.DOMAIN}`;
                              const rssUrl = `https://${env.DOMAIN}/rss/${feed.id}`;
                              const titleDisplay = clampText(feed.title, 160);
                              const titleHover = clampText(feed.title, 1000);
                              const descDisplay = clampText(feed.description || "", 220);
                              const descHover = clampText(feed.description || "", 1000);
                              const searchHaystack =
                                `${clampText(feed.title, 320)} ${feed.id} ${clampText(feed.description || "", 320)}`.toLowerCase();

                              return html`
                                <tr
                                  class="feed-row"
                                  data-search="${searchHaystack}"
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
                                        class="button button-small button-danger"
                                        onclick="confirmDelete('${feed.id}')"
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

                      <div class="actions-row">
                        <button
                          id="bulk-delete-feeds-button"
                          type="submit"
                          class="button button-danger"
                          disabled
                        >
                          Delete Selected Feeds
                        </button>
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
                                onclick="confirmDelete('${feed.id}')"
                                class="button button-small button-danger"
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
        let FEED_BULK_DELETE_BUTTON_EL = null;
        let FEED_SELECT_ALL_EL = null;
        let FEED_FILTER_TIMER = null;

        function initFeedUI() {
          FEED_ROWS = Array.from(document.querySelectorAll('.feed-row'));
          FEED_CHECKBOXES = Array.from(document.querySelectorAll('.feed-select'));
          FEED_SELECTED_COUNT_EL = document.getElementById('selected-feed-count');
          FEED_BULK_DELETE_BUTTON_EL = document.getElementById('bulk-delete-feeds-button');
          FEED_SELECT_ALL_EL = document.getElementById('select-all-feeds');
          updateFeedSelectionState();
        }

        function scheduleFeedFilter() {
          if (FEED_FILTER_TIMER) {
            clearTimeout(FEED_FILTER_TIMER);
          }
          FEED_FILTER_TIMER = setTimeout(filterFeedRows, 120);
        }

        function confirmDelete(feedId) {
          if (confirm('Are you sure you want to delete this feed? This action cannot be undone.')) {
            const currentView = new URL(window.location.href).searchParams.get('view') || 'list';
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = '/admin/feeds/' + feedId + '/delete?view=' + encodeURIComponent(currentView);
            document.body.appendChild(form);
            form.submit();
          }
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

        function filterFeedRows() {
          const query = (document.getElementById('feed-search')?.value || '').toLowerCase().trim();
          FEED_ROWS.forEach((row) => {
            const haystack = row.getAttribute('data-search') || '';
            row.hidden = !!query && !haystack.includes(query);
          });
          updateFeedSelectionState();
        }

        function confirmBulkFeedDelete() {
          const selected = FEED_CHECKBOXES.filter((checkbox) => checkbox.checked).length;
          if (selected === 0) {
            return false;
          }
          return confirm('Delete ' + selected + ' selected feed(s)? This will also delete all emails inside those feeds.');
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

async function deleteFeedAndEmails(
  emailStorage: KVNamespace,
  feedId: string,
): Promise<boolean> {
  const feedMetadataKey = `feed:${feedId}:metadata`;
  const feedMetadata = (await emailStorage.get(feedMetadataKey, {
    type: "json",
  })) as FeedMetadata | null;

  if (!feedMetadata) {
    return false;
  }

  for (const email of feedMetadata.emails) {
    await emailStorage.delete(email.key);
  }

  await emailStorage.delete(`feed:${feedId}:config`);
  await emailStorage.delete(feedMetadataKey);
  await removeFeedFromList(emailStorage, feedId);

  return true;
}

// Delete feed
app.post("/feeds/:feedId/delete", async (c) => {
  const env = c.env as unknown as Env;
  const emailStorage = env.EMAIL_STORAGE;
  const feedId = c.req.param("feedId");
  const view = c.req.query("view") === "table" ? "table" : "list";

  try {
    const deleted = await deleteFeedAndEmails(emailStorage, feedId);
    if (!deleted) {
      return c.text("Feed not found", 404);
    }
    return c.redirect(`/admin?view=${view}`);
  } catch (error) {
    console.error("Error deleting feed:", error);
    return c.text("Error deleting feed. Please try again.", 400);
  }
});

// Bulk delete feeds selected in the dashboard
app.post("/feeds/bulk-delete", async (c) => {
  const env = c.env as unknown as Env;
  const emailStorage = env.EMAIL_STORAGE;

  try {
    const formData = await c.req.formData();
    const view = formData.get("view")?.toString() === "table" ? "table" : "list";
    const redirectBase = `/admin?view=${view}`;
    const rawIds = formData.getAll("feedIds").map((value) => value.toString());
    const feedIds = Array.from(new Set(rawIds.filter(Boolean)));

    if (feedIds.length === 0) {
      return c.redirect(`${redirectBase}&message=bulkDeleteNoop`);
    }

    let deletedCount = 0;
    for (const feedId of feedIds) {
      const deleted = await deleteFeedAndEmails(emailStorage, feedId);
      if (deleted) {
        deletedCount += 1;
      }
    }

    return c.redirect(`${redirectBase}&message=bulkDeleted&count=${deletedCount}`);
  } catch (error) {
    console.error("Error bulk deleting feeds:", error);
    return c.text("Error bulk deleting feeds. Please try again.", 400);
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

          <h2>Emails (${feedMetadata.emails.length})</h2>

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
                <div class="toolbar">
                  <div class="toolbar-group toolbar-group-fill">
                    <input
                      type="search"
                      id="email-search"
                      class="search"
                      placeholder="Search email subjects"
                      oninput="scheduleEmailFilter()"
                    />
                  <button
                    type="button"
                    class="button button-small"
                    onclick="setVisibleEmailSelection(true)"
                  >
                    Select Visible
                  </button>
                  <button
                    type="button"
                    class="button button-small"
                    onclick="setVisibleEmailSelection(false)"
                  >
                    Clear Visible
                  </button>
                    <span class="pill" id="selected-email-count">0 selected</span>
                  </div>
                </div>

                <form
                  action="/admin/feeds/${feedId}/emails/bulk-delete"
                  method="post"
                  onsubmit="return confirmBulkEmailDelete()"
                >
                  <div class="table-wrap">
                    <table class="table table-emails">
                      <thead>
                        <tr>
                          <th>
                            <input
                              type="checkbox"
                              id="select-all-emails"
                              onchange="toggleAllEmails(this.checked)"
                            />
                          </th>
                          <th>Subject</th>
                          <th>Received</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${feedMetadata.emails.map((email: EmailMetadata) => {
                          const subjectDisplay = clampText(email.subject, 180);
                          const subjectHover = clampText(email.subject, 1000);
                          const searchHaystack = clampText(email.subject, 320).toLowerCase();

                          return html`
                            <tr
                              class="email-row"
                              data-search="${searchHaystack}"
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
                                    onclick="confirmDeleteEmail('${email.key}', '${feedId}')"
                                    class="button button-small button-danger"
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
                  <div class="actions-row">
                    <button
                      id="bulk-delete-emails-button"
                      type="submit"
                      class="button button-danger"
                      disabled
                    >
                      Delete Selected Emails
                    </button>
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
        let EMAIL_ROWS = [];
        let EMAIL_CHECKBOXES = [];
        let EMAIL_SELECTED_COUNT_EL = null;
        let EMAIL_BULK_DELETE_BUTTON_EL = null;
        let EMAIL_SELECT_ALL_EL = null;
        let EMAIL_FILTER_TIMER = null;

        function initEmailUI() {
          EMAIL_ROWS = Array.from(document.querySelectorAll('.email-row'));
          EMAIL_CHECKBOXES = Array.from(document.querySelectorAll('.email-select'));
          EMAIL_SELECTED_COUNT_EL = document.getElementById('selected-email-count');
          EMAIL_BULK_DELETE_BUTTON_EL = document.getElementById('bulk-delete-emails-button');
          EMAIL_SELECT_ALL_EL = document.getElementById('select-all-emails');
          updateEmailSelectionState();
        }

        function scheduleEmailFilter() {
          if (EMAIL_FILTER_TIMER) {
            clearTimeout(EMAIL_FILTER_TIMER);
          }
          EMAIL_FILTER_TIMER = setTimeout(filterEmailRows, 120);
        }

        function confirmDeleteEmail(emailKey, feedId) {
          if (confirm('Are you sure you want to delete this email? This action cannot be undone.')) {
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = '/admin/emails/' + emailKey + '/delete?feedId=' + feedId;
            document.body.appendChild(form);
            form.submit();
          }
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

        function filterEmailRows() {
          const query = (document.getElementById('email-search')?.value || '').toLowerCase().trim();
          EMAIL_ROWS.forEach((row) => {
            const haystack = row.getAttribute('data-search') || '';
            row.hidden = !!query && !haystack.includes(query);
          });
          updateEmailSelectionState();
        }

        function confirmBulkEmailDelete() {
          const selected = EMAIL_CHECKBOXES.filter((checkbox) => checkbox.checked).length;
          if (selected === 0) {
            return false;
          }
          return confirm('Delete ' + selected + ' selected email(s)?');
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

  try {
    // Get feedId from query parameters instead of form data
    const feedId = c.req.query("feedId");

    if (!feedId) {
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

    // Redirect back to the feed emails page
    return c.redirect(`/admin/feeds/${feedId}/emails`);
  } catch (error) {
    console.error("Error deleting email:", error);
    return c.text("Error deleting email. Please try again.", 400);
  }
});

// Bulk delete selected emails from a feed
app.post("/feeds/:feedId/emails/bulk-delete", async (c) => {
  const env = c.env as unknown as Env;
  const emailStorage = env.EMAIL_STORAGE;
  const feedId = c.req.param("feedId");

  try {
    const formData = await c.req.formData();
    const rawEmailKeys = formData
      .getAll("emailKeys")
      .map((value) => value.toString());
    const emailKeys = Array.from(new Set(rawEmailKeys.filter(Boolean)));

    if (emailKeys.length === 0) {
      return c.redirect(`/admin/feeds/${feedId}/emails?message=bulkDeleteNoop`);
    }

    const feedMetadataKey = `feed:${feedId}:metadata`;
    const feedMetadata = (await emailStorage.get(feedMetadataKey, {
      type: "json",
    })) as FeedMetadata | null;
    if (!feedMetadata) {
      return c.text("Feed not found", 404);
    }

    const allowedKeys = new Set(feedMetadata.emails.map((email) => email.key));
    let deletedCount = 0;

    for (const emailKey of emailKeys) {
      if (!allowedKeys.has(emailKey)) {
        continue;
      }
      await emailStorage.delete(emailKey);
      deletedCount += 1;
    }

    feedMetadata.emails = feedMetadata.emails.filter(
      (email) => !emailKeys.includes(email.key),
    );
    await emailStorage.put(feedMetadataKey, JSON.stringify(feedMetadata));

    return c.redirect(
      `/admin/feeds/${feedId}/emails?message=bulkDeleted&count=${deletedCount}`,
    );
  } catch (error) {
    console.error("Error bulk deleting emails:", error);
    return c.text("Error bulk deleting emails. Please try again.", 400);
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

// Helper function to remove a feed from the list of all feeds
async function removeFeedFromList(
  emailStorage: KVNamespace,
  feedId: string,
): Promise<void> {
  try {
    const feedListKey = "feeds:list";
    const feedList = ((await emailStorage.get(feedListKey, {
      type: "json",
    })) as FeedList | null) || { feeds: [] };

    // Filter out the removed feed
    feedList.feeds = feedList.feeds.filter((feed) => feed.id !== feedId);

    // Store updated list
    await emailStorage.put(feedListKey, JSON.stringify(feedList));
  } catch (error) {
    console.error("Error removing feed from list:", error);
  }
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

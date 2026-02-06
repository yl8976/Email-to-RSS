import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import app from "./admin";
import { createMockEnv } from "../test/setup";
import { Env } from "../types";

describe("Admin Routes", () => {
  let testApp: Hono;
  let mockEnv: Env;
  let request: (path: string, init?: RequestInit) => Promise<Response>;
  let loginAndGetCookie: () => Promise<string>;

  beforeEach(() => {
    mockEnv = createMockEnv();
    testApp = new Hono();
    testApp.route("/admin", app);
    request = (path, init = {}) => testApp.request(path, init, mockEnv);
    loginAndGetCookie = async () => {
      const formData = new FormData();
      formData.append("password", "test-password");
      const response = await request("/admin/login", {
        method: "POST",
        body: formData,
      });
      expect(response.status).toBe(302);
      const setCookie = response.headers.get("Set-Cookie");
      expect(setCookie).toBeTruthy();
      return (setCookie as string).split(";")[0];
    };
  });

  describe("Authentication", () => {
    it("should redirect to login page when not authenticated", async () => {
      const res = await request("/admin");
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe("/admin/login");
    });

    it("should allow access to login page without authentication", async () => {
      const res = await request("/admin/login");
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/html");
    });

    it("should set auth cookie and redirect on successful login", async () => {
      const formData = new FormData();
      formData.append("password", "test-password");

      const res = await request("/admin/login", {
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe("/admin");
      const cookie = res.headers.get("Set-Cookie");
      expect(cookie).toContain("admin_auth=");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Strict");
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("Path=/");
    });

    it("should reject login with incorrect password", async () => {
      const formData = new FormData();
      formData.append("password", "wrong-password");

      const res = await request("/admin/login", {
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe("/admin/login?error=invalid");
    });

    it("should reject login with missing password", async () => {
      const formData = new FormData();

      const res = await request("/admin/login", {
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe("/admin/login?error=invalid");
    });
  });

  describe("Protected Routes", () => {
    it("should allow access to dashboard with valid auth cookie", async () => {
      const authCookie = await loginAndGetCookie();
      const res = await request("/admin", {
        headers: {
          Cookie: authCookie,
        },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/html");
    });

    it("should reject access with forged auth cookie", async () => {
      const res = await request("/admin", {
        headers: {
          Cookie: "admin_auth=true",
        },
      });
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe("/admin/login");
    });

    describe("Feed Creation", () => {
      it("should prevent feed creation without authentication", async () => {
        const formData = new FormData();
        formData.append("title", "Test Feed");
        formData.append("description", "Test Description");

        const res = await request("/admin/feeds/create", {
          method: "POST",
          body: formData,
        });

        expect(res.status).toBe(302);
        expect(res.headers.get("Location")).toBe("/admin/login");

        // Verify no feed was created
        const feedList = await mockEnv.EMAIL_STORAGE.get("feeds:list", "json");
        expect(feedList).toBeNull();
      });

      it("should allow feed creation with valid authentication", async () => {
        const authCookie = await loginAndGetCookie();
        const formData = new FormData();
        formData.append("title", "Test Feed");
        formData.append("description", "Test Description");

        const res = await request("/admin/feeds/create", {
          method: "POST",
          headers: {
            Cookie: authCookie,
          },
          body: formData,
        });

        expect(res.status).toBe(302); // Redirects back to dashboard
        expect(res.headers.get("Location")).toBe("/admin?view=list");

        // Verify feed was created in KV
        const feedList = (await mockEnv.EMAIL_STORAGE.get(
          "feeds:list",
          "json",
        )) as { feeds: Array<{ id: string; title: string }> } | null;
        expect(feedList).toBeTruthy();
        expect(feedList?.feeds.length).toBe(1);
        expect(feedList?.feeds[0].title).toBe("Test Feed");

        // Verify feed config was created
        const feedId = feedList?.feeds[0].id as string;
        const feedConfig = await mockEnv.EMAIL_STORAGE.get(
          `feed:${feedId}:config`,
          "json",
        );
        expect(feedConfig).toBeTruthy();
        expect(feedConfig.title).toBe("Test Feed");
        expect(feedConfig.description).toBe("Test Description");
      });

      it("should reject feed creation with missing title", async () => {
        const authCookie = await loginAndGetCookie();
        const formData = new FormData();
        formData.append("description", "Test Description");

        const res = await request("/admin/feeds/create", {
          method: "POST",
          headers: {
            Cookie: authCookie,
          },
          body: formData,
        });

        expect(res.status).toBe(400);

        // Verify no feed was created
        const feedList = await mockEnv.EMAIL_STORAGE.get("feeds:list", "json");
        expect(feedList).toBeNull();
      });
    });

    describe("Feed Management", () => {
      it("should prevent feed deletion without authentication", async () => {
        const res = await request("/admin/feeds/test-feed/delete", {
          method: "POST",
        });

        expect(res.status).toBe(302);
        expect(res.headers.get("Location")).toBe("/admin/login");
      });

      it("should prevent API feed updates without authentication", async () => {
        const res = await request("/admin/api/feeds/test-feed/update", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: "Updated Title",
            description: "Updated Description",
          }),
        });

        expect(res.status).toBe(302);
        expect(res.headers.get("Location")).toBe("/admin/login");
      });

      it("should allow feed deletion with valid authentication", async () => {
        const authCookie = await loginAndGetCookie();
        // First create a feed
        const formData = new FormData();
        formData.append("title", "Test Feed");
        formData.append("description", "Test Description");

        const createRes = await request("/admin/feeds/create", {
          method: "POST",
          headers: {
            Cookie: authCookie,
          },
          body: formData,
        });

        expect(createRes.status).toBe(302);

        // Get the feed ID
        const feedList = (await mockEnv.EMAIL_STORAGE.get(
          "feeds:list",
          "json",
        )) as { feeds: Array<{ id: string; title: string }> } | null;
        const feedId = feedList?.feeds[0].id as string;

        // Now delete it
        const deleteRes = await request(`/admin/feeds/${feedId}/delete`, {
          method: "POST",
          headers: {
            Cookie: authCookie,
          },
        });

        expect(deleteRes.status).toBe(302);
        expect(deleteRes.headers.get("Location")).toBe("/admin?view=list");

        // Verify feed was deleted
        const updatedFeedList = (await mockEnv.EMAIL_STORAGE.get(
          "feeds:list",
          "json",
        )) as { feeds: Array<{ id: string; title: string }> } | null;
        expect(updatedFeedList).toBeTruthy();
        expect(updatedFeedList?.feeds.length).toBe(0);

        // Verify feed config was deleted
        const feedConfig = await mockEnv.EMAIL_STORAGE.get(
          `feed:${feedId}:config`,
          "json",
        );
        expect(feedConfig).toBeNull();
      });

      it("should return JSON for feed deletion when requested", async () => {
        const authCookie = await loginAndGetCookie();
        const formData = new FormData();
        formData.append("title", "JSON Feed");
        formData.append("description", "Test Description");

        const createRes = await request("/admin/feeds/create", {
          method: "POST",
          headers: {
            Cookie: authCookie,
          },
          body: formData,
        });

        expect(createRes.status).toBe(302);

        const feedList = (await mockEnv.EMAIL_STORAGE.get(
          "feeds:list",
          "json",
        )) as { feeds: Array<{ id: string; title: string }> } | null;
        const feedId = feedList?.feeds[0].id as string;

        const deleteRes = await request(`/admin/feeds/${feedId}/delete?view=list`, {
          method: "POST",
          headers: {
            Cookie: authCookie,
            Accept: "application/json",
          },
        });

        expect(deleteRes.status).toBe(200);
        const payload = await deleteRes.json();
        expect(payload.ok).toBe(true);
        expect(payload.feedId).toBe(feedId);
      });

      it("should allow bulk feed deletion with valid authentication", async () => {
        const authCookie = await loginAndGetCookie();

        for (const title of ["Feed A", "Feed B"]) {
          const formData = new FormData();
          formData.append("title", title);
          formData.append("description", "Test");
          const createRes = await request("/admin/feeds/create", {
            method: "POST",
            headers: { Cookie: authCookie },
            body: formData,
          });
          expect(createRes.status).toBe(302);
        }

        const feedListBefore = (await mockEnv.EMAIL_STORAGE.get(
          "feeds:list",
          "json",
        )) as {
          feeds: Array<{ id: string; title: string }>;
        } | null;
        expect(feedListBefore?.feeds.length).toBe(2);

        const bulkForm = new FormData();
        for (const feed of feedListBefore?.feeds || []) {
          bulkForm.append("feedIds", feed.id);
        }

        const bulkDeleteRes = await request("/admin/feeds/bulk-delete", {
          method: "POST",
          headers: { Cookie: authCookie },
          body: bulkForm,
        });

        expect(bulkDeleteRes.status).toBe(302);
        expect(bulkDeleteRes.headers.get("Location")).toContain("/admin?view=list");
        expect(bulkDeleteRes.headers.get("Location")).toContain("message=bulkDeleted");

        const feedListAfter = (await mockEnv.EMAIL_STORAGE.get(
          "feeds:list",
          "json",
        )) as {
          feeds: Array<{ id: string; title: string }>;
        } | null;
        expect(feedListAfter?.feeds.length).toBe(0);
      });
    });

    describe("Email Management", () => {
      it("should return JSON for email deletion when requested", async () => {
        const authCookie = await loginAndGetCookie();
        const formData = new FormData();
        formData.append("title", "Email Feed");
        formData.append("description", "Test Description");

        const createRes = await request("/admin/feeds/create", {
          method: "POST",
          headers: {
            Cookie: authCookie,
          },
          body: formData,
        });

        expect(createRes.status).toBe(302);

        const feedList = (await mockEnv.EMAIL_STORAGE.get(
          "feeds:list",
          "json",
        )) as { feeds: Array<{ id: string; title: string }> } | null;
        const feedId = feedList?.feeds[0].id as string;
        const emailKey = `feed:${feedId}:emails:123456`;

        await mockEnv.EMAIL_STORAGE.put(
          emailKey,
          JSON.stringify({
            subject: "Hello",
            from: "sender@example.com",
            content: "<p>Hi</p>",
            receivedAt: 123456,
            headers: {},
          }),
        );

        const feedMetadataKey = `feed:${feedId}:metadata`;
        const feedMetadata = (await mockEnv.EMAIL_STORAGE.get(
          feedMetadataKey,
          "json",
        )) as { emails: Array<{ key: string; subject: string; receivedAt: number }> } | null;
        const updatedMetadata = {
          emails: [
            ...(feedMetadata?.emails || []),
            { key: emailKey, subject: "Hello", receivedAt: 123456 },
          ],
        };
        await mockEnv.EMAIL_STORAGE.put(
          feedMetadataKey,
          JSON.stringify(updatedMetadata),
        );

        const deleteRes = await request(`/admin/emails/${emailKey}/delete?feedId=${feedId}`, {
          method: "POST",
          headers: {
            Cookie: authCookie,
            Accept: "application/json",
          },
        });

        expect(deleteRes.status).toBe(200);
        const payload = await deleteRes.json();
        expect(payload.ok).toBe(true);
        expect(payload.emailKey).toBe(emailKey);

        const deletedEmail = await mockEnv.EMAIL_STORAGE.get(emailKey, "json");
        expect(deletedEmail).toBeNull();

        const metadataAfter = (await mockEnv.EMAIL_STORAGE.get(
          feedMetadataKey,
          "json",
        )) as { emails: Array<{ key: string; subject: string; receivedAt: number }> } | null;
        expect(metadataAfter?.emails.length).toBe(0);
      });
    });
  });
});

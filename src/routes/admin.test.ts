import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import app from './admin';
import { createMockEnv } from '../test/setup';
import { Env } from '../types';

describe('Admin Routes', () => {
  let testApp: Hono;
  let mockEnv: Env;

  beforeEach(() => {
    mockEnv = createMockEnv();
    testApp = new Hono();
    testApp.route('/admin', app);
  });

  describe('Authentication', () => {
    it('should redirect to login page when not authenticated', async () => {
      const res = await testApp.request('/admin', {
        env: mockEnv
      });
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('/admin/login');
    });

    it('should allow access to login page without authentication', async () => {
      const res = await testApp.request('/admin/login', {
        env: mockEnv
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/html');
    });

    it('should set auth cookie and redirect on successful login', async () => {
      const formData = new FormData();
      formData.append('password', 'test-password');

      const res = await testApp.request('/admin/login', {
        method: 'POST',
        body: formData,
        env: mockEnv
      });

      expect(res.status).toBe(200);
      const cookie = res.headers.get('Set-Cookie');
      expect(cookie).toContain('admin_auth=true');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain('Path=/');
    });

    it('should reject login with incorrect password', async () => {
      const formData = new FormData();
      formData.append('password', 'wrong-password');

      const res = await testApp.request('/admin/login', {
        method: 'POST',
        body: formData,
        env: mockEnv
      });

      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('/admin/login?error=invalid');
    });

    it('should reject login with missing password', async () => {
      const formData = new FormData();

      const res = await testApp.request('/admin/login', {
        method: 'POST',
        body: formData,
        env: mockEnv
      });

      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('/admin/login?error=invalid');
    });
  });

  describe('Protected Routes', () => {
    const authCookie = 'admin_auth=true';

    it('should allow access to dashboard with valid auth cookie', async () => {
      const res = await testApp.request('/admin', {
        headers: {
          Cookie: authCookie
        },
        env: mockEnv
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/html');
    });

    describe('Feed Creation', () => {
      it('should prevent feed creation without authentication', async () => {
        const formData = new FormData();
        formData.append('title', 'Test Feed');
        formData.append('description', 'Test Description');

        const res = await testApp.request('/admin/feeds/create', {
          method: 'POST',
          body: formData,
          env: mockEnv
        });

        expect(res.status).toBe(302);
        expect(res.headers.get('Location')).toBe('/admin/login');

        // Verify no feed was created
        const feedList = await mockEnv.EMAIL_STORAGE.get('feeds', 'json');
        expect(feedList).toBeNull();
      });

      it('should allow feed creation with valid authentication', async () => {
        const formData = new FormData();
        formData.append('title', 'Test Feed');
        formData.append('description', 'Test Description');

        const res = await testApp.request('/admin/feeds/create', {
          method: 'POST',
          headers: {
            Cookie: authCookie
          },
          body: formData,
          env: mockEnv
        });

        expect(res.status).toBe(302); // Redirects back to dashboard
        expect(res.headers.get('Location')).toBe('/admin');

        // Verify feed was created in KV
        const feedList = await mockEnv.EMAIL_STORAGE.get('feeds', 'json');
        expect(feedList).toBeTruthy();
        expect(feedList.length).toBe(1);
        expect(feedList[0].title).toBe('Test Feed');

        // Verify feed config was created
        const feedId = feedList[0].id;
        const feedConfig = await mockEnv.EMAIL_STORAGE.get(`feed:${feedId}:config`, 'json');
        expect(feedConfig).toBeTruthy();
        expect(feedConfig.title).toBe('Test Feed');
        expect(feedConfig.description).toBe('Test Description');
      });

      it('should reject feed creation with missing title', async () => {
        const formData = new FormData();
        formData.append('description', 'Test Description');

        const res = await testApp.request('/admin/feeds/create', {
          method: 'POST',
          headers: {
            Cookie: authCookie
          },
          body: formData,
          env: mockEnv
        });

        expect(res.status).toBe(400);

        // Verify no feed was created
        const feedList = await mockEnv.EMAIL_STORAGE.get('feeds', 'json');
        expect(feedList).toBeNull();
      });
    });

    describe('Feed Management', () => {
      it('should prevent feed deletion without authentication', async () => {
        const res = await testApp.request('/admin/feeds/test-feed/delete', {
          method: 'POST',
          env: mockEnv
        });

        expect(res.status).toBe(302);
        expect(res.headers.get('Location')).toBe('/admin/login');
      });

      it('should prevent API feed updates without authentication', async () => {
        const res = await testApp.request('/admin/api/feeds/test-feed/update', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            title: 'Updated Title',
            description: 'Updated Description'
          }),
          env: mockEnv
        });

        expect(res.status).toBe(302);
        expect(res.headers.get('Location')).toBe('/admin/login');
      });

      it('should allow feed deletion with valid authentication', async () => {
        // First create a feed
        const formData = new FormData();
        formData.append('title', 'Test Feed');
        formData.append('description', 'Test Description');

        const createRes = await testApp.request('/admin/feeds/create', {
          method: 'POST',
          headers: {
            Cookie: authCookie
          },
          body: formData,
          env: mockEnv
        });

        expect(createRes.status).toBe(302);

        // Get the feed ID
        const feedList = await mockEnv.EMAIL_STORAGE.get('feeds', 'json');
        const feedId = feedList[0].id;

        // Now delete it
        const deleteRes = await testApp.request(`/admin/feeds/${feedId}/delete`, {
          method: 'POST',
          headers: {
            Cookie: authCookie
          },
          env: mockEnv
        });

        expect(deleteRes.status).toBe(302);
        expect(deleteRes.headers.get('Location')).toBe('/admin');

        // Verify feed was deleted
        const updatedFeedList = await mockEnv.EMAIL_STORAGE.get('feeds', 'json');
        expect(updatedFeedList).toBeTruthy();
        expect(updatedFeedList.length).toBe(0);

        // Verify feed config was deleted
        const feedConfig = await mockEnv.EMAIL_STORAGE.get(`feed:${feedId}:config`, 'json');
        expect(feedConfig).toBeNull();
      });
    });
  });
});

import { Context, Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { html, raw } from 'hono/html';
import { z } from 'zod';
import { Env, FeedConfig, FeedList, FeedMetadata, EmailMetadata, EmailData, FeedListItem } from '../types';
import { generateFeedId } from '../utils/id-generator';
import { designSystem } from '../styles/index';
import { interactiveScripts, authHelpers } from '../scripts/index';

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

// Authentication middleware for admin routes
async function authMiddleware(c: Context, next: () => Promise<void>) {
  const path = new URL(c.req.url).pathname;
  // Skip auth check for login page - note that path includes /admin prefix
  if (path === '/admin/login') {
    return next();
  }

  const authCookie = getCookie(c, 'admin_auth');
  if (!authCookie || authCookie !== 'true') {
    return c.redirect('/admin/login');
  }

  await next();
}

// Apply auth middleware to all admin routes
app.use('*', authMiddleware);

// Schema for feed creation
const createFeedSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  language: z.string().optional().default('en')
});

// Schema for feed updates
const updateFeedSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  language: z.string().optional().default('en')
});

// Authentication schema
const authSchema = z.object({
  password: z.string().min(1, 'Password is required')
});

// Base HTML layout with design system
const layout = (title: string, content: any) => {
  return html`<!DOCTYPE html>
  <html>
    <head>
      <title>${title} - Email to RSS Admin</title>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        ${raw(designSystem)}
      </style>
      <script>
        ${raw(interactiveScripts)}
        ${raw(authHelpers)}
        
        // Check authentication on page load
        document.addEventListener('DOMContentLoaded', () => {
          const path = window.location.pathname;
          if (path !== '/admin/login' && !isAuthenticated()) {
            window.location.href = '/admin/login';
          }
        });
      </script>
    </head>
    <body class="page">
      ${content}
    </body>
  </html>`;
};

// Login page
app.get('/login', (c) => {
  const error = c.req.query('error');
  const errorMessage = error === 'invalid' ? 'Invalid password. Please try again.' : '';
  
  return c.html(layout('Login', html`
    <div class="auth-container fade-in">
      <div class="auth-card">
        <div class="auth-logo">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="24" height="24" rx="12" fill="var(--color-primary)"/>
            <path d="M17 9C17 7.89543 16.1046 7 15 7H9C7.89543 7 7 7.89543 7 9V15C7 16.1046 7.89543 17 9 17H15C16.1046 17 17 16.1046 17 15V9Z" stroke="white" stroke-width="1.5"/>
            <path d="M7 9L12 13L17 9" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <h1 class="auth-title">Email to RSS Admin</h1>
        ${errorMessage ? html`<div class="auth-error">${errorMessage}</div>` : ''}
        <form class="auth-form" action="/admin/login" method="post">
          <div class="form-group">
            <label for="password">Password</label>
            <input type="password" id="password" name="password" required autofocus>
          </div>
          <button type="submit" class="button auth-button">Log In</button>
        </form>
      </div>
    </div>
  `));
});

// Handle login
app.post('/login', async (c) => {
  const env = c.env as unknown as Env;
  
  try {
    const formData = await c.req.formData();
    const password = formData.get('password')?.toString() || '';
    
    // Validate password
    authSchema.parse({ password });
    
    // Check password against environment variable
    if (password === env.ADMIN_PASSWORD) {
      // Set a cookie for server-side authentication
      c.header('Set-Cookie', `admin_auth=true; Path=/; HttpOnly; SameSite=Strict; Max-Age=${60 * 60 * 24 * 7}`); // 1 week
      
      // Also use localStorage for client-side checks
      return c.html(html`
        <script>
          ${raw(`
            localStorage.setItem('authenticated', 'true');
            window.location.href = '/admin';
          `)}
        </script>
      `);
    } else {
      // Incorrect password - redirect back to login with an error message
      return c.redirect('/admin/login?error=invalid');
    }
  } catch (error) {
    console.error('Login error:', error);
    return c.redirect('/admin/login?error=invalid');
  }
});

// Logout route
app.get('/logout', (c) => {
  return c.html(html`
    <script>
      ${raw(`
        localStorage.removeItem('authenticated');
        window.location.href = '/admin/login';
      `)}
    </script>
  `);
});

// Admin dashboard route
app.get('/', async (c) => {
  // Type assertion for environment variables
  const env = c.env as unknown as Env;
  const emailStorage = env.EMAIL_STORAGE;
  
  // List all feeds
  const feedList = await listAllFeeds(emailStorage);
  
  // Fetch full feed configs to get descriptions
  const feedsWithConfig = await Promise.all(
    feedList.map(async (feed) => {
      const configKey = `feed:${feed.id}:config`;
      const config = await emailStorage.get(configKey, { type: 'json' }) as FeedConfig | null;
      return {
        ...feed,
        description: config?.description || ''
      };
    })
  );
  
  return c.html(layout('Dashboard', html`
    <div class="container fade-in">
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
            <input type="text" id="title" name="title" required>
          </div>
          
          <div class="form-group">
            <label for="description">Description</label>
            <textarea id="description" name="description" rows="3"></textarea>
          </div>
          
          <input type="hidden" id="language" name="language" value="en">
          
          <button type="submit" class="button">Create Feed</button>
        </form>
      </div>
      
      <h2>Your Feeds</h2>
      
      ${feedsWithConfig.length > 0 ? 
        html`<ul class="feed-list">
          ${feedsWithConfig.map((feed, index: number) => html`
            <li class="feed-item card" id="feed-${feed.id}">
              <div class="feed-header">
                <h2 class="feed-title" id="title-${feed.id}">${feed.title}</h2>
                <input type="text" class="feed-title-edit hidden" id="title-edit-${feed.id}" value="${feed.title}" placeholder="${feed.title}">
                ${feed.description ? 
                  html`<p class="feed-description" id="desc-${feed.id}">${feed.description}</p>` : 
                  html`<p class="feed-description empty" id="desc-${feed.id}"><i>No description</i></p>`
                }
                <textarea class="feed-description-edit hidden" id="desc-edit-${feed.id}" rows="2" placeholder="${feed.description || 'No description'}">${feed.description}</textarea>
              </div>
              <div style="margin-bottom: var(--spacing-md);">
                <div class="copyable">
                  <span class="copyable-label">Email:</span>
                  <div class="copyable-content">
                    <span class="copyable-value" data-copy="${feed.id}@${env.DOMAIN}">${feed.id}@${env.DOMAIN}</span>
                    <div class="copy-icon-container">
                      <svg class="copy-icon copy-icon-original" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                      <svg class="copy-icon copy-icon-success" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M20 6L9 17l-5-5"></path>
                      </svg>
                    </div>
                  </div>
                </div>
                <div class="copyable">
                  <span class="copyable-label">RSS Feed:</span>
                  <div class="copyable-content">
                    <span class="copyable-value" data-copy="https://${env.DOMAIN}/rss/${feed.id}">https://${env.DOMAIN}/rss/${feed.id}</span>
                    <div class="copy-icon-container">
                      <svg class="copy-icon copy-icon-original" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                      <svg class="copy-icon copy-icon-success" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M20 6L9 17l-5-5"></path>
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
              <div class="feed-buttons">
                <div class="feed-buttons-left">
                  <button id="edit-btn-${feed.id}" onclick="toggleEditMode('${feed.id}')" class="button button-small">Edit</button>
                  <a href="/admin/feeds/${feed.id}/emails" class="button button-small">View Emails</a>
                </div>
                <div class="feed-buttons-right">
                  <button onclick="confirmDelete('${feed.id}')" class="button button-small button-danger">Delete</button>
                </div>
              </div>
            </li>
          `)}
        </ul>` : 
        html`<div class="card"><p>You don't have any feeds yet. Create one above.</p></div>`
      }
    </div>
    
    <script>
      ${raw(`
        function confirmDelete(feedId) {
          if (confirm('Are you sure you want to delete this feed? This action cannot be undone.')) {
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = '/admin/feeds/' + feedId + '/delete';
            document.body.appendChild(form);
            form.submit();
          }
        }
        
        function toggleEditMode(feedId) {
          // Toggle visibility of display and edit elements
          document.getElementById('title-' + feedId).classList.toggle('hidden');
          document.getElementById('desc-' + feedId).classList.toggle('hidden');
          document.getElementById('title-edit-' + feedId).classList.toggle('hidden');
          document.getElementById('desc-edit-' + feedId).classList.toggle('hidden');
          
          // Get the button (could be either edit or save button now)
          const button = document.getElementById('edit-btn-' + feedId) || document.getElementById('save-btn-' + feedId);
          
          // Transform the button
          if (button.textContent === 'Edit') {
            // Change to Save button
            button.textContent = 'Save';
            button.classList.add('button-success');
            button.id = 'save-btn-' + feedId;
            button.onclick = function() { saveFeed(feedId); };
          } else {
            // Change back to Edit button (should not happen normally since we use saveFeed for this)
            button.textContent = 'Edit';
            button.classList.remove('button-success', 'saved');
            button.id = 'edit-btn-' + feedId;
            button.onclick = function() { toggleEditMode(feedId); };
          }
          
          // Focus the title input when entering edit mode
          if (!document.getElementById('title-edit-' + feedId).classList.contains('hidden')) {
            document.getElementById('title-edit-' + feedId).focus();
          }
        }
        
        async function saveFeed(feedId) {
          const titleInput = document.getElementById('title-edit-' + feedId);
          const descInput = document.getElementById('desc-edit-' + feedId);
          const saveBtn = document.getElementById('save-btn-' + feedId);
          const editBtn = document.getElementById('edit-btn-' + feedId);
          const originalTitle = document.getElementById('title-' + feedId).textContent;
          const descElement = document.getElementById('desc-' + feedId);
          const isEmptyDesc = descElement.classList.contains('empty');
          const originalDescription = isEmptyDesc ? '' : descElement.textContent;
          
          // Use original value if input is empty
          const newTitle = titleInput.value.trim() || originalTitle;
          const newDescription = descInput.value.trim() || originalDescription;
          
          // Validate - title should not be empty (using original as fallback anyway)
          if (!newTitle) {
            alert('Title cannot be empty');
            return;
          }
          
          // Change button to saving state
          saveBtn.textContent = 'Saving...';
          saveBtn.disabled = true;
          
          try {
            // Make API call to save the feed
            const response = await fetch('/admin/api/feeds/' + feedId + '/update', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                title: newTitle,
                description: newDescription
              })
            });
            
            if (response.ok) {
              // Update the display elements with new values
              document.getElementById('title-' + feedId).textContent = newTitle;
              
              if (newDescription) {
                descElement.textContent = newDescription;
                descElement.classList.remove('empty');
              } else {
                descElement.innerHTML = '<i>No description</i>';
                descElement.classList.add('empty');
              }
              
              // Show success state
              saveBtn.textContent = 'Saved!';
              saveBtn.classList.add('saved');
              
              // Immediately toggle back to display mode
              document.getElementById('title-' + feedId).classList.remove('hidden');
              document.getElementById('desc-' + feedId).classList.remove('hidden');
              document.getElementById('title-edit-' + feedId).classList.add('hidden');
              document.getElementById('desc-edit-' + feedId).classList.add('hidden');
              
              // After showing "Saved!" for 1 second, transition back to "Edit"
              setTimeout(() => {
                // Instead of showing/hiding different buttons, transform the same button
                // This prevents the button from "jumping" to a different position
                saveBtn.textContent = 'Edit';
                saveBtn.classList.remove('saved', 'button-success');
                saveBtn.id = 'edit-btn-' + feedId;
                saveBtn.onclick = function() { toggleEditMode(feedId); };
                saveBtn.disabled = false;
              }, 1500);
            } else {
              throw new Error('Failed to save');
            }
          } catch (error) {
            console.error('Error saving feed:', error);
            alert('Error saving feed. Please try again.');
            saveBtn.textContent = 'Save';
            saveBtn.disabled = false;
          }
        }
      `)}
    </script>
  `));
});

// Create a new feed
app.post('/feeds/create', async (c) => {
  // Type assertion for environment variables
  const env = c.env as unknown as Env;
  const emailStorage = env.EMAIL_STORAGE;
  
  try {
    const formData = await c.req.formData();
    const title = formData.get('title')?.toString() || '';
    const description = formData.get('description')?.toString();
    const language = formData.get('language')?.toString() || 'en';
    
    // Validate inputs
    const parsedData = createFeedSchema.parse({
      title,
      description,
      language
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
      created_at: Date.now(),
      updated_at: Date.now()
    };
    
    // Create feed metadata
    const feedMetadata: FeedMetadata = {
      emails: []
    };
    
    // Store feed configuration and metadata
    await emailStorage.put(`feed:${feedId}:config`, JSON.stringify(feedConfig));
    await emailStorage.put(`feed:${feedId}:metadata`, JSON.stringify(feedMetadata));
    
    // Add feed to the list of all feeds
    await addFeedToList(emailStorage, feedId, parsedData.title);
    
    // Redirect back to admin page
    return c.redirect('/admin');
  } catch (error) {
    console.error('Error creating feed:', error);
    return c.text('Error creating feed. Please try again.', 400);
  }
});

// Edit feed page
app.get('/feeds/:feedId/edit', async (c) => {
  // Type assertion for environment variables
  const env = c.env as unknown as Env;
  const emailStorage = env.EMAIL_STORAGE;
  const feedId = c.req.param('feedId');
  
  // Get feed configuration
  const feedConfigKey = `feed:${feedId}:config`;
  const feedConfig = await emailStorage.get(feedConfigKey, { type: 'json' }) as FeedConfig | null;
  
  if (!feedConfig) {
    return c.text('Feed not found', 404);
  }
  
  return c.html(layout('Edit Feed', html`
    <div class="container fade-in">
      <div class="header-with-actions">
        <div class="header-title">
          <h1>${feedConfig.title} - Edit Feed</h1>
        </div>
        <div class="header-actions">
          <a href="/admin" class="button button-secondary button-back">Back to Dashboard</a>
        </div>
      </div>
      
      <div class="card">
        <form action="/admin/feeds/${feedId}/edit" method="post">
          <div class="form-group">
            <label for="title">Feed Title</label>
            <input type="text" id="title" name="title" value="${feedConfig.title}" required>
          </div>
          
          <div class="form-group">
            <label for="description">Description</label>
            <textarea id="description" name="description" rows="3">${feedConfig.description || ''}</textarea>
          </div>
          
          <input type="hidden" id="language" name="language" value="en">
          
          <button type="submit" class="button">Update Feed</button>
        </form>
      </div>
    </div>
  `));
});

// Update feed
app.post('/feeds/:feedId/edit', async (c) => {
  // Type assertion for environment variables
  const env = c.env as unknown as Env;
  const emailStorage = env.EMAIL_STORAGE;
  const feedId = c.req.param('feedId');
  
  try {
    const formData = await c.req.formData();
    const title = formData.get('title')?.toString() || '';
    const description = formData.get('description')?.toString();
    const language = formData.get('language')?.toString() || 'en';
    
    // Validate inputs
    const parsedData = updateFeedSchema.parse({
      title,
      description,
      language
    });
    
    // Get existing feed config
    const feedConfigKey = `feed:${feedId}:config`;
    const existingConfig = await emailStorage.get(feedConfigKey, { type: 'json' }) as FeedConfig | null;
    
    if (!existingConfig) {
      return c.text('Feed not found', 404);
    }
    
    // Update feed configuration
    await emailStorage.put(feedConfigKey, JSON.stringify({
      ...existingConfig,
      title: parsedData.title,
      description: parsedData.description,
      language: parsedData.language,
      updated_at: Date.now()
    }));
    
    // Update feed in the list of all feeds
    await updateFeedInList(emailStorage, feedId, parsedData.title);
    
    // Redirect back to admin page
    return c.redirect('/admin');
  } catch (error) {
    console.error('Error updating feed:', error);
    return c.text('Error updating feed. Please try again.', 400);
  }
});

// Delete feed
app.post('/feeds/:feedId/delete', async (c) => {
  // Type assertion for environment variables
  const env = c.env as unknown as Env;
  const emailStorage = env.EMAIL_STORAGE;
  const feedId = c.req.param('feedId');
  
  try {
    // Get feed metadata to find all email keys
    const feedMetadataKey = `feed:${feedId}:metadata`;
    const feedMetadata = await emailStorage.get(feedMetadataKey, { type: 'json' }) as FeedMetadata | null;
    
    if (!feedMetadata) {
      return c.text('Feed not found', 404);
    }
    
    // Delete all emails for this feed
    for (const email of feedMetadata.emails) {
      await emailStorage.delete(email.key);
    }
    
    // Delete feed configuration and metadata
    await emailStorage.delete(`feed:${feedId}:config`);
    await emailStorage.delete(feedMetadataKey);
    
    // Remove feed from the list of all feeds
    await removeFeedFromList(emailStorage, feedId);
    
    // Redirect back to admin page
    return c.redirect('/admin');
  } catch (error) {
    console.error('Error deleting feed:', error);
    return c.text('Error deleting feed. Please try again.', 400);
  }
});

// View all emails for a feed
app.get('/feeds/:feedId/emails', async (c) => {
  // Type assertion for environment variables
  const env = c.env as unknown as Env;
  const emailStorage = env.EMAIL_STORAGE;
  const feedId = c.req.param('feedId');
  
  // Get feed configuration and metadata
  const feedConfigKey = `feed:${feedId}:config`;
  const feedMetadataKey = `feed:${feedId}:metadata`;
  
  const feedConfig = await emailStorage.get(feedConfigKey, { type: 'json' }) as FeedConfig | null;
  const feedMetadata = await emailStorage.get(feedMetadataKey, { type: 'json' }) as FeedMetadata | null;
  
  if (!feedConfig || !feedMetadata) {
    return c.text('Feed not found', 404);
  }
  
  return c.html(layout(`${feedConfig.title} - Emails`, html`
    <div class="container fade-in">
      <div class="header-with-actions">
        <div class="header-title">
          <h1>${feedConfig.title} - Emails</h1>
        </div>
        <div class="header-actions">
          <a href="/admin" class="button button-secondary button-back">Back to Dashboard</a>
        </div>
      </div>
      
      <div class="card">
        <h2>Feed Details</h2>
        <div>
          <div class="copyable">
            <span class="copyable-label">Email Address:</span>
            <div class="copyable-content">
              <span class="copyable-value" data-copy="${feedId}@${env.DOMAIN}">${feedId}@${env.DOMAIN}</span>
              <div class="copy-icon-container">
                <svg class="copy-icon copy-icon-original" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <svg class="copy-icon copy-icon-success" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 6L9 17l-5-5"></path>
                </svg>
              </div>
            </div>
          </div>
          <div class="copyable">
            <span class="copyable-label">RSS Feed:</span>
            <div class="copyable-content">
              <span class="copyable-value" data-copy="https://${env.DOMAIN}/rss/${feedId}">https://${env.DOMAIN}/rss/${feedId}</span>
              <div class="copy-icon-container">
                <svg class="copy-icon copy-icon-original" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <svg class="copy-icon copy-icon-success" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 6L9 17l-5-5"></path>
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <h2>Emails (${feedMetadata.emails.length})</h2>
      
      ${feedMetadata.emails.length > 0 ? 
        html`<ul class="email-list">
          ${feedMetadata.emails.map((email: EmailMetadata, index: number) => html`
            <li class="email-item card">
              <h3>${email.subject}</h3>
              <p>Received: ${new Date(email.receivedAt).toLocaleString()}</p>
              <div style="display: flex; gap: var(--spacing-sm); margin-top: var(--spacing-md);">
                <a href="/admin/emails/${email.key}" class="button button-small">View Content</a>
                <button onclick="confirmDeleteEmail('${email.key}', '${feedId}')" class="button button-small button-danger">Delete</button>
              </div>
            </li>
          `)}
        </ul>` : 
        html`<div class="card">
          <p>No emails received yet. Subscribe to newsletters using the email address above.</p>
        </div>`
      }
    </div>
    
    <script>
      ${raw(`
        function confirmDeleteEmail(emailKey, feedId) {
          if (confirm('Are you sure you want to delete this email? This action cannot be undone.')) {
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = '/admin/emails/' + emailKey + '/delete?feedId=' + feedId;
            document.body.appendChild(form);
            form.submit();
          }
        }
      `)}
    </script>
  `));
});

// View email content
app.get('/emails/:emailKey', async (c) => {
  // Type assertion for environment variables
  const env = c.env as unknown as Env;
  const emailStorage = env.EMAIL_STORAGE;
  const emailKey = c.req.param('emailKey');
  
  // Get email data
  const emailData = await emailStorage.get(emailKey, { type: 'json' }) as EmailData | null;
  
  if (!emailData) {
    return c.text('Email not found', 404);
  }
  
  // Extract feed ID from the key format (feed:ID:emails:timestamp)
  const keyParts = emailKey.split(':');
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
  
  return c.html(layout(`Email: ${emailData.subject}`, html`
    <div class="container fade-in">
      <div class="header-with-actions">
        <div class="header-title">
          <h1>Email Content</h1>
        </div>
        <div class="header-actions">
          <a href="/admin/feeds/${feedId}/emails" class="button button-secondary button-back">Back to Emails</a>
        </div>
      </div>
      
      <div class="card">
        <div class="email-meta">
          <div class="email-metadata-grid">
            <div class="copyable">
              <span class="copyable-label">Subject:</span>
              <div class="copyable-content">
                <span class="copyable-value" data-copy="${emailData.subject}">${emailData.subject}</span>
                <div class="copy-icon-container">
                  <svg class="copy-icon copy-icon-original" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                  <svg class="copy-icon copy-icon-success" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 6L9 17l-5-5"></path>
                  </svg>
                </div>
              </div>
            </div>
            <div class="copyable">
              <span class="copyable-label">Received:</span>
              <div class="copyable-content">
                <span class="copyable-value" data-copy="${new Date(emailData.receivedAt).toLocaleString()}">${new Date(emailData.receivedAt).toLocaleString()}</span>
                <div class="copy-icon-container">
                  <svg class="copy-icon copy-icon-original" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                  <svg class="copy-icon copy-icon-success" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 6L9 17l-5-5"></path>
                  </svg>
                </div>
              </div>
            </div>
            <div class="copyable">
              <span class="copyable-label">From:</span>
              <div class="copyable-content">
                <span class="copyable-value" data-copy="${emailData.from}">${emailData.from}</span>
                <div class="copy-icon-container">
                  <svg class="copy-icon copy-icon-original" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                  <svg class="copy-icon copy-icon-success" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 6L9 17l-5-5"></path>
                  </svg>
                </div>
              </div>
            </div>
            <div class="copyable">
              <span class="copyable-label">To:</span>
              <div class="copyable-content">
                <span class="copyable-value" data-copy="${feedId}@${env.DOMAIN}">${feedId}@${env.DOMAIN}</span>
                <div class="copy-icon-container">
                  <svg class="copy-icon copy-icon-original" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                  <svg class="copy-icon copy-icon-success" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 6L9 17l-5-5"></path>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="toggle-view">
          <button id="rendered-button" class="toggle-button active" onclick="showRendered()">Rendered View</button>
          <button id="raw-button" class="toggle-button" onclick="showRaw()">Raw HTML</button>
        </div>
        
        <div class="email-content">
          <div id="rendered-view" class="email-iframe-container">
            <iframe class="email-iframe" src="data:text/html;base64,${encodedHtmlContent}"></iframe>
          </div>
          <div id="raw-view" class="email-raw" style="display: none;">
            <pre>${emailData.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
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
      `)}
    </script>
  `));
});

// Delete email
app.post('/emails/:emailKey/delete', async (c) => {
  // Type assertion for environment variables
  const env = c.env as unknown as Env;
  const emailStorage = env.EMAIL_STORAGE;
  const emailKey = c.req.param('emailKey');
  
  try {
    // Get feedId from query parameters instead of form data
    const feedId = c.req.query('feedId');
    
    if (!feedId) {
      return c.text('Feed ID is required', 400);
    }
    
    // Delete the email
    await emailStorage.delete(emailKey);
    
    // Remove the email from the feed metadata
    const feedMetadataKey = `feed:${feedId}:metadata`;
    const feedMetadata = await emailStorage.get(feedMetadataKey, { type: 'json' }) as FeedMetadata | null;
    
    if (feedMetadata) {
      // Filter out the deleted email
      feedMetadata.emails = feedMetadata.emails.filter(email => email.key !== emailKey);
      
      // Update feed metadata
      await emailStorage.put(feedMetadataKey, JSON.stringify(feedMetadata));
    }
    
    // Redirect back to the feed emails page
    return c.redirect(`/admin/feeds/${feedId}/emails`);
  } catch (error) {
    console.error('Error deleting email:', error);
    return c.text('Error deleting email. Please try again.', 400);
  }
});

// Helper function to list all feeds
async function listAllFeeds(emailStorage: KVNamespace): Promise<FeedListItem[]> {
  try {
    const feedListKey = 'feeds:list';
    const feedList = await emailStorage.get(feedListKey, { type: 'json' }) as FeedList | null;
    return feedList?.feeds || [];
  } catch (error) {
    console.error('Error listing feeds:', error);
    return [];
  }
}

// Helper function to add a feed to the list of all feeds
async function addFeedToList(emailStorage: KVNamespace, feedId: string, title: string): Promise<void> {
  try {
    const feedListKey = 'feeds:list';
    const feedList = await emailStorage.get(feedListKey, { type: 'json' }) as FeedList | null || { feeds: [] };
    
    // Add new feed to the list
    feedList.feeds.push({
      id: feedId,
      title
    });
    
    // Store updated list
    await emailStorage.put(feedListKey, JSON.stringify(feedList));
  } catch (error) {
    console.error('Error adding feed to list:', error);
  }
}

// Helper function to update a feed in the list of all feeds
async function updateFeedInList(emailStorage: KVNamespace, feedId: string, title: string): Promise<void> {
  try {
    const feedListKey = 'feeds:list';
    const feedList = await emailStorage.get(feedListKey, { type: 'json' }) as FeedList | null || { feeds: [] };
    
    // Find and update the feed in the list
    const feedIndex = feedList.feeds.findIndex(feed => feed.id === feedId);
    if (feedIndex !== -1) {
      feedList.feeds[feedIndex].title = title;
      
      // Store updated list
      await emailStorage.put(feedListKey, JSON.stringify(feedList));
    }
  } catch (error) {
    console.error('Error updating feed in list:', error);
  }
}

// Helper function to remove a feed from the list of all feeds
async function removeFeedFromList(emailStorage: KVNamespace, feedId: string): Promise<void> {
  try {
    const feedListKey = 'feeds:list';
    const feedList = await emailStorage.get(feedListKey, { type: 'json' }) as FeedList | null || { feeds: [] };
    
    // Filter out the removed feed
    feedList.feeds = feedList.feeds.filter(feed => feed.id !== feedId);
    
    // Store updated list
    await emailStorage.put(feedListKey, JSON.stringify(feedList));
  } catch (error) {
    console.error('Error removing feed from list:', error);
  }
}

// Update feed via API (for in-place editing)
app.post('/api/feeds/:feedId/update', async (c) => {
  // Type assertion for environment variables
  const env = c.env as unknown as Env;
  const emailStorage = env.EMAIL_STORAGE;
  const feedId = c.req.param('feedId');
  
  try {
    // Parse JSON data from request
    const data = await c.req.json();
    const { title, description } = data;
    
    // Validate inputs
    const parsedData = updateFeedSchema.parse({
      title,
      description,
      language: 'en' // We're defaulting to English
    });
    
    // Get existing feed config
    const feedConfigKey = `feed:${feedId}:config`;
    const existingConfig = await emailStorage.get(feedConfigKey, { type: 'json' }) as FeedConfig | null;
    
    if (!existingConfig) {
      return c.json({ error: 'Feed not found' }, 404);
    }
    
    // Update feed configuration
    await emailStorage.put(feedConfigKey, JSON.stringify({
      ...existingConfig,
      title: parsedData.title,
      description: parsedData.description,
      updated_at: Date.now()
    }));
    
    // Update feed in the list of all feeds
    await updateFeedInList(emailStorage, feedId, parsedData.title);
    
    // Return success response
    return c.json({ success: true });
  } catch (error) {
    console.error('Error updating feed via API:', error);
    return c.json({ error: 'Error updating feed' }, 400);
  }
});

// Export the Hono app
export const handle = app; 

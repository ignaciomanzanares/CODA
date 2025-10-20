# 🚀 Deployment Guide - Render

This guide will walk you through deploying FinHealth to Render.

## Prerequisites

1. **Render Account** - Sign up at [render.com](https://render.com)
2. **Auth0 Account** - Configure at [auth0.com](https://auth0.com)
3. **GitHub Repository** - Push your code to GitHub (Render deploys from Git)

---

## Step 1: Push to GitHub

```bash
cd /home/ignaciomanzanares/Documents/Personal/WeGroup/FinHealth
git init
git add .
git commit -m "Initial commit for Render deployment"
git remote add origin https://github.com/YOUR_USERNAME/FinHealth.git
git push -u origin main
```

---

## Step 2: Configure Auth0

### Create Auth0 Application (SPA)

1. Go to Auth0 Dashboard → Applications → Create Application
2. Choose **Single Page Web Application**
3. Note down:
   - Domain (e.g., `dev-xyz.auth0.com`)
   - Client ID

### Configure Application Settings

- **Allowed Callback URLs**: `https://your-app.onrender.com`
- **Allowed Logout URLs**: `https://your-app.onrender.com`
- **Allowed Web Origins**: `https://your-app.onrender.com`

### Create Auth0 API

1. Go to Auth0 Dashboard → APIs → Create API
2. Name: `FinHealth API`
3. Identifier: `https://finhealth-api`
4. Note down the identifier (this is your `AUTH0_AUDIENCE`)

### Create Machine-to-Machine Application

1. Go to Applications → Create Application
2. Choose **Machine to Machine Applications**
3. Authorize it to access the Auth0 Management API
4. Note down:
   - Client ID (`AUTH0_M2M_CLIENT_ID`)
   - Client Secret (`AUTH0_M2M_CLIENT_SECRET`)

---

## Step 3: Deploy to Render

### Option A: Deploy via Render Dashboard (Recommended)

1. **Sign in to Render**: [dashboard.render.com](https://dashboard.render.com)

2. **Create PostgreSQL Database**:
   - Click **New +** → **PostgreSQL**
   - Name: `finhealth-db`
   - Plan: Free
   - Region: Oregon (or your preference)
   - Click **Create Database**
   - Copy the **Internal Database URL** (starts with `postgresql://`)

3. **Create Web Service**:
   - Click **New +** → **Web Service**
   - Connect your GitHub repository
   - Configure:
     - **Name**: `finhealth-app`
     - **Region**: Oregon (same as database)
     - **Branch**: `main`
     - **Runtime**: Node
     - **Build Command**: `npm install && npm run build`
     - **Start Command**: `npm start`
     - **Plan**: Free

4. **Add Environment Variables**:
   Click **Environment** and add these variables:

   ```
   NODE_ENV=production
   DATABASE_URL=[paste the Internal Database URL from step 2]
   AUTH0_ISSUER_BASE_URL=https://your-domain.auth0.com/
   AUTH0_AUDIENCE=https://finhealth-api
   AUTH0_M2M_CLIENT_ID=[your M2M client ID]
   AUTH0_M2M_CLIENT_SECRET=[your M2M client secret]
   VITE_AUTH0_DOMAIN=your-domain.auth0.com
   VITE_AUTH0_CLIENT_ID=[your SPA client ID]
   VITE_AUTH0_AUDIENCE=https://finhealth-api
   VITE_AUTH0_REDIRECT_URI=https://your-app.onrender.com
   ```

5. **Deploy**:
   - Click **Create Web Service**
   - Render will automatically build and deploy

### Option B: Deploy via render.yaml (Infrastructure as Code)

1. Ensure `render.yaml` is in your repo root (already created)

2. In Render Dashboard:
   - Click **New +** → **Blueprint**
   - Connect your repository
   - Render will detect `render.yaml` and create all services

3. After creation, manually add the Auth0 environment variables in each service's Environment tab

---

## Step 4: Initialize Database

After deployment, you need to push the database schema:

### Method 1: Using Render Shell (Recommended)

1. In Render Dashboard → Your Web Service → **Shell** tab
2. Run:
   ```bash
   npm run db:push
   npm run db:seed
   ```

### Method 2: Using Local Connection

1. Get the **External Database URL** from your PostgreSQL service in Render
2. Locally, set:
   ```bash
   export DATABASE_URL="postgresql://[external-url-from-render]"
   npm run db:push
   npm run db:seed
   ```

---

## Step 5: Update Auth0 with Live URL

Once deployed, Render gives you a URL like `https://finhealth-app.onrender.com`

1. Go back to Auth0 Application Settings
2. Update URLs to use your Render URL:
   - Allowed Callback URLs: `https://finhealth-app.onrender.com`
   - Allowed Logout URLs: `https://finhealth-app.onrender.com`
   - Allowed Web Origins: `https://finhealth-app.onrender.com`

3. Update `VITE_AUTH0_REDIRECT_URI` environment variable in Render:
   - Value: `https://finhealth-app.onrender.com`
   - Click **Save Changes** (this will redeploy)

---

## Step 6: Test Your Deployment

1. Visit your Render URL: `https://finhealth-app.onrender.com`
2. Try signing up/logging in with Auth0
3. Verify all features work correctly

---

## Troubleshooting

### Build Fails

- Check build logs in Render Dashboard
- Ensure all dependencies are in `package.json`
- Verify Node version compatibility

### Database Connection Issues

- Ensure `DATABASE_URL` is set correctly
- Check that you're using the **Internal Database URL** (not External)
- Verify `db:push` was run successfully

### Auth0 Errors

- Verify all Auth0 environment variables are correct
- Check Auth0 Application URLs match your Render URL
- Ensure Auth0 API audience matches `AUTH0_AUDIENCE`

### App Doesn't Load

- Check that build completed successfully
- Verify `dist/public` directory was created
- Check Render logs for runtime errors

---

## Monitoring & Logs

- **View Logs**: Render Dashboard → Your Service → **Logs** tab
- **Metrics**: Render Dashboard → Your Service → **Metrics** tab
- **Events**: Render Dashboard → Your Service → **Events** tab

---

## Updating Your Deployment

Render automatically deploys when you push to your main branch:

```bash
git add .
git commit -m "Update feature"
git push origin main
```

Render will detect the push and redeploy automatically.

---

## Custom Domain (Optional)

1. In Render Dashboard → Your Web Service → **Settings**
2. Scroll to **Custom Domain**
3. Add your domain (e.g., `finhealth.example.com`)
4. Update DNS records as instructed
5. Update Auth0 URLs to use your custom domain

---

## Scaling & Upgrades

The free tier includes:
- **Web Service**: 750 hours/month (sleeps after 15 min inactivity)
- **PostgreSQL**: 1GB storage, expires after 90 days

To upgrade:
- Go to your service → **Settings** → **Plan**
- Choose a paid plan for:
  - Always-on service (no sleeping)
  - More resources
  - Persistent database

---

## Support

- **Render Docs**: [render.com/docs](https://render.com/docs)
- **Render Community**: [community.render.com](https://community.render.com)
- **Auth0 Docs**: [auth0.com/docs](https://auth0.com/docs)

---

**Made with ❤️ by WeGroup 🇨🇱**

# Deployment Guide: cron-job.org Migration

This guide details the exact steps required to successfully migrate your backup scheduling to [cron-job.org](https://console.cron-job.org/) and deploy your Next.js Option Chain dashboard.

## Overview
Vercel's Free Plan does not support automated Cron Jobs. To maintain your 5-minute automated backups and daily cleanups without upgrading to a paid tier, we will use **cron-job.org** to remotely trigger your Vercel API endpoints.

## Step 1: Configure Secret in Vercel
Your Vercel application validates requests by checking the `Authorization` header. We need to ensure the secret is securely configured in your Vercel deployment.

1. Go to your **Vercel Project Settings** > **Environment Variables**.
2. Create a new variable named `CRON_SECRET`.
3. Give it a long, random secure value (e.g. `your-super-secret-cron-key-12345`).
4. Save and ensure it applies to the `Production` environment.
5. **Redeploy** your application so the new environment variable takes effect.

## Step 2: Create a Backup Cron Job on cron-job.org
This job will hit your `/api/cron/backup` endpoint every 5 minutes.

1. Log in to [cron-job.org](https://console.cron-job.org/).
2. Click **CREATE CRONJOB**.
3. **Title**: `NSE Option Chain Backup`
4. **URL**: `https://nse.rtcmc.fun/api/cron/backup`
5. **Execution schedule**: Select **Every 5 minutes**. (You can also limit it to certain days/hours using the Advanced tab if you want to match the 9:15 AM - 3:30 PM IST market hours, though the API will naturally skip backups when the market is closed anyway).
6. Enable the **Advanced settings** section.
7. Scroll down to **HTTP Headers** and click **Add Header**.
    - **Header**: `Authorization`
    - **Value**: `Bearer YOUR_CRON_SECRET` (Replace `YOUR_CRON_SECRET` with the exact value from Step 1).
8. Click **CREATE**.

## Step 3: Create a Cleanup Cron Job on cron-job.org
This job will hit your `/api/cron/cleanup` endpoint once a day to prune old database records.

1. Click **CREATE CRONJOB** again.
2. **Title**: `NSE Database Cleanup`
3. **URL**: `https://nse.rtcmc.fun/api/cron/cleanup`
4. **Execution schedule**: Select **Every day** at a specific time (e.g. `00:00`).
5. Enable the **Advanced settings** section.
6. Scroll down to **HTTP Headers** and click **Add Header**.
    - **Header**: `Authorization`
    - **Value**: `Bearer YOUR_CRON_SECRET` (Replace `YOUR_CRON_SECRET` with the exact value from Step 1).
7. Click **CREATE**.

## Step 4: Push to GitHub
Since we made changes to your local code, you must push them to GitHub to trigger a new Vercel deployment:
```bash
git add .
git commit -m "fix: resolve timezone bug and switch to cron-job.org"
git push origin main
```

## Step 5: Verify Execution
You can test the automation immediately without waiting for the schedule:

1. In the cron-job.org dashboard, locate your `NSE Option Chain Backup` job.
2. Click the **Test** or **Run now** button (often a play icon).
3. Check the execution history/logs on cron-job.org. It should report a `200 OK` status and show the successful JSON payload.

## Step 5: Verify Health Monitoring
Navigate to your deployed health endpoint: `https://nse.rtcmc.fun/api/health`

You should see:
```json
{
  "status": "ok",
  "database": true,
  "marketOpen": false,
  "lastBackupAgeMinutes": 0,
  "snapshotAccessible": true,
  "timestamp": "2026-06-08T12:00:00.000Z",
  "scheduler": "github-actions"
}
```
*(Note: You can update the `"scheduler"` string in `app/api/health/route.ts` from `"github-actions"` to `"cron-job.org"` if you prefer).*

## Troubleshooting
- **Fails with 401 Unauthorized**: The `Authorization` header in cron-job.org does not match `Bearer [CRON_SECRET]` in Vercel. Double-check the token and remember the `Bearer ` prefix.
- **Fails with 422 Stale Data**: This is an intended safeguard! It means the NSE is returning old data (e.g. market is closed or NSE is lagging). The API prevents polluting your database with stale data.

# Google Drive backup setup

## Required Google Cloud setup

1. Enable Google Drive API in the Google Cloud project used by Stockbook.
2. Create a Google OAuth web client.
3. Add this redirect URI in the OAuth client:

   https://asia-east1-jackstock-ed2d2.cloudfunctions.net/driveOAuthCallback

4. Configure the OAuth consent screen for the Google account that owns the Stockbook backups.

## Required Firebase Secrets

Set the four secrets before deploying Functions:

```powershell
firebase functions:secrets:set DRIVE_CLIENT_ID
firebase functions:secrets:set DRIVE_CLIENT_SECRET
firebase functions:secrets:set DRIVE_OAUTH_REDIRECT_URI
firebase functions:secrets:set BACKUP_ENCRYPTION_KEY
```

Use the callback URL above for `DRIVE_OAUTH_REDIRECT_URI`. Generate the encryption key with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Deploy and verify

```powershell
npm install
firebase deploy --only functions,hosting,firestore:rules --project jackstock-ed2d2
```

After deployment, sign in to Stockbook, open **Settings > Sync and Backup**, choose **Connect Google Drive**, then run one manual backup before relying on the 03:00 Asia/Taipei schedule.

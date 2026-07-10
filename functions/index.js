const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { google } = require("googleapis");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const { Readable } = require("node:stream");

initializeApp();

const db = getFirestore();
const REGION = "asia-east1";
const BACKUP_FORMAT = "stockbook-backup-v2";
const DRIVE_CLIENT_ID = defineSecret("DRIVE_CLIENT_ID");
const DRIVE_CLIENT_SECRET = defineSecret("DRIVE_CLIENT_SECRET");
const DRIVE_OAUTH_REDIRECT_URI = defineSecret("DRIVE_OAUTH_REDIRECT_URI");
const BACKUP_ENCRYPTION_KEY = defineSecret("BACKUP_ENCRYPTION_KEY");
const DRIVE_SECRETS = [DRIVE_CLIENT_ID, DRIVE_CLIENT_SECRET, DRIVE_OAUTH_REDIRECT_URI, BACKUP_ENCRYPTION_KEY];

function requireAuth(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "請先登入 Firebase。");
  return request.auth.uid;
}

function namespaceFor(value) {
  const namespace = String(value || "").trim().replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!namespace) throw new HttpsError("invalid-argument", "缺少有效的帳本 namespace。");
  return namespace;
}

function connectionRef(uid) {
  return db.collection("backupConnections").doc(uid);
}

function encryptionKey() {
  const key = Buffer.from(BACKUP_ENCRYPTION_KEY.value(), "base64");
  if (key.length !== 32) throw new Error("BACKUP_ENCRYPTION_KEY 必須是 32 bytes 的 Base64 值。");
  return key;
}

function encryptToken(token) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64")
  };
}

function decryptToken(payload) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, "base64")), decipher.final()]).toString("utf8");
}

function oauthClient() {
  return new google.auth.OAuth2(
    DRIVE_CLIENT_ID.value(),
    DRIVE_CLIENT_SECRET.value(),
    DRIVE_OAUTH_REDIRECT_URI.value()
  );
}

function taipeiDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: values.year, month: values.month, day: values.day, iso: values.year + "-" + values.month + "-" + values.day };
}

function checksum(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

async function readLedger(namespace, uid) {
  const ledger = await db.collection("stockLedgers").doc(namespace).get();
  if (!ledger.exists) throw new HttpsError("not-found", "找不到 Firebase 帳本。");
  const metadata = ledger.data();
  if (metadata.ownerUid !== uid) throw new HttpsError("permission-denied", "帳本不屬於目前使用者。");
  if (metadata.state) return { state: metadata.state, updatedAt: metadata.updatedAt || null, chunkCount: 0 };

  const chunkCount = Number(metadata.chunkCount || 0);
  if (!chunkCount) throw new Error("帳本分塊資料無效。");
  const chunks = await Promise.all(Array.from({ length: chunkCount }, (_, index) =>
    db.collection("stockLedgers").doc(namespace).collection("chunks").doc("chunk_" + index).get()
  ));
  const payload = chunks.map((chunk, index) => {
    if (!chunk.exists) throw new Error("缺少帳本資料區塊 " + index);
    return chunk.data().data || "";
  }).join("");
  const state = JSON.parse(zlib.gunzipSync(Buffer.from(payload, "base64")).toString("utf8"));
  return { state, updatedAt: metadata.updatedAt || null, chunkCount };
}

async function findOrCreateFolder(drive, name, parentId) {
  const query = "mimeType = 'application/vnd.google-apps.folder' and trashed = false and name = '" +
    name.replace(/'/g, "\\'") + "' and '" + parentId + "' in parents";
  const existing = await drive.files.list({ q: query, fields: "files(id,name)", pageSize: 1 });
  if (existing.data.files && existing.data.files.length) return existing.data.files[0].id;
  const created = await drive.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id"
  });
  return created.data.id;
}


function isLastTaipeiDay(parts) {
  return Number(parts.day) === new Date(Date.UTC(Number(parts.year), Number(parts.month), 0)).getUTCDate();
}

async function cleanBackupFolder(drive, folderId, maxAgeDays) {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const listed = await drive.files.list({
    q: "'" + folderId + "' in parents and trashed = false",
    fields: "files(id,createdTime)",
    pageSize: 1000
  });
  await Promise.all((listed.data.files || [])
    .filter((file) => file.createdTime && new Date(file.createdTime).getTime() < cutoff)
    .map((file) => drive.files.delete({ fileId: file.id })));
}

async function driveForConnection(connection) {
  const client = oauthClient();
  client.setCredentials({ refresh_token: decryptToken(connection.token) });
  return google.drive({ version: "v3", auth: client });
}

async function uploadBackup(connection, uid, trigger) {
  const ledger = await readLedger(connection.namespace, uid);
  const stateJson = JSON.stringify(ledger.state);
  const now = taipeiDateParts();
  const envelope = {
    format: BACKUP_FORMAT,
    schemaVersion: 2,
    createdAt: new Date().toISOString(),
    source: { provider: "FIRESTORE", namespace: connection.namespace, ledgerUpdatedAt: ledger.updatedAt || null, chunkCount: ledger.chunkCount },
    checksum: { algorithm: "SHA-256", value: checksum(stateJson) },
    state: ledger.state
  };
  const body = JSON.stringify(envelope, null, 2);
  const drive = await driveForConnection(connection);
  const rootId = await findOrCreateFolder(drive, "Stockbook Backups", "root");
  const namespaceId = await findOrCreateFolder(drive, connection.namespace, rootId);
  const dailyId = await findOrCreateFolder(drive, "Daily", namespaceId);
  const fileName = "stockbook-" + connection.namespace + "-" + now.iso + ".json";
  const query = "'" + dailyId + "' in parents and trashed = false and name = '" + fileName + "'";
  const found = await drive.files.list({ q: query, fields: "files(id)", pageSize: 1 });
  const media = { mimeType: "application/json", body: Readable.from([body]) };
  const appProperties = { stockbookNamespace: connection.namespace, stockbookType: "daily", stockbookDate: now.iso };
  let file;
  if (found.data.files && found.data.files.length) {
    file = await drive.files.update({ fileId: found.data.files[0].id, media, requestBody: { appProperties }, fields: "id,name,webViewLink,size" });
  } else {
    file = await drive.files.create({ requestBody: { name: fileName, parents: [dailyId], appProperties }, media, fields: "id,name,webViewLink,size" });
  }


  const monthlyId = await findOrCreateFolder(drive, "Monthly", namespaceId);
  await cleanBackupFolder(drive, dailyId, Number(connection.retentionDays || 90));
  if (isLastTaipeiDay(now)) {
    const monthlyName = "stockbook-" + connection.namespace + "-" + now.year + "-" + now.month + ".json";
    const monthlyQuery = "'" + monthlyId + "' in parents and trashed = false and name = '" + monthlyName + "'";
    const monthlyFound = await drive.files.list({ q: monthlyQuery, fields: "files(id)", pageSize: 1 });
    const monthlyMedia = { mimeType: "application/json", body: Readable.from([body]) };
    if (monthlyFound.data.files && monthlyFound.data.files.length) {
      await drive.files.update({ fileId: monthlyFound.data.files[0].id, media: monthlyMedia, fields: "id" });
    } else {
      await drive.files.create({
        requestBody: { name: monthlyName, parents: [monthlyId], appProperties: { stockbookNamespace: connection.namespace, stockbookType: "monthly", stockbookDate: now.year + "-" + now.month } },
        media: monthlyMedia,
        fields: "id"
      });
    }
    await cleanBackupFolder(drive, monthlyId, Number(connection.monthlyRetention || 12) * 31);
  }

  const run = {
    trigger,
    status: "SUCCESS",
    fileId: file.data.id,
    fileName,
    checksum: envelope.checksum.value,
    size: Buffer.byteLength(body, "utf8"),
    createdAt: FieldValue.serverTimestamp()
  };
  await connectionRef(uid).set({
    enabled: connection.enabled !== false,
    namespace: connection.namespace,
    provider: "GOOGLE_DRIVE",
    folderId: namespaceId,
    lastBackupAt: FieldValue.serverTimestamp(),
    lastStatus: "SUCCESS",
    lastErrorCode: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  await connectionRef(uid).collection("runs").add(run);
  return { fileName, checksum: envelope.checksum.value, size: run.size, webViewLink: file.data.webViewLink || "" };
}

async function recordFailure(uid, trigger, error) {
  const code = String(error.code || "backup-failed");
  logger.error("Drive backup failed", { uid, trigger, code, message: error.message });
  await connectionRef(uid).set({ lastStatus: "FAILED", lastErrorCode: code, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await connectionRef(uid).collection("runs").add({ trigger, status: "FAILED", errorCode: code, createdAt: FieldValue.serverTimestamp() });
}

function publicConnection(data) {
  if (!data) return { connected: false, enabled: false, runs: [] };
  return {
    connected: Boolean(data.token),
    enabled: Boolean(data.enabled),
    namespace: data.namespace || "",
    connectedEmail: data.connectedEmail || "",
    folderId: data.folderId || "",
    lastStatus: data.lastStatus || "IDLE",
    lastBackupAt: data.lastBackupAt ? data.lastBackupAt.toDate().toISOString() : "",
    retentionDays: Number(data.retentionDays || 90),
    monthlyRetention: Number(data.monthlyRetention || 12)
  };
}

exports.startDriveAuthorization = onCall({ region: REGION, secrets: DRIVE_SECRETS }, async (request) => {
  const uid = requireAuth(request);
  const namespace = namespaceFor(request.data && request.data.namespace);
  const state = crypto.randomBytes(32).toString("hex");
  await db.collection("driveOAuthStates").doc(state).set({
    uid,
    namespace,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    createdAt: FieldValue.serverTimestamp()
  });
  const client = oauthClient();
  return {
    url: client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: ["https://www.googleapis.com/auth/drive.file"],
      state
    })
  };
});

exports.driveOAuthCallback = onRequest({ region: REGION, secrets: DRIVE_SECRETS }, async (request, response) => {
  try {
    const state = String(request.query.state || "");
    const code = String(request.query.code || "");
    const stateRef = db.collection("driveOAuthStates").doc(state);
    const stateDoc = await stateRef.get();
    if (!stateDoc.exists || !code) throw new Error("授權連結無效或已過期。");
    const stateData = stateDoc.data();
    if (stateData.expiresAt.toDate().getTime() < Date.now()) throw new Error("授權連結已過期。");

    const client = oauthClient();
    const tokenResult = await client.getToken(code);
    const refreshToken = tokenResult.tokens.refresh_token;
    if (!refreshToken) throw new Error("Google 沒有提供離線授權，請重新連結並允許 Drive 權限。");
    client.setCredentials(tokenResult.tokens);
    const profile = await google.oauth2({ version: "v2", auth: client }).userinfo.get();
    await connectionRef(stateData.uid).set({
      namespace: stateData.namespace,
      provider: "GOOGLE_DRIVE",
      token: encryptToken(refreshToken),
      connectedEmail: profile.data.email || "",
      enabled: true,
      retentionDays: 90,
      monthlyRetention: 12,
      lastStatus: "CONNECTED",
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    await stateRef.delete();
    response.status(200).send("Google Drive 已連結。可以關閉這個視窗並回到 Stockbook。");
  } catch (error) {
    logger.error("Drive OAuth callback failed", error);
    response.status(400).send("Google Drive 連結失敗：" + error.message);
  }
});

exports.getBackupStatus = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const connection = await connectionRef(uid).get();
  const runs = await connectionRef(uid).collection("runs").orderBy("createdAt", "desc").limit(10).get();
  return {
    ...publicConnection(connection.exists ? connection.data() : null),
    runs: runs.docs.map((doc) => ({ id: doc.id, ...doc.data(), createdAt: doc.data().createdAt ? doc.data().createdAt.toDate().toISOString() : "" }))
  };
});

exports.runBackupNow = onCall({ region: REGION, secrets: DRIVE_SECRETS, timeoutSeconds: 540 }, async (request) => {
  const uid = requireAuth(request);
  const connectionDoc = await connectionRef(uid).get();
  if (!connectionDoc.exists || !connectionDoc.data().token) throw new HttpsError("failed-precondition", "請先連結 Google Drive。");
  try {
    return await uploadBackup(connectionDoc.data(), uid, "MANUAL");
  } catch (error) {
    await recordFailure(uid, "MANUAL", error);
    throw new HttpsError("internal", "備份失敗：" + error.message);
  }
});

exports.disconnectDrive = onCall({ region: REGION, secrets: DRIVE_SECRETS }, async (request) => {
  const uid = requireAuth(request);
  const connectionDoc = await connectionRef(uid).get();
  if (connectionDoc.exists && connectionDoc.data().token) {
    try {
      const client = oauthClient();
      await client.revokeToken(decryptToken(connectionDoc.data().token));
    } catch (error) {
      logger.warn("Drive token revoke failed", error);
    }
  }
  await connectionRef(uid).delete();
  return { disconnected: true };
});

exports.dailyDriveBackup = onSchedule({
  region: REGION,
  schedule: "0 3 * * *",
  timeZone: "Asia/Taipei",
  secrets: DRIVE_SECRETS,
  timeoutSeconds: 540
}, async () => {
  const connections = await db.collection("backupConnections").where("enabled", "==", true).get();
  await Promise.all(connections.docs.map(async (doc) => {
    try {
      await uploadBackup(doc.data(), doc.id, "SCHEDULED");
    } catch (error) {
      await recordFailure(doc.id, "SCHEDULED", error);
    }
  }));
});

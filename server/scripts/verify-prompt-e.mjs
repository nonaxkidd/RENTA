import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const BASE = "http://127.0.0.1:5000/api/v1";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRIVATE_DIR = path.join(ROOT, "storage", "private-docs");
const LOG_DIR = "C:/Users/airho/.cursor/projects/c-Users-airho-Codes-RENTA/terminals";
const stamp = Date.now().toString().slice(-7);
const moveIn = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

const png = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00,
]);
const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\nRENTA-PDF-MARKER");
const exe = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(48, 0x90)]);

function hex(buf, n = 40) {
  return Buffer.from(buf).subarray(0, n).toString("hex");
}

function say(title, value) {
  console.log(`\n## ${title}`);
  if (typeof value === "string") console.log(value);
  else console.log(JSON.stringify(value, null, 2));
}

async function api(method, route, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + route, { method, headers, body: payload });
  const buf = Buffer.from(await res.arrayBuffer());
  let json = null;
  try { json = JSON.parse(buf.toString("utf8")); } catch { json = null; }
  return { status: res.status, json, buf };
}

function brief(result) {
  return { status: result.status, body: result.json ?? result.buf.subarray(0, 80).toString("hex") };
}

async function login(email, password) {
  const result = await api("POST", "/auth/login", { body: { email, password } });
  return { status: result.status, body: result.json, token: result.json?.token, user: result.json?.user };
}

async function createAccount(superToken, account) {
  const created = await api("POST", "/admin/users", {
    token: superToken,
    body: { ...account, adminPassword: "SuperAdmin12345!" },
  });
  const users = await api("GET", "/admin/users", { token: superToken });
  const user = users.json?.users?.find((item) => item.email === account.email);
  return { created: brief(created), user };
}

function snapshotFiles() {
  if (!fs.existsSync(PRIVATE_DIR)) return new Set();
  return new Set(fs.readdirSync(PRIVATE_DIR));
}

function newestFiles(before) {
  if (!fs.existsSync(PRIVATE_DIR)) return [];
  return fs.readdirSync(PRIVATE_DIR)
    .filter((name) => !before.has(name))
    .map((name) => {
      const full = path.join(PRIVATE_DIR, name);
      const bytes = fs.readFileSync(full);
      return { name, size: bytes.length, hex40: hex(bytes) };
    });
}

function otpFromLogs(email) {
  if (!fs.existsSync(LOG_DIR)) return null;
  const needle = `OTP for ${email}:`;
  let found = null;
  for (const file of fs.readdirSync(LOG_DIR)) {
    if (!file.endsWith(".txt")) continue;
    const text = fs.readFileSync(path.join(LOG_DIR, file), "utf8");
    const index = text.lastIndexOf(needle);
    if (index >= 0) found = text.slice(index + needle.length, index + needle.length + 8).trim();
  }
  return found && /^\d{6}$/.test(found) ? found : null;
}

async function waitForOtp(email) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = otpFromLogs(email);
    if (code) return code;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
}

async function reserveApprove(tenantToken, ownerToken, listingId) {
  const reserved = await api("POST", `/reservations/listings/${listingId}`, {
    token: tenantToken,
    body: { intendedMoveIn: moveIn, occupants: 1, expectedLengthOfStay: "6 months" },
  });
  const reservationId = reserved.json?.reservation?._id;
  const approved = reservationId
    ? await api("PATCH", `/reservations/${reservationId}/decision`, {
      token: ownerToken,
      body: { decision: "approve" },
    })
    : null;
  return { reserved: brief(reserved), approved: approved ? brief(approved) : null, reservationId };
}

async function makeListing(ownerToken, title, price) {
  return api("POST", "/listings", {
    token: ownerToken,
    body: {
      title,
      type: "Private room",
      barangay: "Ilaya",
      price,
      description: "Prompt E verification listing.",
      capacity: 2,
      ownerName: "Maria Santos",
      imageUrl: "https://example.com/renta-photo.jpg",
      lat: 13.36,
      lng: 121.18,
    },
  });
}

function listingVisible(list, id) {
  return Boolean(list.json?.listings?.some((item) => String(item._id) === String(id)));
}

function runServer(env, label) {
  return new Promise((resolve) => {
    const child = spawn("npx", ["tsx", "src/server.ts"], {
      cwd: ROOT,
      env: { ...process.env, PORT: "5099", ...env },
      shell: true,
      windowsHide: true,
    });
    let out = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({ label, timedOut: true, out: out.slice(0, 800) });
    }, 8000);
    child.stdout.on("data", (chunk) => { out += chunk.toString(); });
    child.stderr.on("data", (chunk) => { out += chunk.toString(); });
    child.on("exit", (code) => {
      clearTimeout(timer);
      const lines = out.split(/\r?\n/).filter((line) => line.startsWith("Refusing to start") || line.includes("RENTA server running"));
      resolve({ label, exitCode: code, lines });
    });
  });
}

const superLogin = await login("superadmin@renta.local", "SuperAdmin12345!");
const adminLogin = await login("admin@renta.local", "Admin12345!");
const ownerLogin = await login("owner@gmail.com", "Owner12345!");
const tenantLogin = await login("tenant@gmail.com", "Tenant12345!");
say("logins", {
  superadmin: superLogin.status,
  admin: adminLogin.status,
  owner: ownerLogin.status,
  tenant: tenantLogin.status,
});

if (!superLogin.token || !adminLogin.token || !ownerLogin.token || !tenantLogin.token) {
  say("stopped", "A demo login failed, so the rest of the checks were not run.");
  process.exit(1);
}

const pass = "Verify12345!";

say("A exe renamed to png", brief(await (async () => {
  const owner = await createAccount(superLogin.token, {
    firstName: "Id",
    lastName: "Owner",
    email: `renta.e.id.${stamp}@gmail.com`,
    phone: "09170001001",
    role: "owner",
    password: pass,
  });
  const other = await createAccount(superLogin.token, {
    firstName: "Other",
    lastName: "Owner",
    email: `renta.e.other.${stamp}@gmail.com`,
    phone: "09170001002",
    role: "owner",
    password: pass,
  });
  const ownerSession = await login(owner.user.email, pass);
  const otherSession = await login(other.user.email, pass);
  const bad = new FormData();
  bad.append("idDocument", new File([exe], "evil.png", { type: "image/png" }));
  bad.append("authorityDocument", new File([pdf], "proof.pdf", { type: "application/pdf" }));
  const rejected = await api("POST", "/verification", { token: ownerSession.token, form: bad });

  const before = snapshotFiles();
  const good = new FormData();
  good.append("idDocument", new File([png], "id.png", { type: "image/png" }));
  good.append("authorityDocument", new File([pdf], "proof.pdf", { type: "application/pdf" }));
  const uploaded = await api("POST", "/verification", { token: ownerSession.token, form: good });
  const stored = newestFiles(before);
  const adminPng = await api("GET", `/admin/owners/${owner.user._id}/documents/id`, { token: adminLogin.token });
  const adminPdf = await api("GET", `/admin/owners/${owner.user._id}/documents/authority`, { token: adminLogin.token });
  const tenantAdmin = await api("GET", `/admin/owners/${owner.user._id}/documents/id`, { token: tenantLogin.token });
  const otherAdmin = await api("GET", `/admin/owners/${owner.user._id}/documents/id`, { token: otherSession.token });
  const tenantOwn = await api("GET", "/verification/files/me/id", { token: tenantLogin.token });
  return {
    status: 200,
    json: {
      createdOwner: owner.created,
      exeStatus: rejected.status,
      exeBody: rejected.json,
      uploadStatus: uploaded.status,
      storedFiles: stored,
      plaintextPng40: hex(png),
      plaintextPdf40: hex(pdf),
      adminPngStatus: adminPng.status,
      adminPng40: hex(adminPng.buf),
      adminPngMatches: adminPng.buf.subarray(0, png.length).equals(png),
      adminPdfStatus: adminPdf.status,
      adminPdf40: hex(adminPdf.buf),
      adminPdfMatches: adminPdf.buf.subarray(0, pdf.length).equals(pdf),
      tenantOnAdminEndpoint: brief(tenantAdmin),
      unrelatedOwnerOnAdminEndpoint: brief(otherAdmin),
      tenantOnOwnerEndpoint: brief(tenantOwn),
    },
  };
})()));

say("B payments", brief(await (async () => {
  const second = await createAccount(superLogin.token, {
    firstName: "Second",
    lastName: "Tenant",
    email: `renta.e.tenant2.${stamp}@gmail.com`,
    phone: "09170001003",
    role: "tenant",
    password: pass,
  });
  const secondLogin = await login(second.user.email, pass);
  const payListing = await makeListing(ownerLogin.token, `E pay ${stamp}`, 3200);
  const cancelListing = await makeListing(ownerLogin.token, `E cancel ${stamp}`, 2800);
  const refundListing = await makeListing(ownerLogin.token, `E refund ${stamp}`, 3600);
  const payId = payListing.json?.listing?._id;
  const cancelId = cancelListing.json?.listing?._id;
  const refundId = refundListing.json?.listing?._id;

  const paidFlow = await reserveApprove(tenantLogin.token, ownerLogin.token, payId);
  const paidCheckout = await api("POST", "/payments/checkout", {
    token: tenantLogin.token,
    body: { reservationId: paidFlow.reservationId },
  });
  const paidPaymentId = paidCheckout.json?.checkoutUrl?.split("/").pop();
  const beforePay = await api("GET", `/listings/${payId}`);
  const paid = await api("POST", `/payments/mock/${paidPaymentId}/pay`, { token: tenantLogin.token });
  const afterPay = await api("GET", `/listings/${payId}`);
  const publicAfterPay = await api("GET", "/listings");

  const cancelFlow = await reserveApprove(tenantLogin.token, ownerLogin.token, cancelId);
  const cancelCheckout = await api("POST", "/payments/checkout", {
    token: tenantLogin.token,
    body: { reservationId: cancelFlow.reservationId },
  });
  const cancelPaymentId = cancelCheckout.json?.checkoutUrl?.split("/").pop();
  const cancelled = await api("POST", `/payments/mock/${cancelPaymentId}/cancel`, { token: tenantLogin.token });
  const afterCancel = await api("GET", `/listings/${cancelId}`);
  const publicAfterCancel = await api("GET", "/listings");

  const first = await reserveApprove(tenantLogin.token, ownerLogin.token, refundId);
  const secondReserve = await reserveApprove(secondLogin.token, ownerLogin.token, refundId);
  const firstCheckout = await api("POST", "/payments/checkout", {
    token: tenantLogin.token,
    body: { reservationId: first.reservationId },
  });
  const firstPaymentId = firstCheckout.json?.checkoutUrl?.split("/").pop();
  const dropped = await api("PATCH", `/reservations/${first.reservationId}/cancel`, { token: tenantLogin.token });
  const secondApproved = await api("PATCH", `/reservations/${secondReserve.reservationId}/decision`, {
    token: ownerLogin.token,
    body: { decision: "approve" },
  });
  const secondCheckout = await api("POST", "/payments/checkout", {
    token: secondLogin.token,
    body: { reservationId: secondReserve.reservationId },
  });
  const secondPaymentId = secondCheckout.json?.checkoutUrl?.split("/").pop();
  const secondPaid = await api("POST", `/payments/mock/${secondPaymentId}/pay`, { token: secondLogin.token });
  const latePaid = await api("POST", `/payments/mock/${firstPaymentId}/pay`, { token: tenantLogin.token });
  const needs = await api("GET", "/admin/payments?status=needs_refund", { token: adminLogin.token });
  const lateRow = needs.json?.payments?.find((item) => String(item._id) === String(firstPaymentId));
  const refunded = await api("PATCH", `/admin/payments/${firstPaymentId}/refund`, { token: adminLogin.token, body: {} });
  const afterRefund = await api("GET", "/admin/payments?status=refunded", { token: adminLogin.token });
  const refundedRow = afterRefund.json?.payments?.find((item) => String(item._id) === String(firstPaymentId));

  return {
    status: 200,
    json: {
      prices: { pay: 3200, cancel: 2800, refund: 3600 },
      payCheckoutAmount: paidCheckout.json?.amount,
      cancelCheckoutAmount: cancelCheckout.json?.amount,
      payFlow: paidFlow,
      beforePayAvailable: beforePay.json?.listing?.available,
      payResult: brief(paid),
      afterPayAvailable: afterPay.json?.listing?.available,
      payListingInPublicList: listingVisible(publicAfterPay, payId),
      cancelFlow,
      cancelResult: brief(cancelled),
      afterCancelAvailable: afterCancel.json?.listing?.available,
      cancelListingInPublicList: listingVisible(publicAfterCancel, cancelId),
      firstReserve: first.reserved,
      secondReserve: secondReserve.reserved,
      droppedFirst: brief(dropped),
      secondApproved: brief(secondApproved),
      secondCheckoutAmount: secondCheckout.json?.amount,
      secondPay: brief(secondPaid),
      latePay: brief(latePaid),
      latePaymentStatus: lateRow?.status ?? null,
      markRefunded: brief(refunded),
      refundedStatus: refundedRow?.status ?? null,
    },
  };
})()));

say("C old token", brief(await (async () => {
  const account = await createAccount(superLogin.token, {
    firstName: "Token",
    lastName: "Owner",
    email: `renta.e.token.${stamp}@gmail.com`,
    phone: "09170001004",
    role: "owner",
    password: pass,
  });
  const session = await login(account.user.email, pass);
  const before = await api("GET", "/listings/mine", { token: session.token });
  const deactivated = await api("PATCH", `/admin/users/${account.user._id}/status`, {
    token: adminLogin.token,
    body: { action: "deactivate", note: "Prompt E deactivate check" },
  });
  const afterDeactivate = await api("GET", "/listings/mine", { token: session.token });
  const reactivated = await api("PATCH", `/admin/users/${account.user._id}/status`, {
    token: adminLogin.token,
    body: { action: "reactivate" },
  });
  const archived = await api("PATCH", `/admin/users/${account.user._id}/status`, {
    token: adminLogin.token,
    body: { action: "archive", note: "Prompt E archive check" },
  });
  const afterArchive = await api("GET", "/listings/mine", { token: session.token });
  await api("PATCH", `/admin/users/${account.user._id}/status`, {
    token: superLogin.token,
    body: { action: "restore" },
  });
  return {
    status: 200,
    json: {
      before: before.status,
      deactivate: brief(deactivated),
      afterDeactivate: afterDeactivate.status,
      afterDeactivateBody: afterDeactivate.json,
      reactivate: brief(reactivated),
      archive: brief(archived),
      afterArchive: afterArchive.status,
      afterArchiveBody: afterArchive.json,
    },
  };
})()));

say("D admin guards", brief(await (async () => {
  const users = await api("GET", "/admin/users", { token: adminLogin.token });
  const superadmin = users.json.users.find((item) => item.email === "superadmin@renta.local");
  const admin = users.json.users.find((item) => item.email === "admin@renta.local");
  const extra = await createAccount(superLogin.token, {
    firstName: "Extra",
    lastName: "Admin",
    email: `renta.e.admin.${stamp}@renta.local`,
    phone: "09170001005",
    role: "admin",
    password: pass,
  });
  const reset = await api("PATCH", `/admin/users/${superadmin._id}/password`, {
    token: adminLogin.token,
    body: { newPassword: "NoAccess12345!", adminPassword: "Admin12345!" },
  });
  const emailChange = await api("PATCH", `/admin/users/${superadmin._id}`, {
    token: adminLogin.token,
    body: {
      firstName: superadmin.firstName,
      lastName: superadmin.lastName,
      email: `changed.${stamp}@renta.local`,
      phone: "09170001009",
    },
  });
  const deactivateAdmin = await api("PATCH", `/admin/users/${extra.user._id}/status`, {
    token: adminLogin.token,
    body: { action: "deactivate", note: "Prompt E should block this" },
  });
  const deactivateSelf = await api("PATCH", `/admin/users/${admin._id}/status`, {
    token: adminLogin.token,
    body: { action: "deactivate", note: "Prompt E should block this" },
  });
  const after = await api("GET", "/admin/users", { token: superLogin.token });
  const superAfter = after.json.users.find((item) => item._id === superadmin._id);
  const extraAfter = after.json.users.find((item) => item._id === extra.user._id);
  const selfAfter = after.json.users.find((item) => item._id === admin._id);
  return {
    status: 200,
    json: {
      resetSuperadminPassword: brief(reset),
      changeSuperadminEmail: brief(emailChange),
      deactivateOtherAdmin: brief(deactivateAdmin),
      deactivateSelf: brief(deactivateSelf),
      superadminEmail: superAfter.email,
      superadminStatus: superAfter.status,
      extraAdminStatus: extraAfter.status,
      selfStatus: selfAfter.status,
    },
  };
})()));

say("E reset keeps status", brief(await (async () => {
  const archivedAccount = await createAccount(superLogin.token, {
    firstName: "Archived",
    lastName: "Reset",
    email: `renta.e.archived.${stamp}@gmail.com`,
    phone: "09170001006",
    role: "tenant",
    password: pass,
  });
  const suspendedAccount = await createAccount(superLogin.token, {
    firstName: "Suspended",
    lastName: "Reset",
    email: `renta.e.suspended.${stamp}@gmail.com`,
    phone: "09170001007",
    role: "tenant",
    password: pass,
  });
  await api("PATCH", `/admin/users/${archivedAccount.user._id}/status`, {
    token: superLogin.token,
    body: { action: "archive", note: "Prompt E reset status check" },
  });
  await api("PATCH", `/admin/users/${suspendedAccount.user._id}/status`, {
    token: superLogin.token,
    body: { action: "deactivate", note: "Prompt E reset status check" },
  });

  async function resetOne(email) {
    const forgot = await api("POST", "/auth/forgot-password", { body: { email } });
    const code = await waitForOtp(email);
    const reset = code
      ? await api("POST", "/auth/reset-password", { body: { email, code, password: "Reset12345!" } })
      : { status: 0, json: { message: "OTP was not found in the API log." } };
    return { forgot: brief(forgot), codeFound: Boolean(code), reset: brief(reset) };
  }

  const archivedReset = await resetOne(archivedAccount.user.email);
  const suspendedReset = await resetOne(suspendedAccount.user.email);
  const users = await api("GET", "/admin/users", { token: superLogin.token });
  const archivedAfter = users.json.users.find((item) => item._id === archivedAccount.user._id);
  const suspendedAfter = users.json.users.find((item) => item._id === suspendedAccount.user._id);
  const archivedLogin = await login(archivedAccount.user.email, "Reset12345!");
  const suspendedLogin = await login(suspendedAccount.user.email, "Reset12345!");
  return {
    status: 200,
    json: {
      archivedReset,
      suspendedReset,
      archivedStatus: archivedAfter.status,
      suspendedStatus: suspendedAfter.status,
      archivedLogin: archivedLogin.status,
      suspendedLogin: { status: suspendedLogin.status, message: suspendedLogin.body?.message },
    },
  };
})()));

const unverifiedEmail = `renta.e.otp.${stamp}@gmail.com`;
const registered = await api("POST", "/auth/register", {
  body: {
    firstName: "Otp",
    lastName: "Wait",
    email: unverifiedEmail,
    phone: "09170001008",
    password: pass,
    role: "tenant",
  },
});
const unverifiedLogin = await login(unverifiedEmail, pass);
const resendSoon = await api("POST", "/auth/resend-otp", { body: { email: unverifiedEmail } });
const registeredAt = Date.now();

say("F production refusals", {
  otpLog: await runServer({ NODE_ENV: "production", OTP_LOG_CODE: "true" }, "OTP_LOG_CODE"),
  mock: await runServer({ NODE_ENV: "production", OTP_LOG_CODE: "false", PAYMONGO_MOCK: "true" }, "PAYMONGO_MOCK"),
  emptyKey: await runServer({
    NODE_ENV: "production",
    OTP_LOG_CODE: "false",
    PAYMONGO_MOCK: "false",
    DOCUMENT_ENCRYPTION_KEY: "",
  }, "DOCUMENT_ENCRYPTION_KEY"),
});

const remaining = 62000 - (Date.now() - registeredAt);
if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
const resendLater = await api("POST", "/auth/resend-otp", { body: { email: unverifiedEmail } });
say("G unverified resend", {
  register: brief(registered),
  login: { status: unverifiedLogin.status, body: unverifiedLogin.body ? { message: unverifiedLogin.body.message, needsOtp: unverifiedLogin.body.needsOtp } : null },
  resendImmediately: brief(resendSoon),
  resendAfter60s: brief(resendLater),
});
